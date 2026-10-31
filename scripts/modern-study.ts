/** Local-only paired modern Canasta study with retained, resumable match legs. */
import { randomUUID } from "node:crypto";
import {
	type ModernMatchResult,
	modernResearchAgent,
	playModernMatch,
} from "../src/bot/research/modern-arena";
import {
	summarizeModernPairs,
	validModernResult,
} from "../src/bot/research/modern-evidence";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";
import { openModernStore, readStudyJson } from "./modern-store";

async function main(): Promise<void> {
	const [configPath, outputPath, resume, ...extra] = process.argv.slice(2);
	if (
		!configPath ||
		!outputPath ||
		extra.length ||
		(resume !== undefined && resume !== "--resume")
	)
		throw new Error(
			"usage: node --import tsx scripts/modern-study.ts CONFIG.json OUTPUT_DIRECTORY [--resume]",
		);
	const parsed = parseModernStudyConfig(readStudyJson(configPath));
	if (!parsed.ok) throw new Error(parsed.reason);
	const config = parsed.config;
	const store = openModernStore(outputPath, resume === "--resume", config, [
		"scripts/modern-study.ts",
	]);
	const abort = new AbortController();
	const stop = () => abort.abort();
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	try {
		const budget = {
			simulations: config.simulations,
			timeMs: config.timeMs,
			depth: config.depth,
		};
		const agents = {
			a: modernResearchAgent({
				...budget,
				priorWeights: config.a,
				...(config.aPriorWeight === undefined
					? {}
					: { priorWeight: config.aPriorWeight }),
				...(config.aSevenBlockedV1Weight === undefined
					? {}
					: { sevenBlockedV1Weight: config.aSevenBlockedV1Weight }),
				...(config.aKnownPairV1Weight === undefined
					? {}
					: { knownPairV1Weight: config.aKnownPairV1Weight }),
				...(config.aDiscardRiskV1Weight === undefined
					? {}
					: { discardRiskV1Weight: config.aDiscardRiskV1Weight }),
				...(config.aPairThreatV1Weight === undefined
					? {}
					: { pairThreatV1Weight: config.aPairThreatV1Weight }),
				...(config.aPairPileV1Weight === undefined
					? {}
					: { pairPileV1Weight: config.aPairPileV1Weight }),
			}),
			b: modernResearchAgent({
				...budget,
				priorWeights: config.b,
				...(config.bPriorWeight === undefined
					? {}
					: { priorWeight: config.bPriorWeight }),
				...(config.bSevenBlockedV1Weight === undefined
					? {}
					: { sevenBlockedV1Weight: config.bSevenBlockedV1Weight }),
				...(config.bKnownPairV1Weight === undefined
					? {}
					: { knownPairV1Weight: config.bKnownPairV1Weight }),
				...(config.bDiscardRiskV1Weight === undefined
					? {}
					: { discardRiskV1Weight: config.bDiscardRiskV1Weight }),
				...(config.bPairThreatV1Weight === undefined
					? {}
					: { pairThreatV1Weight: config.bPairThreatV1Weight }),
				...(config.bPairPileV1Weight === undefined
					? {}
					: { pairPileV1Weight: config.bPairPileV1Weight }),
			}),
		};
		const pairs: [ModernMatchResult, ModernMatchResult][] = [];
		for (
			let index = 0;
			index < config.pairs && !abort.signal.aborted;
			index++
		) {
			const legs: ModernMatchResult[] = [];
			for (const side of [0, 1] as const) {
				if (abort.signal.aborted) break;
				const plan = modernStudyPlan(config, index, side);
				const name = `pair-${index}-team-${side}.json`;
				let result: ModernMatchResult;
				if (store.exists(name)) {
					const saved = store.read(name);
					if (!validModernResult(saved, plan, config.simulations))
						throw new Error(`invalid retained match: ${name}`);
					result = saved;
				} else {
					result = await playModernMatch(
						plan,
						(_seat, policy) => agents[policy],
						abort.signal,
						(progress) =>
							process.stderr.write(
								`${JSON.stringify({ pair: index, side, ...progress })}\n`,
							),
					);
					if (!validModernResult(result, plan, config.simulations))
						throw new Error("invalid generated match result");
					if (result.reason === "cancelled") {
						store.write(
							`pair-${index}-team-${side}.cancelled-${randomUUID()}.json`,
							result,
						);
						break;
					}
					store.write(name, result);
				}
				legs.push(result);
			}
			const first = legs[0],
				second = legs[1];
			if (!first || !second) break;
			pairs.push([first, second]);
		}
		const summary = summarizeModernPairs(
			pairs,
			config.pairs,
			config.simulations,
		);
		process.stdout.write(`${JSON.stringify(summary)}\n`);
		if (!summary.eligible) process.exitCode = 2;
	} finally {
		process.removeListener("SIGINT", stop);
		process.removeListener("SIGTERM", stop);
		store.close();
	}
}

await main();
