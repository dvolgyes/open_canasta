/** Report a one-sided bound only from source-bound, complete paired studies. */
import type { ModernMatchResult } from "../src/bot/research/modern-arena";
import {
	summarizeModernPairs,
	validModernResult,
} from "../src/bot/research/modern-evidence";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";
import { openModernStore, readStudyJson } from "./modern-store";
import { modernPairedKlLowerBound } from "./paired-kl";

const [configPath, outputPath, alphaText, ...extra] = process.argv.slice(2);
if (!configPath || !outputPath || !alphaText || extra.length)
	throw new Error(
		"usage: node --import tsx scripts/modern-kl-bound.ts CONFIG.json OUTPUT_DIRECTORY ALPHA",
	);
const alpha = Number(alphaText);
if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1)
	throw new Error("invalid paired error probability");
const parsed = parseModernStudyConfig(readStudyJson(configPath));
if (!parsed.ok) throw new Error(parsed.reason);
const config = parsed.config;
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
				!validModernResult(
					value,
					modernStudyPlan(config, index, side),
					config.simulations,
				)
			)
				throw new Error(`invalid retained match: ${name}`);
			legs.push(value);
		}
		const first = legs[0],
			second = legs[1];
		if (first && second) pairs.push([first, second]);
		else unpairedLegs += legs.length;
	}
	const summary = summarizeModernPairs(pairs, config.pairs, config.simulations);
	const lowerBound = modernPairedKlLowerBound(
		pairs,
		config.pairs,
		config.simulations,
		alpha,
	);
	process.stdout.write(
		`${JSON.stringify({ ...summary, unpairedLegs, alpha, lowerBound })}\n`,
	);
} finally {
	store.close();
}
