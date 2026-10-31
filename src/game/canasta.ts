import { type CallRecords, parseCallRecords } from "../call/record";
import {
	type Action,
	applyAction as applyHandAction,
	buildDecks,
	type CanastaRules,
	type Card,
	CLASSIC_RULES,
	DRAW_TWO_RULES,
	type Seat as EngineSeat,
	FROZEN_PILE_RULES,
	type HandState,
	isRed3,
	type MatchState,
	nextHand,
	settleHand,
	startMatch,
	TWO_CANASTAS_RULES,
	VIENNESE_RULES,
	validateMeld,
	viewFor,
} from "../canasta";
import {
	isObject as isJsonObject,
	isNonNegativeInteger,
	type JsonObject,
	PROTOCOL_VERSION,
	type RuleVariant,
	SEATS,
	type Seat,
	type TableConfig,
} from "../protocol";
import { cryptoRandomBelow, type RandomBelow } from "../random";
import {
	type PublicHistory,
	parsePublicHistory,
	recordTransfer,
} from "./canasta-history";
import { createModernModule } from "./modern";
import type { ApplyContext, ApplyResult, GameModule } from "./module";
import {
	absence,
	applyCommonTableCommand,
	parseResetRequest,
	RESET_WAITING,
	type ResetRequest,
} from "./table-common";

export type { ResetRequest } from "./table-common";
export { waitingText } from "./table-common";

/**
 * One classic four-player partnership canasta table with its chat and call status.
 *
 * The state holds the whole match: every hand's cards, the stock and the pile, because the host and any
 * follower that takes over as host need them. A player's own hand is shown only in `viewFor`; the other
 * hands and the stock are hidden in the table screen, not in the replicated state.
 *
 * Commands:
 * - `{type: "chat", text}` and `{type: "media", ...}`: as in every table.
 * - `{type: "start"}`: the host deals the first hand. All four seats must be present.
 * - `{type: "action", match, hand, at, action}`: one step of the current hand, where `match`, `hand` and `at`
 *   identify the current position. A stale command is rejected, and the acting seat must be present.
 * - `{type: "next-hand"}`: after a hand is settled, the host deals the next one when all seats are present.
 * - `{type: "reset-request"}`, `{type: "reset-vote", requestId, approve}` and `{type: "reset-cancel", requestId}`:
 *   a reset clears the scores and ends the match once every other present player approves it. The host then
 *   deals a new match. While a reset waits for answers, the game is blocked.
 *
 * When a hand ends, the host settles its score in the same command, so the table never shows an unsettled
 * finished hand.
 */

export type CanastaState = {
	readonly history?: PublicHistory;
	readonly v: typeof PROTOCOL_VERSION;
	readonly tableId: string;
	readonly game: "canasta";
	readonly messages: number;
	readonly match: MatchState | null;
	/** Matches started at this table. A reset ends a match, so the host keys its start command by this count. */
	readonly matches: number;
	/** Accepted actions in the current hand. */
	readonly actions: number;
	/** A reset request that waits for answers. */
	readonly reset: ResetRequest | null;
	/** Each seat's latest call status. */
	readonly media: CallRecords;
};

/** Engine seats are numbered 0 to 3 in the order of `SEATS`, so partners N-S and E-W share a team. */
export function engineSeat(seat: Seat): EngineSeat {
	return SEATS.indexOf(seat) as EngineSeat;
}

export function tableSeat(seat: EngineSeat): Seat {
	const found = SEATS[seat];
	if (found === undefined) throw new Error(`no seat ${seat}`);
	return found;
}

const CARDS_BY_ID: ReadonlyMap<string, Card> = new Map(
	buildDecks().map((card) => [card.id, card]),
);

const TABLE_COMMANDS: readonly unknown[] = ["start", "action", "next-hand"];

const ACTION_TYPES: readonly unknown[] = [
	"draw",
	"takePile",
	"meld",
	"extend",
	"discard",
	"resetTurn",
];

