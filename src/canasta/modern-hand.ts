import { buildDecks, type Card, isWild, type Rank } from "./cards";
import { type Seat, teamOf } from "./hand";
import { modernDiscardCheck } from "./modern-discard";
import { modernGoingOutCheck } from "./modern-going-out";
import { modernMeldTransition } from "./modern-melds";
import { modernOpeningCheck } from "./modern-opening";
import {
	type ModernSpecialHandKind,
	modernSpecialHands,
} from "./modern-special-hands";
import { mulberry32, shuffle } from "./random";

export const MODERN_RULES_VERSION = "canasta-com-modern-v1" as const;

export type ModernMeld =
	| {
			readonly id: string;
			readonly kind: "natural";
			readonly rank: Rank;
			readonly cards: readonly Card[];
	  }
	| {
			readonly id: string;
			readonly kind: "wild";
			readonly cards: readonly Card[];
	  };

export interface ModernTeamState {
	readonly melds: readonly ModernMeld[];
	/** Both red and black threes are exposed and scored by color. */
	readonly threes: readonly Card[];
	readonly opened: boolean;
}

export type ModernOutcome =
	| { readonly kind: "out"; readonly seat: Seat }
	| { readonly kind: "stock" }
	| { readonly kind: "special"; readonly seat: Seat; readonly score: number };

export interface ModernHandSnapshot {
	readonly rulesVersion: typeof MODERN_RULES_VERSION;
	readonly teamScores: readonly [number, number];
	readonly dealer: Seat;
	readonly turn: Seat;
	readonly phase: "draw" | "play" | "pile-opening";
	readonly hands: readonly [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	];
	/** The top of the stock is at index zero; the last eight cards are below the turn card. */
	readonly stock: readonly Card[];
	/** The top of the discard pile is the last element. */
	readonly pile: readonly Card[];
	readonly teams: readonly [ModernTeamState, ModernTeamState];
	/** Face-down bonus cards, kept separate until their recipient's next turn. */
	readonly bonuses: readonly [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	];
	readonly turnTaken: readonly string[];
	readonly nextMeldNo: number;
	readonly outcome: ModernOutcome | null;
}

export interface ModernHandState extends ModernHandSnapshot {
	/** The turn's reversible baseline, after a stock draw or before a pile pickup. */
	readonly turnStart: ModernHandSnapshot;
	/** Prior positions for retracting individual actions without returning a drawn card to the stock. */
	readonly undo: readonly ModernHandSnapshot[];
}

export interface ModernNewHandInput {
	readonly seed: number;
	readonly dealer: Seat;
	readonly teamScores: readonly [number, number];
}

export type ModernNewHandResult =
	| { readonly ok: true; readonly hand: ModernHandState }
	| { readonly ok: false; readonly reason: string };

export type ModernAction =
	| { readonly type: "draw" }
	| { readonly type: "undo" }
	| { readonly type: "commit-opening" }
	| { readonly type: "take-pile"; readonly cards: readonly string[] }
	| { readonly type: "commit-pile" }
	| { readonly type: "special"; readonly kind: ModernSpecialHandKind }
	| { readonly type: "discard"; readonly card: string }
	| { readonly type: "meld"; readonly cards: readonly string[] }
	| {
			readonly type: "extend";
			readonly meldId: string;
			readonly cards: readonly string[];
	  };
export type ModernStep =
	| { readonly ok: true; readonly hand: ModernHandState }
	| { readonly ok: false; readonly reason: string };

