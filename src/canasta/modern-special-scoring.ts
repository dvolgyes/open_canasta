import { type Card, cardPoints, isBlack3, isRed3, isWild } from "./cards";

/** A three remaining in the hand has a face-value penalty of five, regardless of suit. */
export function modernCardPoints(card: Card): number {
	return card.rank === "3" ? 5 : cardPoints(card);
}

/** Score exposed threes separately by color, depending on the team's completed canastas. */
export function modernThreesScore(
	threes: readonly Card[],
	canastas: number,
): number | undefined {
	const values = [0, 100, 300, 500, 1000] as const;
	const red = threes.filter(isRed3).length;
	const black = threes.filter(isBlack3).length;
	const redScore = values[red];
	const blackScore = values[black];
	if (
		red + black !== threes.length ||
		redScore === undefined ||
		blackScore === undefined ||
		!Number.isSafeInteger(canastas) ||
		canastas < 0
	)
		return undefined;
	const score = redScore + blackScore;
	return score === 0 || canastas === 1 ? 0 : canastas === 0 ? -score : score;
}

/**
 * Special base score of a legal modern meld, or null when ordinary canasta scoring applies.
 * Card face values are scored separately. The rules engine must validate the meld before calling this function.
 */
export function modernSpecialMeldScore(cards: readonly Card[]): number | null {
	const wildCount = cards.filter(isWild).length;
	if (wildCount === cards.length && wildCount > 0) {
		if (cards.length < 7) return -2000;
		const jokers = cards.filter((card) => card.rank === "JK").length;
		return jokers === 0 ? 3000 : jokers === 4 ? 2500 : 2000;
	}
	const rank = cards.find((card) => !isWild(card))?.rank;
	if (wildCount === 0 && (rank === "7" || rank === "A"))
		return cards.length < 7 ? -2500 : 2500;
	return null;
}

/** Extra penalties for three or more aces or sevens in the same player's hand, excluding face values. */
export function modernHandThresholdPenalty(
	hands: readonly [readonly Card[], readonly Card[]],
): number {
	return hands.reduce(
		(sum, hand) =>
			sum -
			1500 * Number(hand.filter((card) => card.rank === "7").length >= 3) -
			1500 * Number(hand.filter((card) => card.rank === "A").length >= 3),
		0,
	);
}

export interface ModernTeamScoreInput {
	/** Melds have already passed modern legality checks; wild-only melds have no natural rank. */
	readonly melds: readonly (readonly Card[])[];
	readonly threes: readonly Card[];
	readonly hands: readonly [readonly Card[], readonly Card[]];
	readonly wentOut: boolean;
	/** The engine validates and scores the declared special hand before passing its score here. */
	readonly specialHandScore?: number;
}

export interface ModernTeamScore {
	readonly melds: number;
	readonly canastas: number;
	readonly threes: number;
	readonly specialPenalties: number;
	readonly handPenalty: number;
	readonly outBonus: number;
	readonly specialHand: number;
	readonly total: number;
}

/** Score one team at the end of a modern hand; undefined denotes an invalid score input. */
export function modernTeamScore(
	input: ModernTeamScoreInput,
): ModernTeamScore | undefined {
	const allCards = [
		...input.melds.flat(),
		...input.threes,
		...input.hands.flat(),
	];
	if (new Set(allCards.map((card) => card.id)).size !== allCards.length)
		return undefined;
	if (input.specialHandScore !== undefined) {
		if (
			!Number.isSafeInteger(input.specialHandScore) ||
			input.specialHandScore < 0
		)
			return undefined;
		return {
			melds: 0,
			canastas: 0,
			threes: 0,
			specialPenalties: 0,
			handPenalty: 0,
			outBonus: 0,
			specialHand: input.specialHandScore,
			total: input.specialHandScore,
		};
	}
	const count = input.melds.filter((meld) => meld.length === 7).length;
	const threes = modernThreesScore(input.threes, count);
	if (threes === undefined) return undefined;
	const meldPoints = input.melds
		.flat()
		.reduce((sum, card) => sum + modernCardPoints(card), 0);
	const melds = count === 0 && meldPoints !== 0 ? -meldPoints : meldPoints;
	const canastas = input.melds.reduce((sum, meld) => {
		const special = modernSpecialMeldScore(meld);
		if (special !== null) return sum + special;
		return sum + (meld.length === 7 ? (meld.some(isWild) ? 300 : 500) : 0);
	}, 0);
	const specialPenalties = modernHandThresholdPenalty(input.hands);
	const handPoints = input.hands
		.flat()
		.reduce((sum, card) => sum + modernCardPoints(card), 0);
	const handPenalty = handPoints === 0 ? 0 : -handPoints;
	const outBonus = input.wentOut ? 100 : 0;
	return {
		melds,
		canastas,
		threes,
		specialPenalties,
		handPenalty,
		outBonus,
		specialHand: 0,
		total:
			melds + canastas + threes + specialPenalties + handPenalty + outBonus,
	};
}