function reject(reason: string): ApplyResult {
	return { ok: false, reason };
}

function accept(event: JsonObject, state: CanastaState): ApplyResult {
	return { ok: true, event, state };
}

function sameJson(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The engine rules of each variant that a table can choose. */
export const VARIANT_RULES: Readonly<Record<RuleVariant, CanastaRules>> = {
	classic: CLASSIC_RULES,
	"frozen-pile": FROZEN_PILE_RULES,
	"draw-two": DRAW_TWO_RULES,
	"two-canastas": TWO_CANASTAS_RULES,
	viennese: VIENNESE_RULES,
};
const RULE_PRESETS = Object.values(VARIANT_RULES);

/** The preset that the stored rules name, or undefined: a match plays only by a preset of this app version. */
function parseRules(value: unknown): CanastaRules | undefined {
	return RULE_PRESETS.find((rules) => sameJson(value, rules));
}

function parseCard(value: unknown): Card | undefined {
	if (!isJsonObject(value) || typeof value.id !== "string") return undefined;
	const card = CARDS_BY_ID.get(value.id);
	if (card === undefined) return undefined;
	return value.rank === card.rank && value.suit === card.suit
		? card
		: undefined;
}

function parseCards(value: unknown): Card[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const cards: Card[] = [];
	for (const item of value) {
		const card = parseCard(item);
		if (card === undefined) return undefined;
		cards.push(card);
	}
	return cards;
}

function isEngineSeat(value: unknown): value is EngineSeat {
	return value === 0 || value === 1 || value === 2 || value === 3;
}

function isScorePair(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		value.every(
			(score) => typeof score === "number" && Number.isSafeInteger(score),
		)
	);
}

function isOutcome(value: unknown): boolean {
	if (value === null) return true;
	if (!isJsonObject(value)) return false;
	if (value.kind === "stock") return true;
	return (
		value.kind === "out" &&
		isEngineSeat(value.seat) &&
		typeof value.concealed === "boolean" &&
		(value.concealedWithoutCanasta === undefined ||
			value.concealedWithoutCanasta === true)
	);
}

/** Checks the common hand and turn-start fields and requires one card of each of the 108. */
function validSnapshot(value: unknown, rules: CanastaRules): boolean {
	if (!isJsonObject(value)) return false;
	const {
		hands,
		stock,
		pile,
		teams,
		turn,
		dealer,
		phase,
		turnTaken,
		meldedSeats,
	} = value;
	if (
		turnTaken !== undefined &&
		!(
			Array.isArray(turnTaken) &&
			turnTaken.every((id) => typeof id === "string")
		)
	)
		return false;
	if (
		meldedSeats !== undefined &&
		!(Array.isArray(meldedSeats) && meldedSeats.every(isEngineSeat))
	)
		return false;
	if (!Array.isArray(hands) || hands.length !== 4) return false;
	const handCards = hands.map(parseCards);
	const stockCards = parseCards(stock);
	const pileCards = parseCards(pile);
	if (handCards.some((cards) => cards === undefined)) return false;
	if (stockCards === undefined || pileCards === undefined) return false;
	if (!isEngineSeat(turn) || !isEngineSeat(dealer)) return false;
	if (phase !== "draw" && phase !== "play") return false;
	if (!isScorePair(value.teamScores) || !isOutcome(value.outcome)) return false;
	if (
		!isNonNegativeInteger(value.turnActions) ||
		!isNonNegativeInteger(value.turnMeldPoints) ||
		!isNonNegativeInteger(value.nextMeldNo) ||
		value.nextMeldNo === 0
	)
		return false;
	if (!Array.isArray(teams) || teams.length !== 2) return false;
	if (parseRules(value.rules) !== rules) return false;
	const teamCards: Card[] = [];
	for (const [index, team] of teams.entries()) {
		if (
			!isJsonObject(team) ||
			typeof team.initialMade !== "boolean" ||
			!Array.isArray(team.melds)
		)
			return false;
		const red = parseCards(team.redThrees);
		if (red === undefined || !red.every(isRed3)) return false;
		teamCards.push(...red);
		for (const meld of team.melds) {
			if (!isJsonObject(meld) || typeof meld.id !== "string" || meld.id === "")
				return false;
			const cards = parseCards(meld.cards);
			if (cards === undefined || meld.team !== index) return false;
			const checked = validateMeld(cards, rules);
			if (!checked.ok || checked.rank !== meld.rank) return false;
			teamCards.push(...cards);
		}
	}
	const everyCard = [
		...handCards.flatMap((cards) => cards ?? []),
		...stockCards,
		...pileCards,
		...teamCards,
	];
	const distinct = new Set(everyCard.map((card) => card.id));
	return everyCard.length === 108 && distinct.size === 108;
}

