import { type Card, isWild, type Rank } from "./cards";
import { modernMeldTransition } from "./modern-melds";
import { modernCardPoints } from "./modern-special-scoring";

export interface ModernOpeningInput {
	readonly teamScore: number;
	/** The opening melds; a card can occur in only one meld. */
	readonly melds: readonly (readonly Card[])[];
	/** Cards from the pile do not count toward the opening, including the top card. */
	readonly ineligible: readonly string[];
}

export type ModernOpeningResult =
	| { readonly ok: true; readonly points: number; readonly minimum: number }
	| {
			readonly ok: false;
			readonly reason: string;
			readonly points?: number;
			readonly minimum?: number;
	  };

/** Validate a proposed opening, including its clean triple and eligible-card points. */
export function modernOpeningCheck(
	input: ModernOpeningInput,
): ModernOpeningResult {
	if (!Number.isSafeInteger(input.teamScore))
		return { ok: false, reason: "invalid team score" };
	const all = input.melds.flat();
	if (new Set(all.map((card) => card.id)).size !== all.length)
		return { ok: false, reason: "a card appears more than once" };
	const ranks = new Set<Rank>();
	let incompleteWild = 0;
	for (const meld of input.melds) {
		const check = modernMeldTransition({
			previous: [],
			added: meld,
			opening: true,
			closedRanks: [],
			unfinishedWildMeld: false,
		});
		if (!check.ok) return { ok: false, reason: check.reason };
		if (check.kind === "wild") {
			incompleteWild += Number(meld.length < 7);
			if (incompleteWild > 1)
				return { ok: false, reason: "multiple incomplete wild melds" };
		} else {
			if (meld.length === 7 && meld.some(isWild))
				return {
					ok: false,
					reason: "a mixed canasta cannot be part of the initial meld",
				};
			if (ranks.has(check.rank))
				return { ok: false, reason: "duplicate meld rank" };
			ranks.add(check.rank);
		}
	}
	const ineligible = new Set(input.ineligible);
	const points = all
		.filter((card) => !ineligible.has(card.id))
		.reduce((sum, card) => sum + modernCardPoints(card), 0);
	const minimum =
		input.teamScore < 3000 ? 125 : input.teamScore < 5000 ? 155 : 180;
	const clean = input.melds.some(
		(meld) =>
			!meld.some(isWild) &&
			meld.filter((card) => !ineligible.has(card.id)).length >= 3,
	);
	if (!clean)
		return {
			ok: false,
			reason: "opening needs a clean triple",
			points,
			minimum,
		};
	if (points < minimum)
		return {
			ok: false,
			reason: "opening points below minimum",
			points,
			minimum,
		};
	return { ok: true, points, minimum };
}
