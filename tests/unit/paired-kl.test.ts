import { expect, it } from "vitest";
import {
	modernPairedKlLowerBound,
	pairedKlLowerBound,
} from "../../scripts/paired-kl";
import type { ModernMatchResult } from "../../src/bot/research/modern-arena";

it("handles boundary scores and is monotone in observed success", () => {
	expect(pairedKlLowerBound(Array(50).fill(1), 0.025)).toBeCloseTo(
		0.025 ** (1 / 50),
		12,
	);
	expect(pairedKlLowerBound([0, 0, 0], 0.025)).toBe(0);
	const lower = pairedKlLowerBound([0, 0.5, 1], 0.025);
	expect(lower).toBeGreaterThan(0);
	expect(lower).toBeLessThan(0.5);
	expect(pairedKlLowerBound([0.5, 1, 1], 0.025)).toBeGreaterThan(lower);
	expect(() => pairedKlLowerBound([], 0.025)).toThrow();
	expect(() => pairedKlLowerBound([Number.NaN], 0.025)).toThrow();
	expect(() => pairedKlLowerBound([1.1], 0.025)).toThrow();
	expect(() => pairedKlLowerBound([0.5], 0)).toThrow();
});

it("maintains one-sided coverage for independent non-identical paired outcomes", () => {
	const probabilities = [
		[0.6, 0.3, 0.1],
		[0.1, 0.2, 0.7],
		[0.2, 0.5, 0.3],
		[0.1, 0.6, 0.3],
	];
	const scores = [0, 0.5, 1];
	const alpha = 0.1;
	const mean =
		probabilities.reduce(
			(sum, row) =>
				sum + row.reduce((value, p, i) => value + p * (scores[i] ?? 0), 0),
			0,
		) / probabilities.length;
	let failureProbability = 0;
	for (let outcome = 0; outcome < 3 ** probabilities.length; outcome++) {
		let rest = outcome;
		let probability = 1;
		const observed: number[] = [];
		for (const row of probabilities) {
			const index = rest % 3;
			rest = Math.floor(rest / 3);
			probability *= row[index] ?? 0;
			observed.push(scores[index] ?? 0);
		}
		if (pairedKlLowerBound(observed, alpha) > mean)
			failureProbability += probability;
	}
	expect(failureProbability).toBeLessThanOrEqual(alpha + 1e-12);
});

it("retains coverage across small binomial distributions", () => {
	const alpha = 0.05;
	for (let n = 1; n <= 16; n++) {
		for (let step = 1; step < 20; step++) {
			const probability = step / 20;
			let coefficient = 1;
			let failureProbability = 0;
			for (let wins = 0; wins <= n; wins++) {
				if (wins > 0) coefficient *= (n - wins + 1) / wins;
				const mass =
					coefficient * probability ** wins * (1 - probability) ** (n - wins);
				const scores = [
					...Array<number>(wins).fill(1),
					...Array<number>(n - wins).fill(0),
				];
				if (pairedKlLowerBound(scores, alpha) > probability)
					failureProbability += mass;
			}
			expect(failureProbability).toBeLessThanOrEqual(alpha + 1e-12);
		}
	}
});

it("does not compute a study bound for incomplete or budget-limited matches", () => {
	const leg = (team: 0 | 1): ModernMatchResult => ({
		plan: {
			seed: 1,
			policySeed: 2,
			dealer: 0,
			aTeam: team,
			maxHands: 10,
			maxActionsPerHand: 10,
		},
		status: "complete",
		aWin: 1,
		scores: team === 0 ? [8500, 0] : [0, 8500],
		hands: 1,
		actions: 1,
		simulations: 2,
		resets: 0,
		deadlineStops: 0,
		elapsedMs: 1,
	});
	const first = leg(0);
	const second = leg(1);
	expect(modernPairedKlLowerBound([[first, second]], 1, 2, 0.025)).toBeCloseTo(
		0.025,
	);
	const incomplete = {
		...second,
		status: "incomplete" as const,
		reason: "hand cap",
		aWin: null,
	};
	expect(
		modernPairedKlLowerBound([[first, incomplete]], 1, 2, 0.025),
	).toBeNull();
	const missed = { ...second, simulations: 0, deadlineStops: 1 };
	expect(modernPairedKlLowerBound([[first, missed]], 1, 2, 0.025)).toBeNull();
	expect(modernPairedKlLowerBound([], 1, 2, 0.025)).toBeNull();
	expect(() => modernPairedKlLowerBound([], 1, 2, 0)).toThrow();
});