/** Parses a hand only when its current and turn-start snapshots pass the same checks. */
function parseHand(value: unknown, rules: CanastaRules): HandState | undefined {
	if (!isJsonObject(value) || !validSnapshot(value, rules)) return undefined;
	const turnStart = value.turnStart;
	if (!isJsonObject(turnStart) || !validSnapshot(turnStart, rules))
		return undefined;
	return {
		...value,
		rules,
		turnStart: { ...turnStart, rules },
	} as unknown as HandState;
}

function parseMatch(value: unknown): MatchState | undefined {
	if (!isJsonObject(value)) return undefined;
	const { seed, handNo, dealer, scores, hand, settled, winner } = value;
	const rules = parseRules(value.rules);
	if (rules === undefined) return undefined;
	if (!isNonNegativeInteger(seed) || !isNonNegativeInteger(handNo))
		return undefined;
	if (handNo === 0) return undefined;
	if (!isEngineSeat(dealer)) return undefined;
	if (!isScorePair(scores)) return undefined;
	if (typeof settled !== "boolean") return undefined;
	if (winner !== null && winner !== 0 && winner !== 1) return undefined;
	const parsedHand = parseHand(hand, rules);
	if (parsedHand === undefined) return undefined;
	if (settled !== (parsedHand.outcome !== null)) return undefined;
	if (winner !== null && !settled) return undefined;
	return { ...value, rules, hand: parsedHand } as unknown as MatchState;
}

/** Returns the table state, or undefined when the value is not a canasta table with this identifier. */
export function parseCanastaState(
	value: unknown,
	tableId: string,
): CanastaState | undefined {
	if (!isJsonObject(value)) return undefined;
	const { v, game, messages, matches, match, actions, reset, media } = value;
	if (v !== PROTOCOL_VERSION || game !== "canasta") return undefined;
	if (value.tableId !== tableId) return undefined;
	if (!isNonNegativeInteger(messages) || !isNonNegativeInteger(actions))
		return undefined;
	if (!isNonNegativeInteger(matches)) return undefined;
	const parsedMatch = match === null ? null : parseMatch(match);
	if (parsedMatch === undefined) return undefined;
	if (parsedMatch !== null && matches === 0) return undefined;
	const parsedReset = parseResetRequest(reset);
	if (parsedReset === undefined) return undefined;
	if (parsedReset !== null && parsedMatch === null) return undefined;
	const parsedMedia = parseCallRecords(media);
	if (parsedMedia === undefined) return undefined;
	const history =
		value.history === undefined ? undefined : parsePublicHistory(value.history);
	if (value.history !== undefined && history === undefined) return undefined;
	if (history !== undefined && parsedMatch !== null) {
		const counts = [...history.initialCounts];
		for (const event of history.events)
			counts[event.player] =
				(counts[event.player] ?? 0) +
				event.drawn +
				event.gained.length -
				event.removed.length;
		if (
			parsedMatch.hand.hands.some((hand, seat) => hand.length !== counts[seat])
		)
			return undefined;
	}
	return {
		...(history === undefined ? {} : { history }),
		v: PROTOCOL_VERSION,
		tableId,
		game: "canasta",
		messages,
		matches,
		match: parsedMatch,
		actions,
		reset: parsedReset,
		media: parsedMedia,
	};
}

