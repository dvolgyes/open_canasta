/** Score threshold and the meld total a side needs for its first meld. */
export interface InitialMeldStep {
	/** Applies while the side's score is at least this value. */
	readonly fromScore: number;
	readonly minimum: number;
}

/** Every value that changes the game lives here, so a variant is a different object, not different code. */
export interface CanastaRules {
	readonly targetScore: number;
	readonly handSize: number;
	readonly drawCount: number;
	readonly maxWildsPerMeld: number;
	readonly canastaSize: number;
	readonly naturalCanastaBonus: number;
	readonly mixedCanastaBonus: number;
	readonly redThreeBonus: number;
	/** Added to the red three score when one side holds all four; it is subtracted when the side has not melded. */
	readonly allRedThreesBonus: number;
	readonly outBonus: number;
	readonly concealedOutBonus: number;
	/**
	 * Added to the out bonus when a player goes out concealed but lays no canasta of their own, so the side's
	 * earlier canasta permits it. With 0, such a player does not go out concealed.
	 */
	readonly concealedWithoutCanastaBonus: number;
	/** A player who takes the pile in the turn of going out can still go out concealed. */
	readonly concealedAfterPickup: boolean;
	/** The canastas that a side must hold before it may go out. */
	readonly canastasToGoOut: number;
	/** The pile is always frozen: only a natural pair from the hand takes it. */
	readonly pileAlwaysFrozen: boolean;
	/** A side cannot take the pile while its top card is of a rank in which the side holds a canasta. */
	readonly canastaRankBlocksPile: boolean;
	/** A meld may not hold more wild cards than natural cards. */
	readonly wildsAtMostNaturals: boolean;
	/** Red threes count positive only for a side with a canasta; otherwise, for a side that made its initial meld. */
	readonly redThreesNeedCanasta: boolean;
	/** Sorted by fromScore ascending. */
	readonly initialMeld: readonly InitialMeldStep[];
}

/** Classic partnership canasta, 2 decks, target 5000. */
export const CLASSIC_RULES: CanastaRules = {
	targetScore: 5000,
	handSize: 11,
	drawCount: 1,
	maxWildsPerMeld: 3,
	canastaSize: 7,
	naturalCanastaBonus: 500,
	mixedCanastaBonus: 300,
	redThreeBonus: 100,
	allRedThreesBonus: 400,
	outBonus: 100,
	concealedOutBonus: 100,
	concealedWithoutCanastaBonus: 0,
	concealedAfterPickup: true,
	canastasToGoOut: 1,
	pileAlwaysFrozen: false,
	canastaRankBlocksPile: false,
	wildsAtMostNaturals: false,
	redThreesNeedCanasta: false,
	initialMeld: [
		// A negative score needs 15, which any valid meld reaches.
		{ fromScore: Number.MIN_SAFE_INTEGER, minimum: 15 },
		{ fromScore: 0, minimum: 50 },
		{ fromScore: 1500, minimum: 90 },
		{ fromScore: 3000, minimum: 120 },
	],
};

/** Classic, but only a natural pair from the hand takes the pile (Pagat: "discard pile always frozen"). */
export const FROZEN_PILE_RULES: CanastaRules = {
	...CLASSIC_RULES,
	pileAlwaysFrozen: true,
};

/** Classic, but a player draws two cards from the stock and still discards one. */
export const DRAW_TWO_RULES: CanastaRules = { ...CLASSIC_RULES, drawCount: 2 };

/** Classic, but a side needs two canastas before it may go out. */
export const TWO_CANASTAS_RULES: CanastaRules = {
	...CLASSIC_RULES,
	canastasToGoOut: 2,
};

/**
 * Viennese canasta, as Pagat states it. Going out concealed with a canasta of one's own ("Hand-Canasta") gives
 * 1000 in place of the out bonus, and without one ("Verdeckt Ausmachen") 200; a pickup in that turn forfeits both.
 * A discard of a rank in which the next side holds a canasta blocks the pile for that side, as a black three does.
 */
export const VIENNESE_RULES: CanastaRules = {
	...CLASSIC_RULES,
	concealedOutBonus: 900,
	concealedWithoutCanastaBonus: 100,
	concealedAfterPickup: false,
	canastaRankBlocksPile: true,
	wildsAtMostNaturals: true,
	redThreesNeedCanasta: true,
};

/** A side below the first threshold (including negative scores) uses the first step. */
export function initialMeldMinimum(
	steps: readonly InitialMeldStep[],
	teamScore: number,
): number {
	let minimum = steps[0]?.minimum;
	if (minimum === undefined)
		throw new Error("the rules define no initial meld steps");
	for (const step of steps) {
		if (teamScore >= step.fromScore) minimum = step.minimum;
	}
	return minimum;
}
