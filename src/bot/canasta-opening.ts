import {
	applyAction,
	type Card,
	cardPoints,
	type HandState,
	initialMeldMinimum,
	isRed3,
	isWild,
	type Rank,
	type Seat,
	teamOf,
} from "../canasta";

interface Group {
	readonly rank: Rank;
	readonly cards: readonly Card[];
	readonly wilds: number;
}
interface Cell {
	readonly points: number;
	readonly groups: readonly Group[];
}
interface Plan extends Cell {
	readonly used: number;
	readonly left: number;
	readonly canastas: number;
}

/** Rank groups share a finite wild-card budget; two or more cards left form one state. */
function openingPlans(hand: HandState, seat: Seat, expired: () => boolean) {
	const own = hand.hands[seat] ?? [];
	const borrowed = new Set(hand.turnStart.pile.map((c) => c.id));
	const points = (c: Card) => (borrowed.has(c.id) ? 0 : cardPoints(c));
	const byPoints = (a: Card, b: Card) =>
		points(b) - points(a) || a.id.localeCompare(b.id);
	const wilds = own.filter(isWild).sort(byPoints);
	const prefix = [0];
	for (const card of wilds) prefix.push((prefix.at(-1) ?? 0) + points(card));
	const melds = hand.teams[teamOf(seat)].melds;
	const ranks = new Set([
		...own.filter((c) => !isWild(c)).map((c) => c.rank),
		...melds.map((m) => m.rank),
	]);
	ranks.delete("3");
	const needed = hand.rules.canastasToGoOut;
	const index = (used: number, left: number, count: number) =>
		(used * 3 + Math.min(2, left)) * (needed + 1) + Math.min(needed, count);
	let best = Array<Cell | undefined>((wilds.length + 1) * 3 * (needed + 1));
	best[0] = { points: 0, groups: [] };
	for (const rank of ranks) {
		if (expired()) return null;
		const naturals = own
			.filter((c) => c.rank === rank && !isWild(c))
			.sort(byPoints);
		const table = melds.find((m) => m.rank === rank)?.cards ?? [];
		const oldWilds = table.filter(isWild).length;
		const next = Array<Cell | undefined>(best.length);
		for (let used = 0; used <= wilds.length; used++)
			for (let left = 0; left <= 2; left++)
				for (let count = 0; count <= needed; count++) {
					const previous = best[index(used, left, count)];
					if (!previous) continue;
					for (let n = 0; n <= naturals.length; n++) {
						const naturalCount = n + table.length - oldWilds;
						const capacity = Math.min(
							hand.rules.maxWildsPerMeld - oldWilds,
							hand.rules.wildsAtMostNaturals
								? naturalCount - oldWilds
								: wilds.length,
						);
						for (
							let added = 0;
							added <= Math.min(capacity, wilds.length - used);
							added++
						) {
							const size = naturalCount + oldWilds + added;
							if ((n > 0 || added > 0) && (naturalCount < 2 || size < 3))
								continue;
							const cards = naturals.slice(0, n);
							const score =
								previous.points +
								cards.reduce((sum, card) => sum + points(card), 0);
							const slot = index(
								used + added,
								left + naturals.length - n,
								count + Number(size >= hand.rules.canastaSize),
							);
							if (score > (next[slot]?.points ?? -Infinity))
								next[slot] = {
									points: score,
									groups:
										n + added === 0
											? previous.groups
											: [...previous.groups, { rank, cards, wilds: added }],
								};
						}
					}
				}
		best = next;
	}
	const black = own.filter((c) => c.rank === "3" && !isRed3(c));
	const blackSize =
		black.length + (melds.find((m) => m.rank === "3")?.cards.length ?? 0);
	const blackPoints = black.reduce((sum, c) => sum + points(c), 0);
	const redCount = own.filter(isRed3).length;
	const plans: Plan[] = [];
	for (let used = 0; used <= wilds.length; used++)
		for (let left = 0; left <= 2; left++)
			for (let count = 0; count <= needed; count++) {
				const cell = best[index(used, left, count)];
				if (!cell) continue;
				const score = hand.turnMeldPoints + cell.points + (prefix[used] ?? 0);
				const remaining = left + wilds.length - used + redCount;
				plans.push({
					...cell,
					points: score,
					used,
					left: remaining + black.length,
					canastas: count,
				});
				if (
					black.length &&
					blackSize >= 3 &&
					remaining <= 1 &&
					count + Number(blackSize >= hand.rules.canastaSize) >= needed
				)
					plans.push({
						points: score + blackPoints,
						used,
						left: remaining,
						canastas: count + Number(blackSize >= hand.rules.canastaSize),
						groups: [...cell.groups, { rank: "3", cards: black, wilds: 0 }],
					});
			}
	return { plans, wilds };
}

/** An upper bound on opening points, including partial groups and constrained black threes. */
export function openingPointUpperBound(hand: HandState, seat: Seat): number {
	const result = openingPlans(hand, seat, () => false);
	return Math.max(
		hand.turnMeldPoints,
		...(result?.plans.map((p) => p.points) ?? []),
	);
}

/** Prove an opening with a bounded rank-allocation search and validate its witness in the rules engine. */
export function canCompleteOpening(
	hand: HandState,
	seat: Seat,
	expired: () => boolean,
): boolean {
	const result = openingPlans(hand, seat, expired);
	if (!result) return false;
	const team = teamOf(seat);
	const minimum = initialMeldMinimum(
		hand.rules.initialMeld,
		hand.teamScores[team],
	);
	for (const plan of result.plans.sort((a, b) => b.points - a.points)) {
		if (expired()) return false;
		if (
			plan.points < minimum ||
			(plan.left <= 1 && plan.canastas < hand.rules.canastasToGoOut)
		)
			continue;
		let offset = 0;
		const groups = plan.groups
			.map((group) => {
				const cards = [
					...group.cards,
					...result.wilds.slice(offset, offset + group.wilds),
				];
				offset += group.wilds;
				const size =
					cards.length +
					(hand.teams[team].melds.find((m) => m.rank === group.rank)?.cards
						.length ?? 0);
				return { ...group, cards, canasta: size >= hand.rules.canastaSize };
			})
			.sort(
				(a, b) =>
					Number(a.rank === "3") - Number(b.rank === "3") ||
					Number(b.canasta) - Number(a.canasta),
			);
		let current = hand,
			valid = true;
		for (const group of groups) {
			if (expired()) return false;
			const meld = current.teams[team].melds.find((m) => m.rank === group.rank);
			const cards = group.cards.map((c) => c.id);
			const step = applyAction(
				current,
				seat,
				meld
					? { type: "extend", meldId: meld.id, cards }
					: { type: "meld", cards },
			);
			if (!step.ok) {
				valid = false;
				break;
			}
			current = step.hand;
		}
		if (!valid) continue;
		if (current.outcome || current.turn !== seat) return true;
		if (
			(current.hands[seat] ?? []).some(
				(c) => applyAction(current, seat, { type: "discard", card: c.id }).ok,
			)
		)
			return true;
	}
	return false;
}
