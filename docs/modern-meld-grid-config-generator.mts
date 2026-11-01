import { readFileSync, writeFileSync } from "node:fs";
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
if (existing.size !== 1220) throw new Error("earlier seed check incomplete");
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
const weights = [-12, -4, 0, 4, 8, 16];
const planned = new Set<number>();
const byScore = new Map<number, string>();
for (const weight of weights)
	for (const [split, score] of [0, 3000, 5000].entries()) {
		const input = {
			...base,
			seed: 14123,
			split,
			pairs: 8,
			maxHands: 1,
			initialTeamScore: score,
			simulations: 2,
			a: { ...base.a, cardsMelded: weight },
		};
		const parsed = parseModernStudyConfig(input);
		if (!parsed.ok) throw new Error(parsed.reason);
		const seeds = Array.from(
			{ length: parsed.config.pairs },
			(_, i) => modernStudyPlan(parsed.config, i, 0).seed,
		);
		const key = JSON.stringify(seeds);
		if (byScore.has(score)) {
			if (byScore.get(score) !== key)
				throw new Error("weights do not share deals");
		} else {
			for (const seed of seeds) {
				if (existing.has(seed) || planned.has(seed))
					throw new Error(`duplicate deal seed ${seed}`);
				planned.add(seed);
			}
			byScore.set(score, key);
		}
		const label = `${weight < 0 ? `neg${-weight}` : `pos${weight}`}-${score}`;
		writeFileSync(
			`docs/modern-meld-grid-configs/${label}.json`,
			`${JSON.stringify(input, null, "\t")}\n`,
		);
	}
if (planned.size !== 24 || byScore.size !== 3)
	throw new Error("grid seed check incomplete");
process.stdout.write(
	`${JSON.stringify({ existingSeeds: existing.size, distinctNewSeeds: planned.size, configurations: weights.length * byScore.size })}\n`,
);
