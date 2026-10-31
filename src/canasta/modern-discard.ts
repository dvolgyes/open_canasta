import { type Card, isWild, type Rank } from "./cards";

export interface ModernDiscardInput {
	readonly hand: readonly Card[];
	readonly card: string;
	readonly pileEmpty: boolean;
	readonly closedRanks: readonly Rank[];
	/** Whether the team's canastas, initial meld, and unfinished special melds permit going out. */
	readonly mayGoOut: boolean;
	/** The turn engine determines whether an all-wild hand was forced, rather than created deliberately. */
	readonly wildOnlyForced: boolean;
}

export type ModernDiscardResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/** Validate a discard; the turn engine owns subsequent turn, scoring, and retraction transitions. */
export function modernDiscardCheck(
	input: ModernDiscardInput,
): ModernDiscardResult {
	const fail = (reason: string): ModernDiscardResult => ({ ok: false, reason });
	if (new Set(input.hand.map((card) => card.id)).size !== input.hand.length)
		return fail("a card appears twice in the hand");
	const card = input.hand.find((item) => item.id === input.card);
	if (!card) return fail("the selected card is not in the hand");
	if (card.rank === "3") return fail("threes cannot be discarded");
	if (
		input.pileEmpty &&
		(card.rank === "7" ||
			card.rank === "A" ||
			isWild(card) ||
			input.closedRanks.includes(card.rank))
	)
		return fail(
			"sevens, wild cards, aces, and dead cards cannot be discarded on an empty pile",
		);
	const goesOut = input.hand.length === 1;
	if (goesOut && !input.mayGoOut) return fail("the side cannot go out");
	if (
		isWild(card) &&
		!goesOut &&
		(!input.wildOnlyForced || input.hand.some((item) => !isWild(item)))
	)
		return fail("a wild card can be discarded only when forced or going out");
	return { ok: true };
}
