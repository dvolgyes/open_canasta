import type { Card } from "../canasta/cards";
import type { ModernHandState } from "../canasta/modern-hand";
import { cardFace } from "./canasta-history";

export interface ModernPublicTransfer {
	readonly player: number;
	readonly gained: readonly string[];
	readonly removed: readonly string[];
	readonly drawn: number;
	readonly unknownRemoved?: number;
}

export interface ModernPublicHistory {
	/** Four hands followed by four face-down bonus-card rows. */
	readonly initialCounts: readonly number[];
	readonly events: readonly ModernPublicTransfer[];
}

function publicCards(hand: ModernHandState): readonly Card[] {
	return [
		...hand.pile,
		...hand.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((meld) => meld.cards),
		]),
	];
}

/** Record public face counts, never physical IDs or face-down bonus-card faces. */
export function recordModernTransfer(
	history: ModernPublicHistory | undefined,
	before: ModernHandState,
	after: ModernHandState,
): ModernPublicHistory {
	const oldPublic = publicCards(before);
	const newPublic = publicCards(after);
	const oldIds = new Set(oldPublic.map((card) => card.id));
	const newIds = new Set(newPublic.map((card) => card.id));
	const events: ModernPublicTransfer[] = [];
	for (let seat = 0; seat < 4; seat++) {
		const oldHand = before.hands[seat] ?? [];
		const newHand = after.hands[seat] ?? [];
		const oldHandIds = new Set(oldHand.map((card) => card.id));
		const newHandIds = new Set(newHand.map((card) => card.id));
		const gained = oldPublic
			.filter((card) => !newIds.has(card.id) && newHandIds.has(card.id))
			.map(cardFace);
		const removed = newPublic
			.filter((card) => !oldIds.has(card.id) && oldHandIds.has(card.id))
			.map(cardFace);
		const drawn =
			newHand.length - oldHand.length - gained.length + removed.length;
		if (drawn < 0) throw new Error("invalid modern hand transfer");
		if (gained.length || removed.length || drawn)
			events.push({ player: seat, gained, removed, drawn });
		const bonusChange =
			(after.bonuses[seat]?.length ?? 0) - (before.bonuses[seat]?.length ?? 0);
		if (bonusChange > 0)
			events.push({
				player: seat + 4,
				gained: [],
				removed: [],
				drawn: bonusChange,
			});
		if (bonusChange < 0)
			events.push({
				player: seat + 4,
				gained: [],
				removed: [],
				drawn: 0,
				unknownRemoved: -bonusChange,
			});
	}
	return {
		initialCounts: history?.initialCounts ?? [
			...before.hands.map((cards) => cards.length),
			...before.bonuses.map((cards) => cards.length),
		],
		events: [...(history?.events ?? []), ...events],
	};
}
