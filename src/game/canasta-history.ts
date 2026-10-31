/** Public card transfers retained across reconnects; physical deck IDs are never recorded. */
import type { Card, HandState, Seat } from "../canasta";
import { isNonNegativeInteger, isObject } from "../protocol";

export interface PublicTransfer {
	readonly player: number;
	readonly gained: readonly string[];
	readonly removed: readonly string[];
	readonly drawn: number;
}

export interface PublicHistory {
	readonly initialCounts: readonly number[];
	readonly events: readonly PublicTransfer[];
}

export function cardFace(card: Pick<Card, "rank" | "suit">): string {
	return `${card.rank}${card.suit ?? ""}`;
}

export function publicCards(hand: Pick<HandState, "pile" | "teams">): Card[] {
	return [
		...hand.pile,
		...hand.teams.flatMap((team) => [
			...team.redThrees,
			...team.melds.flatMap((meld) => meld.cards),
		]),
	];
}

export function recordTransfer(
	history: PublicHistory | undefined,
	before: HandState,
	after: HandState,
	seat: Seat,
): PublicHistory {
	const oldPublic = publicCards(before);
	const newPublic = publicCards(after);
	const oldIds = new Set(oldPublic.map((c) => c.id));
	const newIds = new Set(newPublic.map((c) => c.id));
	const oldHand = new Set(required(before.hands[seat]).map((c) => c.id));
	const newHand = new Set(required(after.hands[seat]).map((c) => c.id));
	const gained = oldPublic
		.filter((c) => !newIds.has(c.id) && newHand.has(c.id))
		.map(cardFace);
	const removed = newPublic
		.filter((c) => !oldIds.has(c.id) && oldHand.has(c.id))
		.map(cardFace);
	const drawn = newHand.size - oldHand.size - gained.length + removed.length;
	return {
		initialCounts: history?.initialCounts ?? before.hands.map((h) => h.length),
		events: [
			...(history?.events ?? []),
			{ player: seat, gained, removed, drawn },
		],
	};
}

export function parsePublicHistory(value: unknown): PublicHistory | undefined {
	if (
		!isObject(value) ||
		!Array.isArray(value.initialCounts) ||
		value.initialCounts.length !== 4 ||
		!value.initialCounts.every((n) => isNonNegativeInteger(n) && n <= 108) ||
		!Array.isArray(value.events) ||
		value.events.length > 10000
	)
		return undefined;
	const faces = (v: unknown): v is string[] =>
		Array.isArray(v) &&
		v.length <= 108 &&
		v.every(
			(f) => typeof f === "string" && /^(?:[3-9JQKA2]|10)[CDHS]$|^JK$/.test(f),
		);
	const events: PublicTransfer[] = [];
	const counts = [...value.initialCounts] as number[];
	for (const event of value.events) {
		if (
			!isObject(event) ||
			!isNonNegativeInteger(event.player) ||
			event.player > 3 ||
			!isNonNegativeInteger(event.drawn) ||
			event.drawn > 108 ||
			!faces(event.gained) ||
			!faces(event.removed)
		)
			return undefined;
		events.push({
			player: event.player,
			drawn: event.drawn,
			gained: event.gained,
			removed: event.removed,
		});
		const count =
			required(counts[event.player]) +
			event.drawn +
			event.gained.length -
			event.removed.length;
		if (count < 0 || count > 108) return undefined;
		counts[event.player] = count;
	}
	return { initialCounts: value.initialCounts as number[], events };
}

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("missing required search data");
	return value;
}
