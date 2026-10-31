import { expect, it } from "vitest";
import { observeCanasta } from "../../src/bot/canasta-search";
import { NODE_PROMPT_TEMPLATES } from "../../src/bot/node-prompts";
import {
	type MatchPlan,
	type MatchResult,
	playMatch,
	playPair,
} from "../../src/bot/research/arena";
import { llmAgent, localAgent } from "../../src/bot/research/policies";
import { spsaProbe, spsaUpdate } from "../../src/bot/research/spsa";
import { boundedEstimate } from "../../src/bot/research/statistics";
import { mulberry32, newHand } from "../../src/canasta";

const plan: MatchPlan = {
	seed: 21001,
	policySeed: 81,
	dealer: 3,
	aTeam: 0,
	maxActionsPerHand: 2000,
	maxHands: 100,
};

it("swaps only team assignment, preserves paired deals and gives each block equal weight", async () => {
	const seen: MatchPlan[] = [];
	const pair = await playPair(
		plan,
		async (p) => {
			seen.push(p);
			return {
				plan: p,
				status: "complete",
				aWin: p.aTeam === 0 ? 1 : 0,
				scores: [5000, 100],
				hands: 1,
				actions: 10,
				simulations: 0,
				resets: 0,
				elapsedMs: 0,
			} as MatchResult;
		},
		true,
	);
	expect(seen).toEqual([
		{ ...plan, aTeam: 0 },
		{ ...plan, aTeam: 1 },
	]);
	expect(pair.score).toBe(0.5);
});

it("completes a real classic match, with public observations and a fresh history per hand", async () => {
	const firstHistories = new Map<number, unknown>();
	const result = await playMatch(plan, () => {
		const delegate = localAgent({ kind: "heuristic" });
		return {
			decide: async (observation, context) => {
				expect(observation).not.toHaveProperty("seed");
				expect(observation.view).not.toHaveProperty("hands");
				expect(observation.view).not.toHaveProperty("stock");
				expect(observation.view.revealed).toBeNull();
				if (!firstHistories.has(context.handNo))
					firstHistories.set(context.handNo, observation.history);
				return delegate.decide(observation, context);
			},
		};
	});
	expect(result.status).toBe("complete");
	expect(Math.max(...result.scores)).toBeGreaterThanOrEqual(5000);
	expect(result.scores[0]).not.toBe(result.scores[1]);
	expect(result.hands).toBeGreaterThan(1);
	expect([...firstHistories.values()].every((h) => h === undefined)).toBe(true);
}, 20000);

it("waits for both parallel legs before releasing a failed pair", async () => {
	let rejectPending: ((error: Error) => void) | undefined;
	const pending = new Promise<MatchResult>((_, reject) => {
		rejectPending = reject;
	});
	let settled = false;
	const pair = playPair(
		plan,
		async (p) => {
			if (p.aTeam === 0) throw new Error("first worker failed");
			return pending;
		},
		true,
	).catch((error: unknown) => {
		settled = true;
		return error;
	});
	await new Promise((resolve) => setImmediate(resolve));
	const releasedEarly = settled;
	rejectPending?.(new Error("second worker failed"));
	expect(await pair).toEqual(new Error("first worker failed"));
	expect(releasedEarly).toBe(false);
});

it("retains caps and illegal decisions as incomplete instead of inventing results", async () => {
	const capped = await playMatch({ ...plan, maxActionsPerHand: 1 }, () =>
		localAgent({ kind: "heuristic" }),
	);
	expect(capped.reason).toBe("action cap");
	expect(capped.aWin).toBeNull();
	const illegal = await playMatch(plan, () => ({
		decide: async () => ({
			ok: true,
			action: { type: "discard", card: "nonexistent" },
			simulations: 0,
		}),
	}));
	expect(illegal.reason).toMatch(/illegal/);
	expect(illegal.aWin).toBeNull();
	const pair = await playPair(plan, async (p) => ({ ...capped, plan: p }));
	expect(pair.score).toBeNull();
});

it("balances identical deterministic policies to half a win per actual paired block", async () => {
	const pair = await playPair(plan, (p) =>
		playMatch(p, () => localAgent({ kind: "heuristic" })),
	);
	expect(pair.score).toBe(0.5);
	expect(pair.legs[0].scores).toEqual(pair.legs[1].scores);
	expect(pair.legs[0].actions).toBe(pair.legs[1].actions);
}, 20000);

it("does not substitute the heuristic after an LLM failure or invalid index", async () => {
	const observation = observeCanasta(
		newHand({ seed: 1, dealer: 3, teamScores: [0, 0] }),
		0,
	);
	for (const choose of [
		async () => {
			throw new Error("secret must not be logged");
		},
		async () => -1,
		async () => 0.5,
	]) {
		const agent = llmAgent({ choose }, NODE_PROMPT_TEMPLATES);
		const result = await agent.decide(observation, {
			rng: mulberry32(8),
			handNo: 1,
		});
		expect(result.ok).toBe(false);
		expect(JSON.stringify(result)).not.toContain("secret");
	}
});

it("uses fixed-sample bounded intervals and refuses incomplete evidence", () => {
	const wins = boundedEstimate(Array(100).fill(1), 100, 0.05);
	expect(wins.lower).toBeCloseTo(1 - Math.sqrt(Math.log(20) / 200), 12);
	expect(wins.lower).toBeGreaterThan(0.5);
	expect(boundedEstimate(Array(100).fill(0.5), 100, 0.05).lower).toBeLessThan(
		0.5,
	);
	expect(boundedEstimate([1, null], 2, 0.05).lower).toBe(0);
	expect(boundedEstimate([1], 2, 0.05).lower).toBe(0);
	expect(() => boundedEstimate([2], 1, 0.05)).toThrow();
});

it("SPSA improves a known concave objective across independent runs and keeps probes bounded", () => {
	const objective = (point: readonly number[]) =>
		-point.reduce((sum, v) => sum + (v - 0.4) ** 2, 0);
	for (const seed of [1, 2, 3, 4, 5]) {
		let point = [-0.8, 0.9, 0];
		const initial = objective(point),
			rng = mulberry32(seed);
		for (let k = 1; k <= 150; k++) {
			const probe = spsaProbe(
				point,
				k,
				{ step: 0.3, perturbation: 0.2, stability: 10 },
				rng,
			);
			expect(
				[...probe.plus, ...probe.minus].every((v) => Math.abs(v) <= 1),
			).toBe(true);
			point = spsaUpdate(
				point,
				probe,
				objective(probe.plus),
				objective(probe.minus),
			);
		}
		expect(objective(point)).toBeGreaterThan(initial + 1);
	}
});
