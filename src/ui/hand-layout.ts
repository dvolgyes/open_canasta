/**
 * Pure ordering of a canasta hand. The DOM layer sorts with these functions and only places the result.
 */

/** The rank order of a canasta hand: 3 is lowest, the 2 is high, and jokers come last. */
const RANK_ORDER: readonly string[] = [
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"J",
	"Q",
	"K",
	"A",
	"2",
	"JK",
];

/** The suit order of a canasta hand. Jokers have no suit and sort after every suit. */
const SUIT_ORDER: readonly string[] = ["C", "D", "H", "S"];

function rankIndex(rank: string): number {
	const index = RANK_ORDER.indexOf(rank);
	return index === -1 ? RANK_ORDER.length : index;
}

function suitIndex(suit: string | null): number {
	return suit === null ? SUIT_ORDER.length : SUIT_ORDER.indexOf(suit);
}

/** A new array with the melds by rank, as the hand orders ranks: 3 to A. Melds of equal rank keep their order. */
export function sortMelds<T extends { readonly rank: string }>(
	melds: readonly T[],
): T[] {
	return [...melds].sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
}

/**
 * A new array with the cards by rank: 3 to A, then 2, then jokers; within a rank, clubs, diamonds, hearts, spades.
 * The input is not changed. Equal cards keep their input order.
 */
export function sortHand<
	T extends { readonly rank: string; readonly suit: string | null },
>(cards: readonly T[]): T[] {
	const compare = (a: T, b: T): number =>
		rankIndex(a.rank) - rankIndex(b.rank) ||
		suitIndex(a.suit) - suitIndex(b.suit);
	return [...cards].sort(compare);
}
