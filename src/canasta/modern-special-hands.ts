import { buildDecks, type Card, type Rank } from "./cards";

/** The five special hands in the provisional Canasta.com rules profile. */
export const MODERN_SPECIAL_HAND_SCORES = {
	"natural-pairs": 2500,
	"wild-pairs": 2000,
	"miami-pairs": 2500,
	garbage: 3000,
	"zip-code": 2500,
} as const;

export type ModernSpecialHandKind = keyof typeof MODERN_SPECIAL_HAND_SCORES;
export interface ModernSpecialHand {
	readonly kind: ModernSpecialHandKind;
	readonly score: number;
}

/** Return every valid special hand, using physical IDs to reject duplicate cards. */
export function modernSpecialHands(
	cards: readonly Card[],
): ModernSpecialHand[] {
	if (cards.length !== 14 || new Set(cards.map((card) => card.id)).size !== 14)
		return [];
	const deck = new Map(buildDecks().map((card) => [card.id, card]));
	if (
		cards.some((card) => {
			const actual = deck.get(card.id);
			return !actual || actual.rank !== card.rank || actual.suit !== card.suit;
		})
	)
		return [];
	const counts = new Map<Rank, number>();
	for (const card of cards)
		counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
	const count = (rank: Rank) => counts.get(rank) ?? 0;
	if (count("3") > 0) return [];
	const wilds = count("2") + count("JK");
	const natural = [...counts]
		.filter(([rank]) => rank !== "2" && rank !== "JK")
		.map(([, n]) => n)
		.toSorted((a, b) => a - b);
	const allGroups = [...counts.values()].toSorted((a, b) => a - b);
	const shape = (actual: readonly number[], expected: readonly number[]) =>
		actual.length === expected.length &&
		actual.every((n, i) => n === expected[i]);
	const matchingPair =
		(count("2") === 2 && count("JK") === 0) ||
		(count("2") === 0 && count("JK") === 2);
	const hasAceAndSeven = count("A") === 2 && count("7") === 2;
	const pairs = natural.every((n) => n === 2);
	const candidates: readonly [ModernSpecialHandKind, boolean][] = [
		["natural-pairs", pairs && natural.length === 7 && wilds === 0],
		[
			"wild-pairs",
			pairs && natural.length === 6 && hasAceAndSeven && matchingPair,
		],
		[
			"miami-pairs",
			pairs &&
				natural.length === 5 &&
				hasAceAndSeven &&
				count("2") === 2 &&
				count("JK") === 2,
		],
		["garbage", wilds === 0 && shape(natural, [3, 3, 4, 4])],
		["zip-code", shape(allGroups, [2, 2, 3, 3, 4])],
	];
	return candidates.flatMap(([kind, matches]) =>
		matches ? [{ kind, score: MODERN_SPECIAL_HAND_SCORES[kind] }] : [],
	);
}