/** Deal 13 cards, then expose and replace all threes in clockwise seat order. */
export function modernNewHand(input: ModernNewHandInput): ModernNewHandResult {
	if (
		typeof input !== "object" ||
		input === null ||
		!Number.isSafeInteger(input.seed) ||
		input.seed < 0 ||
		input.seed > 0xffffffff ||
		![0, 1, 2, 3].includes(input.dealer) ||
		!Array.isArray(input.teamScores) ||
		input.teamScores.length !== 2 ||
		input.teamScores.some((score) => !Number.isSafeInteger(score))
	)
		return { ok: false, reason: "invalid modern hand setup" };
	const deck = shuffle(buildDecks(), mulberry32(input.seed));
	const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
	const threes: [Card[], Card[]] = [[], []];
	let cursor = 0;
	for (let offset = 1; offset <= 4; offset++) {
		const seat = ((input.dealer + offset) % 4) as Seat;
		for (let count = 0; count < 13; count++) {
			const card = deck[cursor++];
			if (!card)
				return { ok: false, reason: "the deck ran out during the deal" };
			hands[seat].push(card);
		}
	}
	for (let offset = 1; offset <= 4; offset++) {
		const seat = ((input.dealer + offset) % 4) as Seat;
		let index = hands[seat].findIndex((card) => card.rank === "3");
		while (index !== -1) {
			const card = hands[seat].splice(index, 1)[0];
			const replacement = deck[cursor++];
			if (!card || !replacement)
				return { ok: false, reason: "the deck ran out replacing threes" };
			threes[teamOf(seat)].push(card);
			hands[seat].push(replacement);
			index = hands[seat].findIndex((item) => item.rank === "3");
		}
	}
	const base: ModernHandSnapshot = {
		rulesVersion: MODERN_RULES_VERSION,
		teamScores: [input.teamScores[0], input.teamScores[1]],
		dealer: input.dealer,
		turn: ((input.dealer + 1) % 4) as Seat,
		phase: "draw",
		hands,
		stock: deck.slice(cursor),
		pile: [],
		teams: [
			{ melds: [], threes: threes[0], opened: false },
			{ melds: [], threes: threes[1], opened: false },
		],
		bonuses: [[], [], [], []],
		turnTaken: [],
		nextMeldNo: 1,
		outcome: null,
	};
	return { ok: true, hand: { ...base, turnStart: base, undo: [] } };
}

function modernApplyMeld(
	hand: ModernHandState,
	seat: Seat,
	action: Extract<ModernAction, { type: "meld" | "extend" }>,
): ModernStep {
	const fail = (reason: string): ModernStep => ({ ok: false, reason });
	if (hand.phase === "draw")
		return fail("draw or take the pile before melding");
	if (
		!Array.isArray(action.cards) ||
		action.cards.length === 0 ||
		action.cards.length > 7 ||
		action.cards.some((id) => typeof id !== "string" || id.length > 32)
	)
		return fail("invalid selected cards");
	if (new Set(action.cards).size !== action.cards.length)
		return fail("a card was selected twice");
	const own = hand.hands[seat];
	const selected: Card[] = [];
	for (const id of action.cards) {
		const card = own.find((item) => item.id === id);
		if (!card) return fail("a selected card is not in the hand");
		selected.push(card);
	}
	const selectedIds = new Set(action.cards);
	const remaining = own.filter((card) => !selectedIds.has(card.id));
	if (remaining.length === 0 && hand.phase !== "pile-opening")
		return fail("keep a card for the final discard");
	const team = teamOf(seat);
	const teamState = hand.teams[team];
	const existing =
		action.type === "extend"
			? teamState.melds.find((meld) => meld.id === action.meldId)
			: undefined;
	if (action.type === "extend" && !existing)
		return fail("no such meld on your side");
	const closedRanks = hand.teams.flatMap((side) =>
		side.melds.flatMap((meld) =>
			meld.kind === "natural" && meld.cards.length === 7 ? [meld.rank] : [],
		),
	);
	const check = modernMeldTransition({
		previous: existing?.cards ?? [],
		added: selected,
		opening: !hand.teams[team].opened,
		closedRanks,
		unfinishedWildMeld: teamState.melds.some(
			(meld) => meld.kind === "wild" && meld.cards.length < 7,
		),
	});
	if (!check.ok) return check;
	if (
		existing &&
		(existing.kind !== check.kind ||
			(existing.kind === "natural" &&
				check.kind === "natural" &&
				existing.rank !== check.rank))
	)
		return fail("the cards do not match the existing meld");
	if (
		!existing &&
		check.kind === "natural" &&
		teamState.melds.some(
			(meld) => meld.kind === "natural" && meld.rank === check.rank,
		)
	)
		return fail("extend the existing meld of this rank");
	const cards = [...(existing?.cards ?? []), ...selected];
	const id = existing?.id ?? `m${hand.nextMeldNo}`;
	const meld: ModernMeld =
		check.kind === "wild"
			? { id, kind: "wild", cards }
			: { id, kind: "natural", rank: check.rank, cards };
	const melds = existing
		? teamState.melds.map((item) => (item.id === existing.id ? meld : item))
		: [...teamState.melds, meld];
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.hands];
	hands[seat] = remaining;
	const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
	teams[team] = { ...teamState, melds };
	const { turnStart: _turnStart, undo: _undo, ...before } = hand;
	return {
		ok: true,
		hand: {
			...before,
			hands,
			teams,
			nextMeldNo: existing ? hand.nextMeldNo : hand.nextMeldNo + 1,
			turnStart: hand.turnStart,
			undo: [...hand.undo, before],
		},
	};
}

