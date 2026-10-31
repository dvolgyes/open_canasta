/** Summarize source-bound one-hand studies without treating them as full matches. */
import type { ModernMatchResult } from "../src/bot/research/modern-arena";
import {
	summarizeModernHandPairs,
	validModernResult,
} from "../src/bot/research/modern-evidence";
import {
	modernStudyBudgets,
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";
import { openModernStore, readStudyJson } from "./modern-store";

const [configPath, outputPath, ...extra] = process.argv.slice(2);
if (!configPath || !outputPath || extra.length)
	throw new Error(
		"usage: node --import tsx scripts/modern-hand-summary.ts CONFIG.json OUTPUT_DIRECTORY",
	);
const parsed = parseModernStudyConfig(readStudyJson(configPath));
if (!parsed.ok) throw new Error(parsed.reason);
const config = parsed.config;
if (config.maxHands !== 1)
	throw new Error("hand summary requires a one-hand study");
const budgets = modernStudyBudgets(config);
const store = openModernStore(outputPath, true, config, [
	"scripts/modern-study.ts",
]);
try {
	const pairs: [ModernMatchResult, ModernMatchResult][] = [];
	let unpairedLegs = 0;
	for (let index = 0; index < config.pairs; index++) {
		const legs: ModernMatchResult[] = [];
		for (const side of [0, 1] as const) {
			const name = `pair-${index}-team-${side}.json`;
			if (!store.exists(name)) continue;
			const value = store.read(name);
			if (
				!validModernResult(value, modernStudyPlan(config, index, side), budgets)
			)
				throw new Error(`invalid retained match: ${name}`);
			legs.push(value);
		}
		const first = legs[0],
			second = legs[1];
		if (first && second) pairs.push([first, second]);
		else unpairedLegs += legs.length;
	}
	const summary = summarizeModernHandPairs(pairs, config.pairs, budgets);
	process.stdout.write(`${JSON.stringify({ ...summary, unpairedLegs })}\n`);
	if (!summary.eligible || unpairedLegs) process.exitCode = 2;
} finally {
	store.close();
}
