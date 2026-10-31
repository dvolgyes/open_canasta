import { type CallRecords, parseCallRecords } from "../call/record";
import { buildDecks } from "../canasta/cards";
import type { Seat as EngineSeat } from "../canasta/hand";
import { type ModernAction, modernApplyAction } from "../canasta/modern-hand";
import {
	type ModernMatchState,
	modernNextHand,
	modernSettleHand,
	modernStartMatch,
} from "../canasta/modern-match";
import {
	MODERN_SPECIAL_HAND_SCORES,
	type ModernSpecialHandKind,
} from "../canasta/modern-special-hands";
import {
	isNonNegativeInteger,
	isObject,
	type JsonObject,
	PROTOCOL_VERSION,
	SEATS,
} from "../protocol";
import type { RandomBelow } from "../random";
import {
	type ModernPublicHistory,
	modernHistoryCounts,
	parseModernPublicHistory,
	recordModernTransfer,
} from "./modern-history";
import { parseModernMatch } from "./modern-state";
import type { ApplyContext, ApplyResult, GameModule } from "./module";
import {
	absence,
	applyCommonTableCommand,
	parseResetRequest,
	RESET_WAITING,
	type ResetRequest,
} from "./table-common";

export interface ModernState {
	readonly v: typeof PROTOCOL_VERSION;
	readonly tableId: string;
	readonly game: "canasta-modern";
	readonly messages: number;
	readonly matches: number;
	readonly match: ModernMatchState | null;
	readonly actions: number;
	readonly reset: ResetRequest | null;
	readonly media: CallRecords;
	readonly history?: ModernPublicHistory;
}

const CARD_IDS = new Set(buildDecks().map((card) => card.id));

export function parseModernState(
	value: unknown,
	tableId: string,
): ModernState | undefined {
	if (
		!isObject(value) ||
		value.v !== PROTOCOL_VERSION ||
		value.tableId !== tableId ||
		value.game !== "canasta-modern"
	)
		return undefined;
	if (
		!isNonNegativeInteger(value.messages) ||
		!isNonNegativeInteger(value.matches) ||
		!isNonNegativeInteger(value.actions)
	)
		return undefined;
	const match = value.match === null ? null : parseModernMatch(value.match);
	if (match === undefined || (match !== null && value.matches === 0))
		return undefined;
	const reset = parseResetRequest(value.reset);
	const media = parseCallRecords(value.media);
	const history =
		value.history === undefined
			? undefined
			: parseModernPublicHistory(value.history);
	if (
		reset === undefined ||
		media === undefined ||
		(reset !== null && match === null) ||
		(value.history !== undefined && !history) ||
		(history !== undefined &&
			match !== null &&
			modernHistoryCounts(history).some(
				(count, index) =>
					count !== [...match.hand.hands, ...match.hand.bonuses][index]?.length,
			))
	)
		return undefined;
	return {
		v: PROTOCOL_VERSION,
		tableId,
		game: "canasta-modern",
		messages: value.messages,
		matches: value.matches,
		match,
		actions: value.actions,
		reset,
		media,
		...(history === undefined ? {} : { history }),
	};
}

/** Validate the command shape before passing it to the modern rules engine. */
export function parseModernAction(value: unknown): ModernAction | undefined {
	if (!isObject(value)) return undefined;
	switch (value.type) {
		case "draw":
		case "undo":
		case "retract":
		case "commit-opening":
		case "commit-pile":
			return { type: value.type };
		case "discard":
			return typeof value.card === "string" && CARD_IDS.has(value.card)
				? { type: "discard", card: value.card }
				: undefined;
		case "special":
			return typeof value.kind === "string" &&
				Object.hasOwn(MODERN_SPECIAL_HAND_SCORES, value.kind)
				? { type: "special", kind: value.kind as ModernSpecialHandKind }
				: undefined;
		case "meld":
		case "extend":
		case "take-pile": {
			const list = value.cards;
			if (
				!Array.isArray(list) ||
				list.length === 0 ||
				list.length > 7 ||
				!list.every((id) => typeof id === "string" && CARD_IDS.has(id)) ||
				new Set(list).size !== list.length
			)
				return undefined;
			if (value.type === "take-pile")
				return list.length === 2
					? { type: "take-pile", cards: list }
					: undefined;
			if (value.type === "meld") return { type: "meld", cards: list };
			return typeof value.meldId === "string" &&
				/^m[1-9]\d{0,15}$/.test(value.meldId)
				? { type: "extend", meldId: value.meldId, cards: list }
				: undefined;
		}
		default:
			return undefined;
	}
}