/** Apply a modern action. A drawn card cannot be returned to the stock by undo. */
export function modernApplyAction(
	hand: ModernHandState,
	seat: Seat,
	action: ModernAction,
): ModernStep {
	if (hand.rulesVersion !== MODERN_RULES_VERSION)
		return { ok: false, reason: "unsupported modern rules version" };
	if (hand.outcome !== null) return { ok: false, reason: "the hand is over" };
	if (hand.turn !== seat)
		return { ok: false, reason: "it is not this seat's turn" };
	if (typeof action !== "object" || action === null)
		return { ok: false, reason: "invalid modern action" };
	if (action.type === "undo") {
		const previous = hand.undo.at(-1);
		if (!previous) return { ok: false, reason: "nothing to undo this turn" };
		return {
			ok: true,
			hand: {
				...previous,
				turnStart: hand.turnStart,
				undo: hand.undo.slice(0, -1),
			},
		};
	}
	if (action.type === "meld" || action.type === "extend")
		return modernApplyMeld(hand, seat, action);
	if (action.type === "take-pile")
		return modernTakePile(hand, seat, action.cards);
	if (action.type === "commit-pile") return modernCommitPile(hand, seat);
	if (action.type === "special") {
		const side = hand.teams[teamOf(seat)];
		if (
			hand.phase !== "play" ||
			hand.turnStart.phase !== "play" ||
			side.opened ||
			side.melds.length !== 0
		)
			return {
				ok: false,
				reason: "a special hand must follow a stock draw before the team opens",
			};
		const special = modernSpecialHands(hand.hands[seat]).find(
			(item) => item.kind === action.kind,
		);
		if (!special)
			return { ok: false, reason: "the cards do not form that special hand" };
		return {
			ok: true,
			hand: {
				...hand,
				outcome: { kind: "special", seat, score: special.score },
			},
		};
	}
	if (action.type === "discard")
		return modernApplyDiscard(hand, seat, action.card);
	if (action.type === "commit-opening") {
		if (hand.phase !== "play")
			return { ok: false, reason: "the opening cannot be committed now" };
		const team = teamOf(seat);
		if (hand.teams[team].opened)
			return { ok: false, reason: "the side has already opened" };
		const check = modernOpeningCheck({
			teamScore: hand.teamScores[team],
			melds: hand.teams[team].melds.map((meld) => meld.cards),
			ineligible: hand.turnStart.pile.map((card) => card.id),
		});
		if (!check.ok) return { ok: false, reason: check.reason };
		const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
		teams[team] = { ...teams[team], opened: true };
		const { turnStart: _turnStart, undo: _undo, ...before } = hand;
		return {
			ok: true,
			hand: {
				...before,
				teams,
				turnStart: hand.turnStart,
				undo: [...hand.undo, before],
			},
		};
	}
	if (action.type !== "draw")
		return { ok: false, reason: "unknown modern action" };
	if (hand.phase !== "draw")
		return { ok: false, reason: "this turn has already drawn" };
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.hands];
	const own = [...hands[seat]];
	const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
	const team = teamOf(seat);
	const exposed = [...teams[team].threes];
	let cursor = 0;
	let ended = hand.stock.length === 0;
	let taken: Card | undefined;
	while (cursor < hand.stock.length) {
		const card = hand.stock[cursor++];
		if (!card) return { ok: false, reason: "invalid stock" };
		if (card.rank !== "3") {
			own.push(card);
			taken = card;
			break;
		}
		if (cursor === hand.stock.length) {
			own.push(card);
			taken = card;
			ended = true;
			break;
		}
		exposed.push(card);
	}
	hands[seat] = own;
	teams[team] = { ...teams[team], threes: exposed };
	const { turnStart: _turnStart, undo: _undo, ...snapshot } = hand;
	const base: ModernHandSnapshot = {
		...snapshot,
		hands,
		teams,
		stock: hand.stock.slice(cursor),
		phase: "play",
		turnTaken: taken ? [taken.id] : [],
		outcome: ended ? { kind: "stock" } : null,
	};
	return { ok: true, hand: { ...base, turnStart: base, undo: [] } };
}