export function parseAction(value: unknown): Action | undefined {
	if (!isJsonObject(value)) return undefined;
	const { type } = value;
	if (!ACTION_TYPES.includes(type)) return undefined;
	const strings = (list: unknown): string[] | undefined =>
		Array.isArray(list) && list.every((id) => typeof id === "string")
			? (list as string[])
			: undefined;
	switch (type) {
		case "draw":
			return { type };
		case "resetTurn":
			return { type };
		case "takePile": {
			const cards = strings(value.cards);
			if (cards === undefined) return undefined;
			if (value.extend === undefined) return { type, cards };
			return typeof value.extend === "string"
				? { type, cards, extend: value.extend }
				: undefined;
		}
		case "meld": {
			const cards = strings(value.cards);
			return cards === undefined ? undefined : { type, cards };
		}
		case "extend": {
			const cards = strings(value.cards);
			return cards === undefined || typeof value.meldId !== "string"
				? undefined
				: { type, meldId: value.meldId, cards };
		}
		case "discard":
			return typeof value.card === "string"
				? { type, card: value.card }
				: undefined;
		default:
			return undefined;
	}
}

/** Settles a hand that just ended, so the score is added in the same command. */
function settleIfOver(match: MatchState): MatchState {
	if (match.hand.outcome === null) return match;
	const settled = settleHand(match);
	return settled.ok ? settled.match : match;
}

function applyStart(
	table: CanastaState,
	present: readonly Seat[],
	config: TableConfig,
	randomBelow: RandomBelow,
): ApplyResult {
	if (table.match !== null) return reject("the match has already started");
	if (table.reset) return RESET_WAITING;
	const waiting = absence(SEATS, present);
	if (waiting) return waiting;
	const seed = randomBelow(2 ** 32);
	const rules = VARIANT_RULES[config.rules ?? "classic"];
	const match = startMatch(seed, rules, randomBelow(4) as EngineSeat);
	return accept(
		{ kind: "start", handNo: match.handNo },
		{
			...table,
			matches: table.matches + 1,
			match,
			history: {
				initialCounts: match.hand.hands.map((cards) => cards.length),
				events: [],
			},
			actions: 0,
		},
	);
}

function applyTableAction(
	table: CanastaState,
	context: ApplyContext,
	payload: JsonObject,
): ApplyResult {
	const match = table.match;
	if (match === null) return reject("the match has not started");
	if (table.reset) return RESET_WAITING;
	if (match.settled || match.winner !== null)
		return reject("this hand is over; deal the next one");
	if (
		payload.hand !== match.handNo ||
		payload.at !== table.actions ||
		payload.match !== table.matches
	)
		return reject("the table has moved on since this action was chosen");
	const action = parseAction(payload.action);
	if (!action) return reject("not a valid action");
	const applied = applyHandAction(match.hand, engineSeat(context.seat), action);
	if (!applied.ok) return reject(applied.reason);
	const waiting = absence([context.seat], context.present);
	if (waiting) return waiting;
	const next = settleIfOver({ ...match, hand: applied.hand });
	return accept(
		{
			kind: "action",
			handNo: match.handNo,
			action: action as unknown as JsonObject,
		},
		{
			...table,
			match: next,
			actions: table.actions + 1,
			history: recordTransfer(
				table.history,
				match.hand,
				applied.hand,
				engineSeat(context.seat),
			),
		},
	);
}

function applyNextHand(
	table: CanastaState,
	present: readonly Seat[],
): ApplyResult {
	const match = table.match;
	if (match === null) return reject("the match has not started");
	if (table.reset) return RESET_WAITING;
	if (!match.settled) return reject("the hand is not over");
	if (match.winner !== null) return reject("the match is over");
	const waiting = absence(SEATS, present);
	if (waiting) return waiting;
	const step = nextHand(match);
	if (!step.ok) return reject(step.reason);
	return accept(
		{ kind: "next-hand", handNo: step.match.handNo },
		{
			...table,
			match: step.match,
			actions: 0,
			history: {
				initialCounts: step.match.hand.hands.map((cards) => cards.length),
				events: [],
			},
		},
	);
}

