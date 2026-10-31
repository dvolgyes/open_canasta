import { isWild } from "../canasta/cards";
import { teamOf } from "../canasta/hand";
import {
	type ModernAction,
	type ModernHandState,
	type ModernMeld,
	modernApplyAction,
} from "../canasta/modern-hand";

export interface ModernPriorFeatures {
	readonly cardsMelded: number;
	readonly wildSpent: number;
	readonly specialExposure: number;
	readonly sevenComplete: number;
	readonly aceComplete: number;
	readonly wildComplete: number;
	readonly otherComplete: number;
	readonly discardPair: number;
	readonly sevenHeldRelief: number;
	readonly aceHeldRelief: number;
	readonly discardDanger: number;
	readonly opening: number;
	readonly pileSize: number;
	readonly specialEnd: number;
}

export type ModernPriorWeights = {
	readonly [K in keyof ModernPriorFeatures]: number;
};

/** Handcrafted starting values are hypotheses, not trained coefficients. */
export const MODERN_PRIOR_WEIGHTS: ModernPriorWeights = {
	cardsMelded: 4,
	wildSpent: 10,
	specialExposure: 65,
	sevenComplete: 100,
	aceComplete: 100,
	wildComplete: 75,
	otherComplete: 45,
	discardPair: 10,
	sevenHeldRelief: 55,
	aceHeldRelief: 55,
	discardDanger: 18,
	opening: 20,
	pileSize: 3,
	specialEnd: 150,
};

function incompleteSpecial(meld: ModernMeld): boolean {
	return (
		meld.cards.length < 7 &&
		(meld.kind === "wild" ||
			(meld.kind === "natural" &&
				(meld.rank === "7" ||
					(meld.rank === "A" && meld.cards.every((card) => !isWild(card))))))
	);
}

function complete(
	meld: ModernMeld,
	kind: "7" | "A" | "wild" | "other",
): boolean {
	if (meld.cards.length !== 7) return false;
	if (kind === "wild") return meld.kind === "wild";
	if (meld.kind !== "natural") return false;
	if (kind === "7") return meld.rank === "7";
	if (kind === "A")
		return meld.rank === "A" && meld.cards.every((card) => !isWild(card));
	return meld.rank !== "7" && (meld.rank !== "A" || meld.cards.some(isWild));
}

/** Features depend only on the acting hand, public cards, and the resulting action. */
export function modernPriorFeatures(
	hand: ModernHandState,
	action: ModernAction,
): ModernPriorFeatures {
	const seat = hand.turn;
	const team = teamOf(seat);
	const side = hand.teams[team];
	const step = modernApplyAction(hand, seat, action);
	if (!step.ok)
		throw new Error(`cannot score an illegal action: ${step.reason}`);
	const next = step.hand;
	const after = next.teams[team];
	const difference = (predicate: (meld: ModernMeld) => boolean) =>
		after.melds.filter(predicate).length - side.melds.filter(predicate).length;
	const selected =
		action.type === "meld" ||
		action.type === "extend" ||
		action.type === "take-pile"
			? hand.hands[seat].filter((card) => action.cards.includes(card.id))
			: [];
	const discard =
		action.type === "discard"
			? hand.hands[seat].find((card) => card.id === action.card)
			: undefined;
	const held = (rank: "7" | "A") =>
		hand.hands[seat].filter((card) => card.rank === rank).length;
	const opponent = hand.teams[team === 0 ? 1 : 0];
	return {
		cardsMelded: selected.filter((card) => !isWild(card)).length,
		wildSpent: -selected.filter(isWild).length,
		specialExposure:
			side.melds.filter(incompleteSpecial).length -
			after.melds.filter(incompleteSpecial).length,
		sevenComplete: difference((meld) => complete(meld, "7")),
		aceComplete: difference((meld) => complete(meld, "A")),
		wildComplete: difference((meld) => complete(meld, "wild")),
		otherComplete: difference((meld) => complete(meld, "other")),
		discardPair: discard
			? -hand.hands[seat].filter(
					(card) => card.rank === discard.rank && card.id !== discard.id,
				).length
			: 0,
		sevenHeldRelief: Number(discard?.rank === "7" && held("7") === 3),
		aceHeldRelief: Number(discard?.rank === "A" && held("A") === 3),
		discardDanger:
			discard &&
			opponent.melds.some(
				(meld) =>
					meld.kind === "natural" &&
					meld.rank === discard.rank &&
					meld.cards.length < 5,
			)
				? -1
				: 0,
		opening: Number(!side.opened && after.opened),
		pileSize: action.type === "take-pile" ? hand.pile.length : 0,
		specialEnd: Number(next.outcome?.kind === "special"),
	};
}

export function modernPriorValue(
	features: ModernPriorFeatures,
	weights: ModernPriorWeights,
): number {
	const keys = Object.keys(
		MODERN_PRIOR_WEIGHTS,
	) as (keyof ModernPriorFeatures)[];
	if (keys.some((key) => !Number.isFinite(weights[key])))
		throw new Error("invalid modern prior weights");
	return Math.tanh(
		keys.reduce((sum, key) => sum + features[key] * weights[key], 0) / 100,
	);
}
