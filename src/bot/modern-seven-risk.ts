import { teamOf } from "../canasta/hand";
import {
	type ModernAction,
	type ModernHandState,
	type ModernMeld,
	modernApplyAction,
} from "../canasta/modern-hand";

function committedSevens(melds: readonly ModernMeld[]): number {
	return melds.reduce(
		(total, meld) =>
			total +
			(meld.kind === "natural" && meld.rank === "7" ? meld.cards.length : 0),
		0,
	);
}

/** Versioned experimental feature; only opposing committed melds are permanent blockers. */
export function modernSevenBlockedV1(
	hand: ModernHandState,
	action: ModernAction,
): number {
	const team = teamOf(hand.turn);
	const step = modernApplyAction(hand, hand.turn, action);
	if (!step.ok)
		throw new Error(`cannot score an illegal action: ${step.reason}`);
	const opponent = team === 0 ? 1 : 0;
	if (committedSevens(hand.teams[opponent].melds) < 2) return 0;
	const added =
		committedSevens(step.hand.teams[team].melds) -
		committedSevens(hand.teams[team].melds);
	return added > 0 ? -added : 0;
}
