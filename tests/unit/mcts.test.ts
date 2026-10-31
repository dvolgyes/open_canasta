import { expect, it } from "vitest";
import { type SearchGame, search } from "../../src/bot/mcts";
import { mulberry32 } from "../../src/canasta";

it("samples equal unvisited actions without favoring their position in the action list", async () => {
	const counts = [0, 0, 0];
	const trials = 6000;
	for (let seed = 0; seed < trials; seed++) {
		const result = await search(
			{
				sample: () => 0,
				player: () => 0,
				key: (_state, action: number) => String(action),
				actions: () => [0, 1, 2],
				apply: () => 1,
				terminal: (state) => state === 1,
				evaluate: () => [0.5],
			},
			{
				timeMs: 1000,
				maxIterations: 2,
				maxDepth: 1,
				rng: mulberry32(seed),
				now: () => 0,
			},
		);
		for (const choice of result.choices)
			if (choice.visits > 0)
				counts[choice.action] = (counts[choice.action] ?? 0) + 1;
	}
	// Each action belongs to two thirds of the two-action samples; 4% allows sampling variation.
	for (const count of counts)
		expect(Math.abs(count / trials - 2 / 3)).toBeLessThan(0.04);
});

it("does not count or back up a rollout interrupted by its deadline", async () => {
	let clock = 0;
	const result = await search<number, number>(
		{
			sample: () => 0,
			player: () => 0,
			key: (_state, action) => String(action),
			actions: () => [1],
			apply: (state) => {
				clock = 100;
				return state + 1;
			},
			terminal: () => false,
			evaluate: () => [1],
		},
		{
			timeMs: 10,
			maxIterations: 1,
			maxDepth: 3,
			now: () => clock,
			fallback: 1,
		},
	);
	expect(result.iterations).toBe(0);
	expect(result.choices.every((choice) => choice.visits === 0)).toBe(true);
	expect(result.action).toBe(1);
});

it("learns a forced win despite a misleading prior, with the opponent maximizing its own reward", async () => {
	const game: SearchGame<string, string> = {
		sample: () => "root",
		player: (state) => (state === "root" ? 0 : 1),
		key: (_state, action) => action,
		actions: (state) =>
			state === "root"
				? ["safe", "trap"]
				: state === "trap"
					? ["punish", "blunder"]
					: [],
		apply: (_state, action) => action,
		terminal: (state) => ["safe", "punish", "blunder"].includes(state),
		evaluate: (state) =>
			state === "safe" ? [0.7, 0.3] : state === "blunder" ? [1, 0] : [0, 1],
		prior: (_state, action) => (action === "trap" ? 1 : 0),
	};
	for (const seed of [1, 2, 3, 4]) {
		const result = await search(game, {
			timeMs: 1000,
			maxIterations: 500,
			rng: mulberry32(seed),
			priorWeight: 2,
		});
		expect(result.action).toBe("safe");
		expect(result.iterations).toBe(500);
	}
});

it("returns a legal fallback at a zero budget and rejects invalid budgets", async () => {
	const game: SearchGame<number, number> = {
		sample: () => 0,
		player: () => 0,
		key: (_s, a) => String(a),
		actions: () => [1],
		apply: (_s, a) => a,
		terminal: (s) => s === 1,
		evaluate: () => [1],
	};
	expect((await search(game, { timeMs: 0, fallback: 1 })).action).toBe(1);
	await expect(search(game, { timeMs: -1 })).rejects.toThrow(/timeMs/);
});

it("counts only determinizations in which an action is available", async () => {
	let samples = 0;
	const game: SearchGame<number, string> = {
		sample: () => samples++ % 2,
		player: () => 0,
		key: (_s, a) => a,
		actions: (s) => (s === 0 ? ["always", "sometimes"] : ["always"]),
		apply: () => 2,
		terminal: (s) => s === 2,
		evaluate: () => [0.5],
	};
	const result = await search(game, {
		timeMs: 1000,
		maxIterations: 100,
		rng: mulberry32(3),
		widening: 1,
	});
	const always = result.choices.find((c) => c.action === "always");
	const sometimes = result.choices.find((c) => c.action === "sometimes");
	expect(always?.available).toBeGreaterThan(90);
	expect(sometimes?.available).toBeLessThanOrEqual(50);
	expect(sometimes?.visits).toBeGreaterThan(0);
});

it("stops at the injected deadline and honours cancellation", async () => {
	let now = 0;
	const game: SearchGame<number, number> = {
		sample: () => 0,
		player: () => 0,
		key: (_s, a) => String(a),
		actions: () => [1],
		apply: (s) => s + 1,
		terminal: () => false,
		evaluate: () => [0.5],
	};
	const timed = await search(game, {
		timeMs: 20,
		now: () => now++,
		fallback: 1,
	});
	expect(timed.action).toBe(1);
	expect(timed.elapsedMs).toBeLessThan(30);
	const abort = new AbortController();
	abort.abort();
	const cancelled = await search(game, {
		timeMs: 1000,
		signal: abort.signal,
		fallback: 1,
	});
	expect(cancelled.iterations).toBe(0);
});
