import type { CardBelief } from "./card-knowledge";

/**
 * Pair chance under a relaxed allocation model, not a calibrated posterior.
 * Guaranteed face counts are assigned first; all remaining physical copies are
 * uniformly allocated to remaining slots. Row maxima and correlations are not
 * conditioned on, except when bounds prove the pair impossible or guaranteed.
 */
export function relaxedPairChance(
	belief: CardBelief,
	targetRows: readonly number[],
	faces: readonly string[],
): number {
	const fail = (): never => {
		throw new Error("invalid relaxed pair model input");
	};
	const integer = (value: unknown): value is number =>
		typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
	const allFaces = new Set(belief.faces);
	const selectedFaces = new Set(faces);
	const selectedRows = new Set(targetRows);
	if (
		allFaces.size !== belief.faces.length ||
		selectedFaces.size !== faces.length ||
		selectedFaces.size === 0 ||
		faces.some((face) => !allFaces.has(face)) ||
		selectedRows.size !== targetRows.length ||
		selectedRows.size === 0 ||
		targetRows.some(
			(index) => !integer(index) || index >= belief.players.length,
		)
	)
		return fail();
	let totalCards = 0;
	let totalSlots = 0;
	let population = 0;
	let successes = 0;
	let known = 0;
	let maximum = 0;
	let draws = 0;
	let selectedCount = 0;
	for (const row of belief.players) {
		if (!integer(row.count)) return fail();
		totalSlots += row.count;
	}
	for (const face of belief.faces) {
		const remaining = belief.remaining[face];
		if (!integer(remaining)) return fail();
		totalCards += remaining;
		let minima = 0;
		let maxima = 0;
		for (const [index, row] of belief.players.entries()) {
			const min = row.minimum[face];
			const max = row.maximum[face];
			if (!integer(min) || !integer(max) || min > max || max > remaining)
				return fail();
			minima += min;
			maxima += max;
			if (selectedRows.has(index) && selectedFaces.has(face)) {
				known += min;
				maximum += max;
			}
		}
		if (minima > remaining || maxima < remaining) return fail();
		const free = remaining - minima;
		population += free;
		if (selectedFaces.has(face)) successes += free;
	}
	for (const [index, row] of belief.players.entries()) {
		const min = belief.faces.reduce(
			(sum, face) => sum + (row.minimum[face] ?? 0),
			0,
		);
		const max = belief.faces.reduce(
			(sum, face) => sum + (row.maximum[face] ?? 0),
			0,
		);
		if (min > row.count || max < row.count) return fail();
		if (selectedRows.has(index)) {
			selectedCount += row.count;
			draws += row.count - min;
		}
	}
	if (
		!Number.isSafeInteger(totalCards) ||
		!Number.isSafeInteger(totalSlots) ||
		!Number.isSafeInteger(population) ||
		totalCards !== totalSlots ||
		draws > population
	)
		return fail();
	if (maximum < 2 || selectedCount < 2) return 0;
	if (known >= 2) return 1;
	if (known + successes < 2 || known + draws < 2) return 0;
	if (known + draws - (population - successes) >= 2) return 1;
	let p0 = 1;
	let p1 = 0;
	for (let i = 0; i < draws; i++) {
		const remaining = population - i;
		p1 =
			(p1 * Math.max(0, population - successes - i + 1) + p0 * successes) /
			remaining;
		p0 = (p0 * Math.max(0, population - successes - i)) / remaining;
	}
	return Math.max(0, Math.min(1, 1 - p0 - (known === 0 ? p1 : 0)));
}
