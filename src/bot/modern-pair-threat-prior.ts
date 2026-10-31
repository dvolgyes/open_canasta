import { buildDecks, isWild } from "../canasta/cards";
import { type Seat, teamOf } from "../canasta/hand";
import type { ModernAction } from "../canasta/modern-hand";
import type { ModernHandView } from "../canasta/modern-view";
import { cardFace } from "../game/canasta-history";
import type { CardBelief } from "./card-knowledge";
import { relaxedPairChance } from "./relaxed-card-pair";

/** A relaxed pair signal, not a calibrated probability of taking the pile. */
export function modernPairThreatV1(
	view: ModernHandView,
	belief: CardBelief,
	action: ModernAction,
): number {
	if (action.type !== "discard") return 0;
	const card = view.hand.find((item) => item.id === action.card);
	if (!card) throw new Error("discard refers to a card outside the hand");
	if (isWild(card) || card.rank === "3") return 0;
	if (
		view.teams.some((team) =>
			team.melds.some(
				(meld) =>
					meld.kind === "natural" &&
					meld.rank === card.rank &&
					meld.cards.length === 7,
			),
		)
	)
		return 0;
	const next = ((view.turn + 1) % 4) as Seat;
	const existing = view.teams[teamOf(next)].melds.find(
		(meld) => meld.kind === "natural" && meld.rank === card.rank,
	);
	if (existing && existing.cards.length > 4) return 0;
	const faces = [
		...new Set(
			buildDecks()
				.filter((item) => item.rank === card.rank)
				.map(cardFace),
		),
	];
	const chance = relaxedPairChance(belief, [next, next + 4], faces);
	return chance === 0 ? 0 : -chance;
}