export function createCanastaModule(randomBelow: RandomBelow): GameModule {
	const modern = createModernModule(randomBelow);
	return {
		initialState(tableId, config) {
			if ((config.rules as string | undefined) === "modern")
				return modern.initialState(tableId, config);
			const state: CanastaState = {
				v: PROTOCOL_VERSION,
				tableId,
				game: "canasta",
				messages: 0,
				matches: 0,
				match: null,
				actions: 0,
				reset: null,
				media: {},
			};
			return state as unknown as JsonObject;
		},

		isState(state, tableId) {
			if (state.game === "canasta-modern")
				return modern.isState(state, tableId);
			return parseCanastaState(state, tableId) !== undefined;
		},

		apply(state, context, payload) {
			const modernRules =
				(context.config.rules as string | undefined) === "modern";
			if (state.game === "canasta-modern")
				return modernRules
					? modern.apply(state, context, payload)
					: reject("table rules do not match the game");
			if (modernRules) return reject("table rules do not match the game");
			const table = parseCanastaState(state, context.tableId);
			if (!table) return reject("table state is not a canasta game");
			if (!isJsonObject(payload)) return reject("command is not an object");
			if (payload.v !== PROTOCOL_VERSION)
				return reject("unsupported protocol version");
			if (payload.tableId !== context.tableId)
				return reject("command is for another table");
			const common = applyCommonTableCommand(table, context, payload);
			if (common !== undefined) return common;
			switch (payload.type) {
				case "start":
					return applyStart(
						table,
						context.present,
						context.config,
						randomBelow,
					);
				case "action":
					return applyTableAction(table, context, payload);
				case "next-hand":
					return applyNextHand(table, context.present);
				default:
					return reject("unknown command type");
			}
		},
		isRandomCommand(payload) {
			return (
				typeof payload === "object" &&
				payload !== null &&
				"type" in payload &&
				(payload.type === "start" || payload.type === "next-hand")
			);
		},
	};
}

export const canastaModule: GameModule = createCanastaModule(cryptoRandomBelow);

export function startPayload(tableId: string): JsonObject {
	return { v: PROTOCOL_VERSION, tableId, type: "start" };
}

/** An action at the current position of `match`. */
export function actionPayload(
	tableId: string,
	match: MatchState,
	accepted: number,
	action: Action,
	matches: number,
): JsonObject {
	return {
		v: PROTOCOL_VERSION,
		tableId,
		type: "action",
		hand: match.handNo,
		at: accepted,
		match: matches,
		action: action as unknown as JsonObject,
	};
}

export function nextHandPayload(tableId: string): JsonObject {
	return { v: PROTOCOL_VERSION, tableId, type: "next-hand" };
}

export function resetRequestPayload(tableId: string): JsonObject {
	return { v: PROTOCOL_VERSION, tableId, type: "reset-request" };
}

export function resetVotePayload(
	tableId: string,
	requestId: string,
	approve: boolean,
): JsonObject {
	return {
		v: PROTOCOL_VERSION,
		tableId,
		type: "reset-vote",
		requestId,
		approve,
	};
}

export function resetCancelPayload(
	tableId: string,
	requestId: string,
): JsonObject {
	return { v: PROTOCOL_VERSION, tableId, type: "reset-cancel", requestId };
}

/** Start, action and next-hand commands, as opposed to chat and call status. */
export function isTableCommand(payload: unknown): boolean {
	return isJsonObject(payload) && TABLE_COMMANDS.includes(payload.type);
}

/** The hand from one seat's point of view, for the table screen. */
export function handViewFor(match: MatchState, seat: Seat) {
	return viewFor(match.hand, engineSeat(seat));
}
