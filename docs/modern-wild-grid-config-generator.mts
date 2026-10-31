import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
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
addStudySeeds(existing, [
	"docs/modern-depth-eight-screen-handcrafted.json",
	"docs/modern-depth-eight-screen-zero.json",
]);
if (existing.size !== 1344) throw new Error("earlier seed check incomplete");
const recorded = JSON.parse(
	gunzipSync(readFileSync("docs/modern-wild-recorded-seeds.json.gz")).toString(
		"utf8",
	),
) as { inputFiles?: unknown; recordedSeeds?: unknown };
if (
	recorded.inputFiles !== 7548 ||
	!Array.isArray(recorded.recordedSeeds) ||
	recorded.recordedSeeds.length !== 1754 ||
	recorded.recordedSeeds.some(
		(seed) => !Number.isSafeInteger(seed) || seed < 0,
	) ||
	new Set(recorded.recordedSeeds).size !== recorded.recordedSeeds.length
)
	throw new Error("invalid recorded seed inventory");
for (const seed of recorded.recordedSeeds as number[]) existing.add(seed);
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
const weights = [-20, 0, 10, 25, 50, 100];
const planned = new Set<number>();
const byScore = new Map<number, string>();
for (const weight of weights)
	for (const [split, score] of [0, 3000, 5000].entries()) {
		const input = {
			...base,
			seed: 18173,
			split,
			pairs: 8,
			maxHands: 1,
			initialTeamScore: score,
			simulations: 8,
			depth: 8,
			a: { ...base.a, wildSpent: weight },
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
			`docs/modern-wild-grid-configs/${label}.json`,
			`${JSON.stringify(input, null, "\t")}\n`,
		);
	}
if (planned.size !== 24 || byScore.size !== 3)
	throw new Error("grid seed check incomplete");
process.stdout.write(
	`${JSON.stringify({ existingSeeds: existing.size, distinctNewSeeds: planned.size, configurations: weights.length * byScore.size })}\n`,
);