export function createModernModule(randomBelow: RandomBelow): GameModule {
	const reject = (reason: string): ApplyResult => ({ ok: false, reason });
	const accept = (event: JsonObject, state: ModernState): ApplyResult => ({
		ok: true,
		event,
		state: state as unknown as JsonObject,
	});
	return {
		initialState(tableId) {
			const state: ModernState = {
				v: PROTOCOL_VERSION,
				tableId,
				game: "canasta-modern",
				messages: 0,
				matches: 0,
				match: null,
				actions: 0,
				reset: null,
				media: {},
			};
			return state as unknown as JsonObject;
		},
		isState: (state, tableId) => parseModernState(state, tableId) !== undefined,
		apply(state, context: ApplyContext, payload) {
			const table = parseModernState(state, context.tableId);
			if (!table) return reject("table state is not a modern canasta game");
			if (!isObject(payload)) return reject("command is not an object");
			if (payload.v !== PROTOCOL_VERSION)
				return reject("unsupported protocol version");
			if (payload.tableId !== context.tableId)
				return reject("command is for another table");
			const common = applyCommonTableCommand(table, context, payload);
			if (common !== undefined) return common;
			if (table.reset) return RESET_WAITING;
			if (payload.type === "start") {
				if (table.match !== null)
					return reject("the match has already started");
				const waiting = absence(SEATS, context.present);
				if (waiting) return waiting;
				const started = modernStartMatch(
					randomBelow(2 ** 32),
					randomBelow(4) as EngineSeat,
				);
				if (!started.ok) return reject(started.reason);
				return accept(
					{ kind: "start", handNo: started.match.handNo },
					{
						...table,
						matches: table.matches + 1,
						match: started.match,
						actions: 0,
						history: undefined,
					},
				);
			}
			const match = table.match;
			if (match === null) return reject("the match has not started");
			if (payload.type === "next-hand") {
				const waiting = absence(SEATS, context.present);
				if (waiting) return waiting;
				const next = modernNextHand(match);
				if (!next.ok) return reject(next.reason);
				return accept(
					{ kind: "next-hand", handNo: next.match.handNo },
					{ ...table, match: next.match, actions: 0, history: undefined },
				);
			}
			if (payload.type !== "action") return reject("unknown command type");
			if (match.settled || match.winner !== null)
				return reject("this hand is over; deal the next one");
			if (
				payload.hand !== match.handNo ||
				payload.at !== table.actions ||
				payload.match !== table.matches
			)
				return reject("the table has moved on since this action was chosen");
			const action = parseModernAction(payload.action);
			if (!action) return reject("not a valid action");
			const seat = SEATS.indexOf(context.seat) as EngineSeat;
			const applied = modernApplyAction(match.hand, seat, action);
			if (!applied.ok) return reject(applied.reason);
			const waiting = absence([context.seat], context.present);
			if (waiting) return waiting;
			let next: ModernMatchState = { ...match, hand: applied.hand };
			if (applied.hand.outcome !== null) {
				const settled = modernSettleHand(next);
				if (!settled.ok) return reject(settled.reason);
				next = settled.match;
			}
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
					history: recordModernTransfer(
						table.history,
						match.hand,
						applied.hand,
					),
				},
			);
		},
		isRandomCommand: (payload) =>
			isObject(payload) &&
			(payload.type === "start" || payload.type === "next-hand"),
	};
}
