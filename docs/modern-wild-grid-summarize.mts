import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openModernStore } from "../scripts/modern-store";
import { MODERN_PRIOR_WEIGHTS } from "../src/bot/modern-prior";
import type { ModernMatchResult } from "../src/bot/research/modern-arena";
import {
	summarizeModernHandPairs,
	validModernResult,
} from "../src/bot/research/modern-evidence";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";

const [root, ...extra] = process.argv.slice(2);
if (!root || extra.length)
	throw new Error(
		"usage: node --import tsx docs/modern-wild-grid-summarize.mts OUTPUT_ROOT|--configs-only",
	);
const configsOnly = root === "--configs-only";
const weights = [-20, 0, 10, 25, 50, 100];
const results: {
	weight: number;
	wins: number;
	losses: number;
	ties: number;
}[] = [];
for (const weight of weights) {
	const total = { weight, wins: 0, losses: 0, ties: 0 };
	for (const [split, score] of [0, 3000, 5000].entries()) {
		const label = `${weight < 0 ? `neg${-weight}` : `pos${weight}`}-${score}`;
		const actual = parseModernStudyConfig(
			JSON.parse(
				readFileSync(`docs/modern-wild-grid-configs/${label}.json`, "utf8"),
			),
		);
		const expected = parseModernStudyConfig({
			version: 1,
			seed: 18173,
			split,
			pairs: 8,
			maxHands: 1,
			maxActionsPerHand: 300,
			simulations: 8,
			timeMs: 30000,
			depth: 8,
			initialTeamScore: score,
			a: { ...MODERN_PRIOR_WEIGHTS, discardPair: 25, wildSpent: weight },
			b: MODERN_PRIOR_WEIGHTS,
		});
		if (
			!actual.ok ||
			!expected.ok ||
			JSON.stringify(actual.config) !== JSON.stringify(expected.config)
		)
			throw new Error(`unexpected grid configuration: ${label}`);
		if (configsOnly) continue;
		const config = actual.config;
		const store = openModernStore(join(root, label), true, config, [
			"scripts/modern-study.ts",
		]);
		try {
			const pairs: [ModernMatchResult, ModernMatchResult][] = [];
			for (let index = 0; index < config.pairs; index++) {
				const legs = ([0, 1] as const).map((side) => {
					const name = `pair-${index}-team-${side}.json`;
					const value = store.read(name);
					if (
						!validModernResult(
							value,
							modernStudyPlan(config, index, side),
							config.simulations,
						)
					)
						throw new Error(`invalid retained hand: ${label}/${name}`);
					return value;
				});
				const first = legs[0],
					second = legs[1];
				if (!first || !second) throw new Error("missing paired hand");
				pairs.push([first, second]);
			}
			const summary = summarizeModernHandPairs(
				pairs,
				config.pairs,
				config.simulations,
			);
			if (!summary.eligible)
				throw new Error(`ineligible training hands: ${label}`);
			total.wins += summary.handWins;
			total.losses += summary.handLosses;
			total.ties += summary.tiedHands;
		} finally {
			store.close();
		}
	}
	if (configsOnly) continue;
	if (total.wins + total.losses + total.ties !== 48)
		throw new Error("invalid grid hand count");
	results.push(total);
}
if (configsOnly) {
	process.stdout.write(
		`${JSON.stringify({ status: "valid", configurations: 18 })}\n`,
	);
	process.exit(0);
}
const score = (item: (typeof results)[number]) => item.wins + item.ties / 2;
const ordered = results.toSorted(
	(a, b) =>
		score(b) - score(a) ||
		Math.abs(a.weight - 10) - Math.abs(b.weight - 10) ||
		a.weight - b.weight,
);
const winner = ordered[0];
const incumbent = results.find((item) => item.weight === 10);
if (!winner || !incumbent) throw new Error("missing grid candidate");
process.stdout.write(
	`${JSON.stringify({ status: "complete", results, selectedWeight: winner.weight, predictionMet: score(winner) > score(incumbent) })}\n`,
);
