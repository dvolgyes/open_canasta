import { type Card, isWild, type Rank } from "./cards";

export interface ModernMeldTransition {
	/** Cards already on the table in this meld, or an empty list for a new meld. */
	readonly previous: readonly Card[];
	readonly added: readonly Card[];
	/** True throughout the team's opening turn, before the initial meld is committed. */
	readonly opening: boolean;
	readonly closedRanks: readonly Rank[];
	/** An incomplete wild-only meld of this team exists. */
	readonly unfinishedWildMeld: boolean;
}

export type ModernMeldCheck =
	| { readonly ok: true; readonly kind: "wild" }
	| { readonly ok: true; readonly kind: "natural"; readonly rank: Rank }
	| { readonly ok: false; readonly reason: string };

/** Check one modern meld or extension. Opening totals and going out are checked by the turn engine. */
export function modernMeldTransition(
	input: ModernMeldTransition,
): ModernMeldCheck {
	const { previous, added, opening, closedRanks, unfinishedWildMeld } = input;
	const fail = (reason: string): ModernMeldCheck => ({ ok: false, reason });
	if (!added.length) return fail("add at least one card");
	if (previous.length > 0 && previous.length < 3)
		return fail("the existing meld is incomplete");
	const cards = [...previous, ...added];
	if (new Set(cards.map((card) => card.id)).size !== cards.length)
		return fail("a card was selected twice");
	if (cards.length < 3 || cards.length > 7)
		return fail("a meld needs three to seven cards");
	const naturals = cards.filter((card) => !isWild(card));
	const wilds = cards.length - naturals.length;
	if (!naturals.length) {
		if (unfinishedWildMeld && previous.length === 0)
			return fail("the side already has an incomplete wild meld");
		return { ok: true, kind: "wild" };
	}
	const rank = naturals[0]?.rank;
	if (!rank || rank === "3" || naturals.some((card) => card.rank !== rank))
		return fail("natural cards must share a permitted rank");
	if (previous.length > 0 && previous.every(isWild))
		return fail("a wild meld cannot become a natural meld");
	if (closedRanks.includes(rank))
		return fail("the rank is closed by a canasta");
	if (naturals.length < 2 || wilds > 2)
		return fail("a mixed meld needs two naturals and at most two wild cards");
	if (rank === "7" && wilds > 0) return fail("sevens must be natural");
	if (added.some(isWild) && unfinishedWildMeld)
		return fail("finish the wild meld before adding wild cards elsewhere");
	if (
		rank === "A" &&
		added.some(isWild) &&
		((previous.length > 0 && previous.every((card) => !isWild(card))) ||
			(previous.length === 0 && !opening))
	)
		return fail(
			"aces may become mixed only when first melded during the opening",
		);
	if (added.some(isWild) && !opening && naturals.length < 5)
		return fail("at least five naturals are needed before adding wild cards");
	return { ok: true, kind: "natural", rank };
}
