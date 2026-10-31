import { type Seat, teamOf } from "../canasta/hand";
import type { ModernAction } from "../canasta/modern-hand";
import { modernCardPoints } from "../canasta/modern-special-scoring";
import type { ModernHandView } from "../canasta/modern-view";

/** A speculative score-risk signal based only on public counts and the actor's hand. */
export function modernDiscardRiskV1(
	view: ModernHandView,
	action: ModernAction,
): number {
	if (action.type !== "discard") return 0;
	const card = view.hand.find((item) => item.id === action.card);
	if (!card) throw new Error("discard refers to a card outside the hand");
	if (
		![0, 1, 2, 3].includes(view.turn) ||
		view.handCounts.length !== 4 ||
		view.bonusCounts.length !== 4 ||
		[...view.handCounts, ...view.bonusCounts].some(
			(count) => !Number.isSafeInteger(count) || count < 0 || count > 108,
		) ||
		[...view.handCounts, ...view.bonusCounts].reduce(
			(total, count) => total + count,
			0,
		) > 108
	)
		throw new Error("invalid public card counts");
	const counts = ([0, 1, 2, 3] as const)
		.filter((seat: Seat) => teamOf(seat) !== teamOf(view.turn))
		.map(
			(seat) => (view.handCounts[seat] ?? 0) + (view.bonusCounts[seat] ?? 0),
		);
	const minimum = Math.min(...counts);
	return (Math.max(0, 4 - minimum) / 3) * (modernCardPoints(card) / 20);
}
