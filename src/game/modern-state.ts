import { buildDecks, type Card } from "../canasta/cards";
import type { Seat } from "../canasta/hand";
import { MODERN_RULES_VERSION } from "../canasta/modern-hand";
import type { ModernMatchState } from "../canasta/modern-match";
import { modernMeldTransition } from "../canasta/modern-melds";
import { modernSpecialHands } from "../canasta/modern-special-hands";
import { modernScoreHand } from "../canasta/modern-special-scoring";
import { isNonNegativeInteger, isObject } from "../protocol";

const DECK = new Map(buildDecks().map((card) => [card.id, card]));

function isSeat(value: unknown): value is Seat {
	return value === 0 || value === 1 || value === 2 || value === 3;
}

function scores(value: unknown): value is [number, number] {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		value.every(
			(score) => typeof score === "number" && Number.isSafeInteger(score),
		)
	);
}

function cards(value: unknown): Card[] | undefined {
	if (!Array.isArray(value) || value.length > DECK.size) return undefined;
	const result: Card[] = [];
	for (const item of value) {
		if (!isObject(item) || typeof item.id !== "string") return undefined;
		const card = DECK.get(item.id);
		if (!card || item.rank !== card.rank || item.suit !== card.suit)
			return undefined;
		result.push(card);
	}
	return result;
}

/** Check all physical cards and fields used by the modern rules engine in one snapshot. */
function validSnapshot(value: unknown): boolean {
	if (!isObject(value) || value.rulesVersion !== MODERN_RULES_VERSION)
		return false;
	if (!isSeat(value.dealer) || !isSeat(value.turn) || !scores(value.teamScores))
		return false;
	if (
		value.phase !== "draw" &&
		value.phase !== "play" &&
		value.phase !== "pile-opening"
	)
		return false;
	if (!isNonNegativeInteger(value.nextMeldNo) || value.nextMeldNo === 0)
		return false;
	if (
		!Array.isArray(value.turnTaken) ||
		value.turnTaken.length > DECK.size ||
		!value.turnTaken.every((id) => typeof id === "string" && DECK.has(id)) ||
		new Set(value.turnTaken).size !== value.turnTaken.length
	)
		return false;
	if (!Array.isArray(value.hands) || value.hands.length !== 4) return false;
	if (!Array.isArray(value.bonuses) || value.bonuses.length !== 4) return false;
	const hands = value.hands.map(cards);
	const bonuses = value.bonuses.map(cards);
	const stock = cards(value.stock);
	const pile = cards(value.pile);
	if (
		hands.some((hand) => !hand) ||
		bonuses.some((bonus) => !bonus) ||
		!stock ||
		!pile
	)
		return false;
	if (!Array.isArray(value.teams) || value.teams.length !== 2) return false;
	const exposed: Card[] = [];
	const meldIds = new Set<string>();
	for (const team of value.teams) {
		if (
			!isObject(team) ||
			typeof team.opened !== "boolean" ||
			!Array.isArray(team.melds) ||
			team.melds.length > DECK.size
		)
			return false;
		const threes = cards(team.threes);
		if (!threes || threes.some((card) => card.rank !== "3")) return false;
		exposed.push(...threes);
		const ranks = new Set<string>();
		for (const meld of team.melds) {
			if (
				!isObject(meld) ||
				typeof meld.id !== "string" ||
				!/^m[1-9]\d{0,15}$/.test(meld.id) ||
				!Number.isSafeInteger(Number(meld.id.slice(1))) ||
				Number(meld.id.slice(1)) >= value.nextMeldNo ||
				meldIds.has(meld.id)
			)
				return false;
			meldIds.add(meld.id);
			const meldCards = cards(meld.cards);
			if (!meldCards) return false;
			const check = modernMeldTransition({
				previous: [],
				added: meldCards,
				opening: true,
				closedRanks: [],
				unfinishedWildMeld: false,
			});
			if (!check.ok || check.kind !== meld.kind) return false;
			if (check.kind === "natural") {
				if (meld.rank !== check.rank || ranks.has(check.rank)) return false;
				ranks.add(check.rank);
			}
			exposed.push(...meldCards);
		}
	}
	const all = [
		...hands.flatMap((hand) => hand ?? []),
		...bonuses.flatMap((bonus) => bonus ?? []),
		...stock,
		...pile,
		...exposed,
	];
	if (
		all.length !== DECK.size ||
		new Set(all.map((card) => card.id)).size !== DECK.size
	)
		return false;
	const outcome = value.outcome;
	if (outcome === null) return true;
	if (!isObject(outcome)) return false;
	if (outcome.kind === "stock") return true;
	if (!isSeat(outcome.seat)) return false;
	if (outcome.kind === "out") return hands[outcome.seat]?.length === 0;
	return (
		outcome.kind === "special" &&
		typeof outcome.score === "number" &&
		modernSpecialHands(hands[outcome.seat] ?? []).some(
			(special) => special.score === outcome.score,
		)
	);
}

/** Parse a replicated match before it reaches rendering, search, or command application. */
export function parseModernMatch(value: unknown): ModernMatchState | undefined {
	if (
		!isObject(value) ||
		!isNonNegativeInteger(value.seed) ||
		value.seed > 0xffffffff ||
		!isNonNegativeInteger(value.handNo) ||
		value.handNo === 0 ||
		!isSeat(value.dealer) ||
		!scores(value.scores) ||
		typeof value.settled !== "boolean" ||
		(value.winner !== null && value.winner !== 0 && value.winner !== 1)
	)
		return undefined;
	const hand = value.hand;
	if (
		!isObject(hand) ||
		!validSnapshot(hand) ||
		!validSnapshot(hand.turnStart) ||
		!Array.isArray(hand.undo) ||
		hand.undo.length > DECK.size ||
		!hand.undo.every(validSnapshot)
	)
		return undefined;
	const handScores = hand.teamScores;
	if (!scores(handScores)) return undefined;
	const linked = (snapshot: unknown): boolean =>
		isObject(snapshot) &&
		snapshot.dealer === hand.dealer &&
		snapshot.turn === hand.turn &&
		scores(snapshot.teamScores) &&
		snapshot.teamScores.every((score, index) => score === handScores[index]);
	if (!linked(hand.turnStart) || !hand.undo.every(linked)) return undefined;
	if (
		hand.dealer !== value.dealer ||
		value.settled !== (hand.outcome !== null) ||
		(!value.settled && value.winner !== null)
	)
		return undefined;
	const match = value as unknown as ModernMatchState;
	if (
		!match.settled &&
		(match.scores[0] !== match.hand.teamScores[0] ||
			match.scores[1] !== match.hand.teamScores[1])
	)
		return undefined;
	if (match.settled) {
		const result = modernScoreHand(match.hand);
		if (
			!result ||
			match.scores.some(
				(score, index) =>
					score !==
					(match.hand.teamScores[index] ?? 0) + (result[index]?.total ?? 0),
			)
		)
			return undefined;
		const expected =
			Math.max(...match.scores) < 8500 || match.scores[0] === match.scores[1]
				? null
				: match.scores[0] > match.scores[1]
					? 0
					: 1;
		if (match.winner !== expected) return undefined;
	}
	return match;
}