function modernTakePile(
	hand: ModernHandState,
	seat: Seat,
	ids: readonly string[],
): ModernStep {
	const fail = (reason: string): ModernStep => ({ ok: false, reason });
	if (hand.phase !== "draw")
		return fail("the pile can only be taken at the start of a turn");
	const top = hand.pile.at(-1);
	if (!top || isWild(top) || top.rank === "3")
		return fail("the pile has no eligible top card");
	if (
		!Array.isArray(ids) ||
		ids.length !== 2 ||
		ids.some((id) => typeof id !== "string") ||
		ids[0] === ids[1]
	)
		return fail("select two different matching natural cards");
	const selected = ids.map((id) =>
		hand.hands[seat].find((card) => card.id === id),
	);
	const first = selected[0];
	const second = selected[1];
	if (
		!first ||
		!second ||
		first.rank !== top.rank ||
		second.rank !== top.rank ||
		isWild(first) ||
		isWild(second)
	)
		return fail("two matching natural cards are required");
	const team = teamOf(seat);
	const side = hand.teams[team];
	const existing = side.melds.find(
		(meld) => meld.kind === "natural" && meld.rank === top.rank,
	);
	const closedRanks = hand.teams.flatMap((teamState) =>
		teamState.melds.flatMap((meld) =>
			meld.kind === "natural" && meld.cards.length === 7 ? [meld.rank] : [],
		),
	);
	const check = modernMeldTransition({
		previous: existing?.cards ?? [],
		added: [first, second, top],
		opening: !side.opened,
		closedRanks,
		unfinishedWildMeld: side.melds.some(
			(meld) => meld.kind === "wild" && meld.cards.length < 7,
		),
	});
	if (!check.ok) return check;
	if (check.kind !== "natural") return fail("the pile top must be natural");
	const meld: ModernMeld = {
		id: existing?.id ?? `m${hand.nextMeldNo}`,
		kind: "natural",
		rank: check.rank,
		cards: [...(existing?.cards ?? []), first, second, top],
	};
	const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
	teams[team] = {
		...side,
		melds: existing
			? side.melds.map((item) => (item.id === existing.id ? meld : item))
			: [...side.melds, meld],
	};
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.hands];
	const remainder = hand.pile.slice(0, -1);
	hands[seat] = [
		...hand.hands[seat].filter((card) => !ids.includes(card.id)),
		...(side.opened ? remainder : []),
	];
	const { turnStart: _turnStart, undo: _undo, ...before } = hand;
	return {
		ok: true,
		hand: {
			...before,
			hands,
			teams,
			pile: side.opened ? [] : remainder,
			phase: side.opened ? "play" : "pile-opening",
			turnTaken: hand.pile.map((card) => card.id),
			nextMeldNo: existing ? hand.nextMeldNo : hand.nextMeldNo + 1,
			turnStart: before,
			undo: [...hand.undo, before],
		},
	};
}

function modernCommitPile(hand: ModernHandState, seat: Seat): ModernStep {
	if (hand.phase !== "pile-opening")
		return { ok: false, reason: "no pile opening is in progress" };
	const team = teamOf(seat);
	const check = modernOpeningCheck({
		teamScore: hand.teamScores[team],
		melds: hand.teams[team].melds.map((meld) => meld.cards),
		ineligible: hand.turnStart.pile.map((card) => card.id),
	});
	if (!check.ok) return check;
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.hands];
	hands[seat] = [...hands[seat], ...hand.pile];
	const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
	teams[team] = { ...teams[team], opened: true };
	const { turnStart: _turnStart, undo: _undo, ...before } = hand;
	return {
		ok: true,
		hand: {
			...before,
			hands,
			teams,
			pile: [],
			phase: "play",
			turnStart: hand.turnStart,
			undo: [...hand.undo, before],
		},
	};
}

