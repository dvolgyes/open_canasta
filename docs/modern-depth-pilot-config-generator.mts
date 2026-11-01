import { readFileSync, writeFileSync } from "node:fs";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";
import { addStudySeeds, earlierModernSeeds } from "./modern-research-seeds.mts";

const [mode = "pilot", ...extra] = process.argv.slice(2);
if ((mode !== "pilot" && mode !== "replication") || extra.length)
	throw new Error(
		"usage: node --import tsx docs/modern-depth-pilot-config-generator.mts [pilot|replication]",
	);
const existing = earlierModernSeeds();
if (mode === "replication")
	addStudySeeds(
		existing,
		[0, 3000, 5000].map(
			(score) => `docs/modern-depth-pilot-configs/score-${score}.json`,
		),
	);
const old = JSON.parse(
	readFileSync(
		"docs/modern-retention-eight-fullmatch-handcrafted.json",
		"utf8",
	),
);
const {
	aSimulations: _aSimulations,
	bSimulations: _bSimulations,
	...base
} = old;
const planned = new Set<number>();
for (const [split, score] of [0, 3000, 5000].entries()) {
	const input = {
		...base,
		seed: mode === "pilot" ? 13119 : 13121,
		split,
		pairs: mode === "pilot" ? 4 : 8,
		maxHands: 1,
		initialTeamScore: score,
		simulations: 8,
		aDepth: 8,
		bDepth: 3,
		b: base.a,
	};
	const parsed = parseModernStudyConfig(input);
	if (!parsed.ok) throw new Error(parsed.reason);
	for (let i = 0; i < parsed.config.pairs; i++) {
		const seed = modernStudyPlan(parsed.config, i, 0).seed;
		if (existing.has(seed) || planned.has(seed))
			throw new Error(`duplicate deal seed ${seed}`);
		planned.add(seed);
	}
	writeFileSync(
		`docs/modern-depth-${mode}-configs/score-${score}.json`,
		`${JSON.stringify(input, null, "\t")}\n`,
	);
}
if (
	existing.size !== (mode === "pilot" ? 1184 : 1196) ||
	planned.size !== (mode === "pilot" ? 12 : 24)
)
	throw new Error("seed check incomplete");
process.stdout.write(
	`${JSON.stringify({ existingSeeds: existing.size, distinctNewSeeds: planned.size })}\n`,
);
