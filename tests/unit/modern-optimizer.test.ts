import { expect, it } from "vitest";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import type { ModernMatchResult } from "../../src/bot/research/modern-arena";
import {
	type ModernOptimizationJob,
	parseModernOptimizerConfig,
	runModernOptimizer,
} from "../../src/bot/research/modern-optimizer";

function outcome(
	job: ModernOptimizationJob,
	team: 0 | 1,
	win: boolean,
): ModernMatchResult {
	const plan = job.plans[team];
	const winner = win ? team : 1 - team;
	return {
		plan,
		status: "complete",
		aWin: Number(win) as 0 | 1,
		scores: winner === 0 ? [8500, 0] : [0, 8500],
		hands: 1,
		actions: 1,
		simulations: 2,
		resets: 0,
		deadlineStops: 0,
		elapsedMs: 1,
	};
}

it("moves a feature upward when paired feedback favors increasing it", async () => {
	const jobs: ModernOptimizationJob[] = [];
	const config = {
		seed: 91,
		split: 0,
		updates: 2,
		blocks: 1,
		radius: 2,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 10,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [null],
	};
	const result = await runModernOptimizer(
		config,
		async (job) => {
			jobs.push(job);
			const win =
				job.candidate.sevenComplete > MODERN_PRIOR_WEIGHTS.sevenComplete;
			return [outcome(job, 0, win), outcome(job, 1, win)];
		},
		async () => {},
	);
	expect(result.status).toBe("complete");
	expect(result.candidate.sevenComplete).toBeGreaterThan(
		MODERN_PRIOR_WEIGHTS.sevenComplete,
	);
	expect(jobs).toHaveLength(4);
	expect(jobs[0]?.plans[0].seed).toBe(jobs[1]?.plans[0].seed);
	expect(jobs[2]?.plans[0].seed).not.toBe(jobs[0]?.plans[0].seed);
});

it("validates optimizer settings before starting any games", () => {
	const input = {
		version: 1,
		seed: 91,
		split: 0,
		updates: 1,
		blocks: 1,
		radius: 2,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 10,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [null],
	};
	expect(parseModernOptimizerConfig(input).ok).toBe(true);
	expect(
		parseModernOptimizerConfig({
			...input,
			objective: "hand-score",
			maxHands: 1,
		}).ok,
	).toBe(true);
	expect(
		parseModernOptimizerConfig({ ...input, objective: "hand-score" }).ok,
	).toBe(false);
	const scenarios = {
		...input,
		objective: "hand-score",
		maxHands: 1,
		initialTeamScores: [0, 3000, 5000],
	};
	expect(parseModernOptimizerConfig(scenarios).ok).toBe(true);
	expect(
		parseModernOptimizerConfig({ ...scenarios, initialTeamScores: [] }).ok,
	).toBe(false);
	expect(
		parseModernOptimizerConfig({ ...scenarios, initialTeamScores: [0, 0] }).ok,
	).toBe(false);
	expect(
		parseModernOptimizerConfig({ ...scenarios, objective: "match-win" }).ok,
	).toBe(false);
	expect(parseModernOptimizerConfig({ ...input, llm: true }).ok).toBe(false);
	expect(
		parseModernOptimizerConfig({
			...input,
			schedule: { ...input.schedule, perturbation: 0 },
		}).ok,
	).toBe(false);
});

it("stops an update when any paired match is incomplete", async () => {
	const config = {
		seed: 91,
		split: 0,
		updates: 1,
		blocks: 1,
		radius: 1,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 10,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [null],
	};
	const result = await runModernOptimizer(
		config,
		async (job) => [
			outcome(job, 0, true),
			{
				...outcome(job, 1, true),
				status: "incomplete",
				reason: "hand cap",
				aWin: null,
			},
		],
		async () => {},
	);
	expect(result.status).toBe("incomplete");
	expect(result.completedUpdates).toBe(0);
	expect(result.candidate).toEqual(MODERN_PRIOR_WEIGHTS);
});

it("leaves the current candidate unchanged if a pair is cancelled", async () => {
	const config = {
		seed: 91,
		split: 0,
		updates: 1,
		blocks: 1,
		radius: 1,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 10,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [null],
	};
	const result = await runModernOptimizer(
		config,
		async () => null,
		async () => {},
	);
	expect(result).toMatchObject({
		status: "incomplete",
		completedUpdates: 0,
		reason: "cancelled",
	});
	expect(result.candidate).toEqual(MODERN_PRIOR_WEIGHTS);
});

it("tests each perturbation against the same frozen opponent league", async () => {
	const seen: ModernOptimizationJob[] = [];
	const config = {
		seed: 91,
		split: 0,
		updates: 1,
		blocks: 2,
		radius: 1,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 10,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [MODERN_PRIOR_WEIGHTS, null],
	};
	await runModernOptimizer(
		config,
		async (job) => {
			seen.push(job);
			return [outcome(job, 0, true), outcome(job, 1, true)];
		},
		async () => {},
	);
	expect(seen.map((job) => job.opponent)).toEqual([
		MODERN_PRIOR_WEIGHTS,
		null,
		MODERN_PRIOR_WEIGHTS,
		null,
	]);
	expect(seen[0]?.plans[0].seed).toBe(seen[2]?.plans[0].seed);
	expect(seen[1]?.plans[0].seed).toBe(seen[3]?.plans[0].seed);
});

