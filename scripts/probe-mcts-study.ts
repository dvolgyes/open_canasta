/** Exploratory repeatability and prior-strength probe; emits all observations as JSON. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import {
	chooseCanasta,
	observeCanasta,
	searchActions,
} from "../src/bot/canasta-search";
import { botActions } from "../src/bot/heuristic";
import { applyAction, mulberry32, newHand } from "../src/canasta";
import {
	type PublicHistory,
	recordTransfer,
} from "../src/game/canasta-history";

async function main(): Promise<void> {
	const configuration = {
		dealSeeds: [11001, 11002, 11003, 11004],
		policySeed: 20261030,
		priorWeights: [0, 0.5, 1, 2, 4],
		preparationActions: 16,
		maxIterations: 32,
		maxDepth: 24,
		timeMs: 5000,
		repeats: 2,
	};
	const sourcePaths = [
		"src/bot/mcts.ts",
		"src/bot/canasta-search.ts",
		"src/bot/card-knowledge.ts",
		"src/bot/heuristic.ts",
		"src/game/canasta-history.ts",
		"scripts/probe-mcts-study.ts",
	];
	const hash = createHash("sha256");
	for (const path of sourcePaths) hash.update(path).update(readFileSync(path));
	const records: {
		seed: number;
		repeat: number;
		priorWeight: number;
		complete: boolean;
		legal: boolean;
		wallMs: number;
		result: Awaited<ReturnType<typeof chooseCanasta>>;
	}[] = [];
	const positions = [];
	const replays = [];
	for (const seed of configuration.dealSeeds) {
		let hand = newHand({ seed, dealer: 3, teamScores: [0, 0] });
		let history: PublicHistory | undefined;
		let prepared = 0;
		for (
			;
			prepared < configuration.preparationActions && !hand.outcome;
			prepared++
		) {
			const action = botActions(hand, hand.turn)[0];
			if (!action) throw new Error("preparation found no legal action");
			const step = applyAction(hand, hand.turn, action);
			if (!step.ok) throw new Error(step.reason);
			history = recordTransfer(history, hand, step.hand, hand.turn);
			hand = step.hand;
		}
		positions.push({
			seed,
			prepared,
			ended: hand.outcome !== null,
			phase: hand.phase,
			candidates: searchActions(hand).length,
		});
		if (hand.outcome) continue;
		const observation = observeCanasta(hand, hand.turn, history);
		const results = new Map<number, string[]>();
		for (let repeat = 0; repeat < configuration.repeats; repeat++) {
			const weights =
				repeat === 0
					? configuration.priorWeights
					: [...configuration.priorWeights].reverse();
			for (const priorWeight of weights) {
				const started = performance.now();
				const result = await chooseCanasta(observation, {
					timeMs: configuration.timeMs,
					maxIterations: configuration.maxIterations,
					maxDepth: configuration.maxDepth,
					priorWeight,
					rng: mulberry32(configuration.policySeed + seed),
				});
				const complete = result.iterations === configuration.maxIterations;
				const legal =
					result.action !== undefined &&
					applyAction(hand, hand.turn, result.action).ok;
				const replay = JSON.stringify({
					action: result.action,
					iterations: result.iterations,
					choices: result.choices,
				});
				const priorResults = results.get(priorWeight) ?? [];
				priorResults.push(replay);
				results.set(priorWeight, priorResults);
				records.push({
					seed,
					repeat,
					priorWeight,
					complete,
					legal,
					wallMs: performance.now() - started,
					result,
				});
			}
		}
		for (const [priorWeight, repetitions] of results)
			replays.push({
				seed,
				priorWeight,
				identical: new Set(repetitions).size === 1,
			});
	}
	const summary = {
		decisions: records.length,
		complete: records.every((r) => r.complete),
		legal: records.every((r) => r.legal),
		replaysIdentical: replays.every((replay) => replay.identical),
		positionsWithDifferentActions: positions.filter(
			(p) =>
				new Set(
					records
						.filter((r) => r.seed === p.seed)
						.map((r) => JSON.stringify(r.result.action)),
				).size > 1,
		).length,
		positionsWithDifferentVisitCounts: positions.filter(
			(p) =>
				new Set(
					records
						.filter((r) => r.seed === p.seed && r.repeat === 0)
						.map((r) =>
							JSON.stringify(
								r.result.choices.map((c) => ({
									action: c.action,
									visits: c.visits,
								})),
							),
						),
				).size > 1,
		).length,
	};
	console.log(
		JSON.stringify(
			{
				kind: "exploratory mechanism probe, not a playing-strength comparison",
				configuration,
				environment: {
					node: process.version,
					platform: process.platform,
					arch: process.arch,
					cpu: os.cpus()[0]?.model,
				},
				source: { paths: sourcePaths, sha256: hash.digest("hex") },
				limitations: [
					"Four heuristic-generated positions are not representative of all Canasta decisions.",
					"Zero priorWeight leaves heuristic expansion ordering and rollout guidance active.",
					"Wall times include startup and load variation; this is not a throughput benchmark.",
					"No coefficient training, match comparison, or LLM calls are performed.",
				],
				positions,
				replays,
				summary,
				records,
			},
			null,
			"\t",
		),
	);
	const expectedRecords =
		configuration.dealSeeds.length *
		configuration.priorWeights.length *
		configuration.repeats;
	if (
		!summary.complete ||
		!summary.legal ||
		!summary.replaysIdentical ||
		records.length !== expectedRecords
	)
		process.exitCode = 1;
}

await main();
