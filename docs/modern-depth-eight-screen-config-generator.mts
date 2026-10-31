import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";
import { addStudySeeds, earlierModernSeeds } from "./modern-research-seeds.mts";

const existing = earlierModernSeeds();
addStudySeeds(
	existing,
	["pilot", "replication"].flatMap((name) =>
		[0, 3000, 5000].map(
			(score) => `docs/modern-depth-${name}-configs/score-${score}.json`,
		),
	),
);
addStudySeeds(
	existing,
	readdirSync("docs/modern-meld-grid-configs").map((name) =>
		join("docs/modern-meld-grid-configs", name),
	),
);
if (existing.size !== 1244) throw new Error("earlier seed check incomplete");
const planned = new Set<number>();
for (const [opponent, split] of [
	["handcrafted", 0],
	["zero", 1],
] as const) {
	const old = JSON.parse(
		readFileSync(
			`docs/modern-retention-eight-fullmatch-${opponent}.json`,
			"utf8",
		),
	);
	const {
		aSimulations: _aSimulations,
		bSimulations: _bSimulations,
		...base
	} = old;
	const input = {
		...base,
		seed: 14321,
		split,
		simulations: 8,
		aDepth: 8,
		bDepth: 3,
	};
	const parsed = parseModernStudyConfig(input);
	if (!parsed.ok) throw new Error(parsed.reason);
	for (let index = 0; index < parsed.config.pairs; index++) {
		const seed = modernStudyPlan(parsed.config, index, 0).seed;
		if (existing.has(seed) || planned.has(seed))
			throw new Error(`duplicate deal seed ${seed}`);
		planned.add(seed);
	}
	writeFileSync(
		`docs/modern-depth-eight-screen-${opponent}.json`,
		`${JSON.stringify(input, null, "\t")}\n`,
	);
}
if (planned.size !== 100) throw new Error("screen seed check incomplete");
process.stdout.write(
	`${JSON.stringify({ existingSeeds: existing.size, distinctNewSeeds: planned.size })}\n`,
);