it("balances dealer seats across a two-opponent league", async () => {
	const seen: ModernOptimizationJob[] = [];
	await runModernOptimizer(
		{
			seed: 91,
			split: 0,
			updates: 2,
			blocks: 4,
			radius: 1,
			schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
			maxHands: 10,
			maxActionsPerHand: 100,
			simulations: 2,
			timeMs: 5000,
			depth: 3,
			opponents: [MODERN_PRIOR_WEIGHTS, null],
		},
		async (job) => {
			seen.push(job);
			return [outcome(job, 0, true), outcome(job, 1, true)];
		},
		async () => {},
	);
	for (const usesPrior of [true, false]) {
		const dealers = seen
			.filter(
				(job) => job.label === "plus" && (job.opponent !== null) === usesPrior,
			)
			.map((job) => job.plans[0].dealer)
			.sort();
		expect(dealers).toEqual([0, 1, 2, 3]);
	}
});

it("balances dealer seats across a five-opponent league", async () => {
	const opponents = Array.from({ length: 5 }, (_, index) => ({
		...MODERN_PRIOR_WEIGHTS,
		cardsMelded: index,
	}));
	const seen: ModernOptimizationJob[] = [];
	await runModernOptimizer(
		{
			seed: 91,
			split: 0,
			updates: 1,
			blocks: 20,
			radius: 1,
			schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
			maxHands: 10,
			maxActionsPerHand: 100,
			simulations: 2,
			timeMs: 5000,
			depth: 3,
			opponents,
		},
		async (job) => {
			seen.push(job);
			return [outcome(job, 0, true), outcome(job, 1, true)];
		},
		async () => {},
	);
	for (const opponent of opponents) {
		const dealers = seen
			.filter(
				(job) =>
					job.label === "plus" &&
					job.opponent?.cardsMelded === opponent.cardsMelded,
			)
			.map((job) => job.plans[0].dealer)
			.sort();
		expect(dealers).toEqual([0, 1, 2, 3]);
	}
});

it("can train on paired hand scores without counting capped matches as match wins", async () => {
	const config = {
		seed: 91,
		split: 0,
		updates: 1,
		blocks: 1,
		radius: 1,
		objective: "hand-score" as const,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 1,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [null],
	};
	const result = await runModernOptimizer(
		config,
		async (job) => {
			const win =
				job.candidate.sevenComplete > MODERN_PRIOR_WEIGHTS.sevenComplete;
			return [0, 1].map((team) => {
				const side = team as 0 | 1;
				const a = outcome(job, side, win);
				const winner = win ? side : 1 - side;
				return {
					...a,
					status: "incomplete" as const,
					reason: "hand cap",
					aWin: null,
					scores:
						winner === 0 ? ([1000, 500] as const) : ([500, 1000] as const),
				};
			}) as unknown as [ModernMatchResult, ModernMatchResult];
		},
		async () => {},
	);
	expect(result.status).toBe("complete");
	expect(result.objective).toBe("hand-score");
	expect(result.candidate.sevenComplete).toBeGreaterThan(
		MODERN_PRIOR_WEIGHTS.sevenComplete,
	);
});

it("balances opening-score scenarios across opponents, dealers, and perturbations", async () => {
	const seen: ModernOptimizationJob[] = [];
	const result = await runModernOptimizer(
		{
			seed: 91,
			split: 0,
			updates: 1,
			blocks: 24,
			radius: 1,
			objective: "hand-score",
			initialTeamScores: [0, 3000, 5000],
			schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
			maxHands: 1,
			maxActionsPerHand: 100,
			simulations: 2,
			timeMs: 5000,
			depth: 3,
			opponents: [MODERN_PRIOR_WEIGHTS, null],
		},
		async (job) => {
			seen.push(job);
			return [0, 1].map((team) => ({
				...outcome(job, team as 0 | 1, true),
				status: "incomplete" as const,
				reason: "scenario hand",
				aWin: null,
				hands: 1,
			})) as [ModernMatchResult, ModernMatchResult];
		},
		async () => {},
	);
	expect(result.status).toBe("complete");
	const plus = seen.filter((job) => job.label === "plus");
	const minus = seen.filter((job) => job.label === "minus");
	for (const score of [0, 3000, 5000]) {
		for (const usesPrior of [true, false]) {
			const jobs = plus.filter(
				(job) =>
					job.plans[0].initialTeamScore === score &&
					(job.opponent !== null) === usesPrior,
			);
			expect(jobs.map((job) => job.plans[0].dealer).sort()).toEqual([
				0, 1, 2, 3,
			]);
		}
	}
	for (let block = 0; block < 24; block++) {
		expect(plus[block]?.plans).toEqual(minus[block]?.plans);
		expect(plus[block]?.opponent).toEqual(minus[block]?.opponent);
	}
});

it("rejects evaluator results from a different deal", async () => {
	const config = {
		seed: 91,
		split: 0,
		updates: 1,
		blocks: 1,
		radius: 1,
		schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
		maxHands: 10,
		maxActionsPerHand: 100,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		opponents: [null],
	};
	await expect(
		runModernOptimizer(
			config,
			async (job) => {
				const a = outcome(job, 0, true),
					b = outcome(job, 1, true);
				return [
					{ ...a, plan: { ...a.plan, seed: a.plan.seed + 1 } },
					{ ...b, plan: { ...b.plan, seed: b.plan.seed + 1 } },
				];
			},
			async () => {},
		),
	).rejects.toThrow(/scheduled/);
});