function modernApplyDiscard(
	hand: ModernHandState,
	seat: Seat,
	id: string,
): ModernStep {
	if (hand.phase !== "play")
		return {
			ok: false,
			reason: "finish drawing and opening before discarding",
		};
	if (typeof id !== "string" || id.length > 32)
		return { ok: false, reason: "invalid discard" };
	const team = teamOf(seat);
	const side = hand.teams[team];
	let opened = side.opened;
	if (!opened && side.melds.length > 0) {
		const check = modernOpeningCheck({
			teamScore: hand.teamScores[team],
			melds: side.melds.map((meld) => meld.cards),
			ineligible: hand.turnStart.pile.map((card) => card.id),
		});
		if (!check.ok) return { ok: false, reason: check.reason };
		opened = true;
	}
	const canGoOut = modernGoingOutCheck({
		melds: side.melds.map((meld) => meld.cards),
		openingSatisfied: opened,
	}).ok;
	const closedRanks = hand.teams.flatMap((side) =>
		side.melds.flatMap((meld) =>
			meld.kind === "natural" && meld.cards.length === 7 ? [meld.rank] : [],
		),
	);
	const fromPile = new Set(hand.turnTaken);
	const wasForced =
		hand.turnStart.hands[seat].every(isWild) &&
		hand.turnStart.pile.filter((card) => fromPile.has(card.id)).every(isWild);
	const check = modernDiscardCheck({
		hand: hand.hands[seat],
		card: id,
		pileEmpty: hand.pile.length === 0,
		closedRanks,
		mayGoOut: canGoOut,
		wildOnlyForced: wasForced,
	});
	if (!check.ok) return check;
	const card = hand.hands[seat].find((item) => item.id === id);
	if (!card)
		return { ok: false, reason: "the selected card is not in the hand" };
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.hands];
	hands[seat] = hands[seat].filter((item) => item.id !== id);
	const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
	teams[team] = { ...side, opened };
	const bonuses: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.bonuses];
	const goesOut = hands[seat].length === 0;
	const openedThisTurn = !hand.turnStart.teams[team].opened && opened;
	const eligibleBonus =
		openedThisTurn &&
		hand.turnStart.phase === "play" &&
		!goesOut &&
		hand.stock.length > 8;
	const bonusCount = eligibleBonus
		? Math.min(teams[team === 0 ? 1 : 0].opened ? 3 : 4, hand.stock.length - 8)
		: 0;
	bonuses[seat] = [...bonuses[seat], ...hand.stock.slice(0, bonusCount)];
	const { turnStart: _turnStart, undo: _undo, ...before } = hand;
	const nextSeat = ((seat + 1) % 4) as Seat;
	const base: ModernHandSnapshot = {
		...before,
		hands,
		teams,
		bonuses,
		stock: hand.stock.slice(bonusCount),
		pile: [...hand.pile, card],
		turn: goesOut ? seat : nextSeat,
		phase: "draw",
		turnTaken: [],
		outcome: goesOut ? { kind: "out", seat } : null,
	};
	const activated = goesOut
		? { ok: true as const, snapshot: base }
		: modernActivateBonus(base, nextSeat);
	if (!activated.ok) return activated;
	const next = activated.snapshot;
	return { ok: true, hand: { ...next, turnStart: next, undo: [] } };
}

/** Reveal the next player's bonus cards and replace any threes at the start of that turn. */
function modernActivateBonus(
	hand: ModernHandSnapshot,
	seat: Seat,
):
	| { readonly ok: true; readonly snapshot: ModernHandSnapshot }
	| { readonly ok: false; readonly reason: string } {
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.hands];
	const own = [...hands[seat], ...hand.bonuses[seat]];
	const bonuses: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...hand.bonuses];
	bonuses[seat] = [];
	const teams: [ModernTeamState, ModernTeamState] = [...hand.teams];
	const team = teamOf(seat);
	const exposed = [...teams[team].threes];
	let cursor = 0;
	let ended = hand.stock.length === 0;
	let index = own.findIndex((card) => card.rank === "3");
	while (!ended && index !== -1) {
		const card = own[index];
		const replacement = hand.stock[cursor];
		if (!card || !replacement)
			return { ok: false, reason: "invalid bonus or stock" };
		own.splice(index, 1);
		cursor++;
		exposed.push(card);
		own.push(replacement);
		if (cursor === hand.stock.length) ended = true;
		index = own.findIndex((item) => item.rank === "3");
	}
	hands[seat] = own;
	teams[team] = { ...teams[team], threes: exposed };
	return {
		ok: true,
		snapshot: {
			...hand,
			hands,
			bonuses,
			teams,
			stock: hand.stock.slice(cursor),
			outcome: ended ? { kind: "stock" } : null,
		},
	};
}
