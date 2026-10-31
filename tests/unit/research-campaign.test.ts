import { expect, it } from "vitest";
import { REFERENCE_PRIOR } from "../../src/bot/canasta-prior";
import type { PairResult } from "../../src/bot/research/arena";
import {
	type CampaignConfig,
	type PairJob,
	runCampaign,
	studySeed,
	weightsAt,
} from "../../src/bot/research/campaign";
import { parseStudyConfig } from "../../src/bot/research/config";

const config: CampaignConfig = {
	seed: 17,
	updates: 2,
	trainingPairs: 2,
	evaluationPairs: 1,
	checkpointEvery: 1,
	alpha: 0.05,
	method: "spsa",
	schedule: { step: 0.2, perturbation: 0.2, stability: 10 },
	budget: {
		kind: "iterations",
		iterations: 2,
		depth: 4,
		emergencyTimeMs: 1000,
	},
	maxHands: 100,
	maxActionsPerHand: 2000,
};
const synthetic = (job: PairJob, score: number | null): PairResult => ({
	seed: job.plan.seed,
	score,
	legs: [0, 1].map((aTeam) => ({
		plan: { ...job.plan, aTeam: aTeam as 0 | 1 },
		status: score === null ? "incomplete" : "complete",
		aWin: score === null ? null : score === 1 ? 1 : 0,
		scores: [5000, 0],
		hands: 1,
		actions: 1,
		simulations: 1,
		resets: 0,
		elapsedMs: 0,
	})) as unknown as PairResult["legs"],
});

it("supports a broader signed coefficient domain and concurrent pairs without changing seeded outcomes", async () => {
	expect(weightsAt(Array(16).fill(-1), 4).draw).toBe(-30);
	expect(weightsAt(Array(16).fill(1), 4).draw).toBe(50);
	expect(() => weightsAt(Array(16).fill(0), 9)).toThrow();
	const run = (parallelPairs: number) =>
		runCampaign(
			{ ...config, weightRadius: 4, parallelPairs },
			async (job) => synthetic(job, job.id.includes("plus") ? 1 : 0),
			async () => {},
		);
	expect(await run(2)).toEqual(await run(1));
});

it("pairs SPSA perturbations on the same deals and opponents, separates promotion seeds and retains the champion on weak evidence", async () => {
	const jobs: PairJob[] = [],
		events: Readonly<Record<string, unknown>>[] = [];
	const llmUpdates: number[] = [];
	const state = await runCampaign(
		config,
		async (job) => {
			jobs.push(job);
			return synthetic(job, job.id.includes("plus") ? 1 : 0);
		},
		async (event) => {
			events.push(event);
		},
		async (state) => {
			llmUpdates.push(state.update);
			return { status: "mocked" };
		},
	);
	for (let update = 1; update <= 2; update++)
		for (let block = 0; block < 2; block++) {
			const plus = jobs.find((j) => j.id === `train-${update}-plus-${block}`),
				minus = jobs.find((j) => j.id === `train-${update}-minus-${block}`);
			expect(plus?.plan).toEqual(minus?.plan);
			expect(plus?.b).toEqual(minus?.b);
			expect(plus?.a).not.toEqual(minus?.a);
		}
	const trainSeeds = new Set(
		jobs.filter((j) => j.id.startsWith("train")).map((j) => j.plan.seed),
	);
	expect(
		jobs
			.filter((j) => j.id.startsWith("promotion"))
			.every((j) => !trainSeeds.has(j.plan.seed)),
	).toBe(true);
	expect(state.candidate).not.toEqual(REFERENCE_PRIOR);
	expect(state.champion).toEqual(REFERENCE_PRIOR);
	expect(state.promotions).toBe(0);
	expect(llmUpdates).toEqual([1, 2]);
	expect(events.filter((e) => e.kind === "checkpoint")).toHaveLength(2);
});

it("stops on an incomplete training block instead of optimizing a selectively complete sample", async () => {
	const events: unknown[] = [];
	await expect(
		runCampaign(
			config,
			async (job) => synthetic(job, null),
			async (event) => {
				events.push(event);
			},
		),
	).rejects.toThrow(/incomplete training pair/);
	expect(events).toHaveLength(1);
});

it("promotes only when both fresh-data gates pass", async () => {
	for (const regress of [false, true]) {
		const state = await runCampaign(
			{ ...config, updates: 1, evaluationPairs: 12 },
			async (job) =>
				synthetic(
					job,
					job.id.includes("champion-anchor")
						? regress
							? 1
							: 0
						: job.id.includes("candidate-anchor") && regress
							? 0
							: 1,
				),
			async () => {},
		);
		expect(state.promotions).toBe(regress ? 0 : 1);
	}
});

it("reserves disjoint deal-seed namespaces and rejects schema mistakes before execution", () => {
	const seeds = new Set<number>();
	for (const split of [0, 1, 2, 3, 4, 32, 33, 34, 35, 36])
		for (let i = 0; i < 1000; i++) seeds.add(studySeed(17, split, i));
	expect(seeds.size).toBe(10000);
	expect(
		parseStudyConfig({
			version: 1,
			mode: "train",
			parallel: true,
			maxWallMs: 10000,
			campaign: config,
		}).ok,
	).toBe(true);
	for (const campaign of [
		{ ...config, updates: 0 },
		{ ...config, alpha: NaN },
		{ ...config, typo: 1 },
		{ ...config, budget: { kind: "time", timeMs: 1, depth: 4 } },
	])
		expect(
			parseStudyConfig({
				version: 1,
				mode: "train",
				parallel: true,
				maxWallMs: 10000,
				campaign,
			}).ok,
		).toBe(false);
});
