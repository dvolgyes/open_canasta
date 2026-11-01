import type { ModernHandState } from "../canasta/modern-hand";
import { modernViewFor } from "../canasta/modern-view";
import { cardFace } from "../game/canasta-history";

/** Current visible state only; this does not reconstruct private remembered history. */
export function modernInformationKey(hand: ModernHandState): string {
	const { hand: ownCards, ...visible } = modernViewFor(hand, hand.turn);
	return JSON.stringify([visible, ownCards.map(cardFace).toSorted()]);
}
