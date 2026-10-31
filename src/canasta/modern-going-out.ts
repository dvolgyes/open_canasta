import type { Card } from "./cards";
import { modernMeldTransition } from "./modern-melds";
import { modernSpecialMeldScore } from "./modern-special-scoring";

export interface ModernGoingOutInput {
	readonly melds: readonly (readonly Card[])[];
	/** The opening has been committed or the current turn has fulfilled its requirements. */
	readonly openingSatisfied: boolean;
}

export type ModernGoingOutResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/** Check the team's table requirements; the turn engine also checks the final discard. */
export function modernGoingOutCheck(
	input: ModernGoingOutInput,
): ModernGoingOutResult {
	if (!input.openingSatisfied)
		return { ok: false, reason: "the side has not made its initial meld" };
	const cards = input.melds.flat();
	if (new Set(cards.map((card) => card.id)).size !== cards.length)
		return { ok: false, reason: "a card appears more than once" };
	for (const meld of input.melds) {
		const check = modernMeldTransition({
			previous: [],
			added: meld,
			opening: true,
			closedRanks: [],
			unfinishedWildMeld: false,
		});
		if (!check.ok) return check;
		if (meld.length < 7 && modernSpecialMeldScore(meld) !== null)
			return {
				ok: false,
				reason: "an ace, seven, or wild meld remains incomplete",
			};
	}
	if (input.melds.filter((meld) => meld.length === 7).length < 2)
		return { ok: false, reason: "the side needs two canastas to go out" };
	return { ok: true };
}
