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

it("tells the prior whether a decision is at the root or later in the tree", async () => {
	const depths: number[] = [];
	const game: SearchGame<number, number> = {
		sample: () => 0,
		player: () => 0,
		key: (_state, action) => String(action),
		actions: () => [1],
		apply: (state) => state + 1,
		terminal: (state) => state >= 3,
		evaluate: () => [0.5],
		prior: (_state, _action, depth) => {
			depths.push(depth);
			return 0;
		},
	};
	await search(game, { timeMs: 1000, maxIterations: 3, maxDepth: 3 });
	expect(depths).toContain(0);
	expect(depths).toContain(1);
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

it("can compare full tree search with a root-only rollout control", async () => {
	const game: SearchGame<string, string> = {
		sample: () => "root",
		player: (state) => (state === "root" ? 0 : 1),
		key: (_state, action) => action,
		actions: (state) =>
			state === "root" ? ["safe", "trap"] : ["punish", "blunder"],
		apply: (_state, action) => action,
		terminal: (state) => ["safe", "punish", "blunder"].includes(state),
		evaluate: (state) =>
			state === "safe" ? [0.7, 0.3] : state === "blunder" ? [1, 0] : [0, 1],
		rollout: (_state, actions) =>
			actions.includes("blunder") ? "blunder" : (actions[0] ?? "safe"),
	};
	const options = {
		timeMs: 1000,
		maxIterations: 500,
		maxDepth: 2,
		now: () => 0,
	};
	const full = await search(game, { ...options, rng: mulberry32(1) });
	const depthTwo = await search(game, {
		...options,
		maxTreeDepth: 2,
		rng: mulberry32(1),
	});
	const rootOnly = await search(game, {
		...options,
		maxTreeDepth: 1,
		rng: mulberry32(1),
	});
	expect(full.iterations).toBe(500);
	expect(depthTwo).toEqual(full);
	expect(rootOnly.iterations).toBe(500);
	expect(full.action).toBe("safe");
	expect(rootOnly.action).toBe("trap");
});

it("lets a simulated opponent use its own private observation", async () => {
	type State = { bit: number; stage: number; guess?: number };
	type Action = "pass" | "guess0" | "guess1";
	const rng = mulberry32(314159);
	const game = {
		sample: (): State => ({ bit: Math.floor(rng() * 2), stage: 0 }),
		player: (state: State) => state.stage,
		informationKey: (state: State) =>
			state.stage === 0 ? "root" : `opponent-bit:${state.bit}`,
		key: (_state: State, action: Action) => action,
		actions: (state: State): Action[] =>
			state.stage === 0 ? ["pass"] : ["guess0", "guess1"],
		apply: (state: State, action: Action): State =>
			action === "pass"
				? { ...state, stage: 1 }
				: { ...state, stage: 2, guess: action === "guess0" ? 0 : 1 },
		terminal: (state: State) => state.stage === 2,
		evaluate: (state: State) => (state.guess === state.bit ? [0, 1] : [1, 0]),
	};
	const result = await search(game, {
		timeMs: 1000,
		maxIterations: 10000,
		maxDepth: 2,
		rng,
		now: () => 0,
	});
	expect(result.iterations).toBe(10000);
	expect(result.choices[0]?.mean).toBeLessThan(0.05);
});

it("rejects sampled states that disagree about the root observation", async () => {
	let sample = 0;
	const game: SearchGame<number, string> = {
		sample: () => sample++,
		player: () => 0,
		informationKey: (state) => String(state),
		key: (_state, action) => action,
		actions: () => ["pass"],
		apply: () => 2,
		terminal: (state) => state === 2,
		evaluate: () => [1],
	};
	await expect(
		search(game, { timeMs: 1000, maxIterations: 2, maxDepth: 1 }),
	).rejects.toThrow("samples disagree on root information");
	await expect(
		search(
			{ ...game, sample: () => 0, informationKey: () => null as never },
			{ timeMs: 1000, maxIterations: 1, maxDepth: 1 },
		),
	).rejects.toThrow("information keys must be strings");
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
	await expect(search(game, { timeMs: 1, maxTreeDepth: 0 })).rejects.toThrow(
		/invalid search limits/,
	);
	await expect(
		search(game, { timeMs: 1, maxTreeDepth: Number.POSITIVE_INFINITY }),
	).rejects.toThrow(/invalid search limits/);
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

it("does not change two-iteration decisions when only the exploration constant changes", async () => {
	type State = { stage: number; hidden: number; total: number };
	const run = async (
		seed: number,
		rootChoices: number,
		exploration: number,
	) => {
		const rng = mulberry32(seed);
		const game: SearchGame<State, number> = {
			sample: () => ({ stage: 0, hidden: Number(rng() < 0.5), total: 0 }),
			player: (state) => state.stage % 2,
			key: (_state, action) => String(action),
			actions: (state) =>
				Array.from(
					{ length: state.stage === 0 ? rootChoices : 2 + state.hidden },
					(_, index) => index,
				),
			apply: (state, action) => ({
				...state,
				stage: state.stage + 1,
				total: state.total + action,
			}),
			terminal: (state) => state.stage === 4,
			evaluate: (state) => (state.total % 2 === 0 ? [1, 0] : [0, 1]),
			prior: (_state, action) => action / 4,
		};
		const { elapsedMs: _elapsedMs, ...result } = await search(game, {
			timeMs: 1000,
			maxIterations: 2,
			maxDepth: 4,
			exploration,
			widening: 1,
			rng,
			now: () => 0,
		});
		return result;
	};
	for (const rootChoices of [1, 3]) {
		for (let seed = 0; seed < 100; seed++) {
			expect(await run(seed, rootChoices, 0)).toEqual(
				await run(seed, rootChoices, 1000),
			);
		}
	}
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

it("stops scoring candidate priors when the deadline expires", async () => {
	let clock = 0;
	let scored = 0;
	const result = await search<number, number>(
		{
			sample: () => 0,
			player: () => 0,
			key: (_state, action) => String(action),
			actions: () => Array.from({ length: 100 }, (_, i) => i),
			apply: () => 1,
			terminal: (state) => state === 1,
			evaluate: () => [0.5],
			prior: () => {
				scored++;
				clock++;
				return 0;
			},
		},
		{ timeMs: 5, maxIterations: 1, now: () => clock, fallback: 0 },
	);
	expect(scored).toBeLessThan(100);
	expect(result.iterations).toBe(0);
	expect(result.action).toBe(0);
});

it("does not count availability from a deadline-interrupted iteration", async () => {
	let clock = 0;
	let calls = 0;
	const result = await search<number, number>(
		{
			sample: () => 0,
			player: () => 0,
			key: (_state, action) => String(action),
			actions: () => [0, 1],
			apply: () => 1,
			terminal: (state) => state === 1,
			evaluate: () => [0.5],
			prior: () => {
				calls++;
				if (calls === 3) clock = 10;
				return 0;
			},
		},
		{ timeMs: 5, maxIterations: 2, now: () => clock, rng: () => 0 },
	);
	expect(result.iterations).toBe(1);
	expect(result.choices.find((choice) => choice.visits === 1)?.available).toBe(
		1,
	);
});
