/** Trainable action features; the legacy heuristic and rollout policy stay frozen. */
import {
	type Action,
	applyAction,
	cardPoints,
	type HandState,
	initialMeldMinimum,
	isCanasta,
	isWild,
	type Seat,
	teamOf,
} from "../canasta";

export const REFERENCE_PRIOR = Object.freeze({
	draw: 10,
	takePile: 30,
	pileCards: 1,
	meld: 40,
	extend: 35,
	tableCards: 3,
	naturalBonus: 0.1,
	mixedBonus: 0.1,
	firstMeld: 40,
	wildSpent: -25,
	discard: 20,
	discardPoints: -0.1,
	discardWild: -40,
	singleton: 3,
	reset: -50,
	goingOut: 1000,
});
export type PriorFeature = keyof typeof REFERENCE_PRIOR;
export type PriorWeights = Readonly<Record<PriorFeature, number>>;
export const PRIOR_FEATURES = Object.freeze(
	Object.keys(REFERENCE_PRIOR) as PriorFeature[],
);

/** A complete finite vector is required, so a typo cannot silently disable a feature. */
export function validPriorWeights(value: unknown): value is PriorWeights {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const entries = Object.entries(value);
	return (
		entries.length === PRIOR_FEATURES.length &&
		entries.every(
			([key, weight]) =>
				PRIOR_FEATURES.includes(key as PriorFeature) &&
				typeof weight === "number" &&
				Number.isFinite(weight) &&
				Math.abs(weight) <= 10000,
		)
	);
}

export function priorFeatures(
	hand: HandState,
	seat: Seat,
	action: Action,
): PriorWeights {
	const features = Object.fromEntries(
		PRIOR_FEATURES.map((key) => [key, 0]),
	) as Record<PriorFeature, number>;
	const step = applyAction(hand, seat, action);
	if (step.ok && step.hand.outcome?.kind === "out") {
		features.goingOut = 1;
		return features;
	}
	const own = hand.hands[seat] ?? [];
	switch (action.type) {
		case "draw":
			features.draw = 1;
			break;
		case "resetTurn":
			features.reset = 1;
			break;
		case "discard": {
			const card = own.find((c) => c.id === action.card);
			if (!card) throw new Error("prior requires a card in the acting hand");
			features.discard = 1;
			features.discardPoints = cardPoints(card);
			features.discardWild = Number(isWild(card));
			features.singleton = Number(
				own.filter((c) => c.rank === card.rank).length === 1,
			);
			break;
		}
		case "meld":
		case "extend":
		case "takePile": {
			features[action.type] = 1;
			if (action.type === "takePile") features.pileCards = hand.pile.length;
			else features.tableCards = action.cards.length;
			features.wildSpent = own.filter(
				(c) => action.cards.includes(c.id) && isWild(c),
			).length;
			const team = teamOf(seat);
			const before = new Set(
				hand.teams[team].melds
					.filter((m) => isCanasta(m, hand.rules))
					.map((m) => m.id),
			);
			if (step.ok) {
				for (const meld of step.hand.teams[team].melds) {
					if (!isCanasta(meld, hand.rules) || before.has(meld.id)) continue;
					if (meld.cards.some(isWild))
						features.mixedBonus += hand.rules.mixedCanastaBonus;
					else features.naturalBonus += hand.rules.naturalCanastaBonus;
				}
				features.firstMeld = Number(
					!hand.teams[team].initialMade &&
						step.hand.turnMeldPoints >=
							initialMeldMinimum(hand.rules.initialMeld, hand.teamScores[team]),
				);
			}
			break;
		}
	}
	return features;
}

export function weightedPriorScore(
	features: PriorWeights,
	weights: PriorWeights,
): number {
	return PRIOR_FEATURES.reduce(
		(sum, key) => sum + features[key] * weights[key],
		0,
	);
}
