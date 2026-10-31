import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";

const [mode = "pilot", ...extra] = process.argv.slice(2);
if ((mode !== "pilot" && mode !== "replication") || extra.length)
	throw new Error(
		"usage: node --import tsx docs/modern-depth-pilot-config-generator.mts [pilot|replication]",
	);
const existing = new Set<number>();
const manifest = gunzipSync(
	readFileSync("docs/modern-retention-eight-seed-inputs.txt.gz"),
)
	.toString("utf8")
	.trim()
	.split("\n")
	.filter(Boolean);
for (const path of manifest) {
	const record = JSON.parse(readFileSync(path, "utf8"));
	if (typeof record.plan?.seed === "number") existing.add(record.plan.seed);
}
const configs = [
	"docs/modern-pair-confirm-handcrafted.json",
	"docs/modern-pair-confirm-zero.json",
	"docs/modern-pair-pile-heldout-config.json",
	"docs/modern-pair-retention-heldout-handcrafted.json",
	"docs/modern-pair-retention-heldout-zero.json",
	"docs/modern-retention-eight-fullmatch-handcrafted.json",
	"docs/modern-retention-eight-fullmatch-zero.json",
	...(mode === "replication"
		? [0, 3000, 5000].map(
				(score) => `docs/modern-depth-pilot-configs/score-${score}.json`,
			)
		: []),
	...[
		"docs/modern-pair-pile-grid-configs",
		"docs/modern-pair-retention-grid-configs",
		"docs/modern-retention-eight-hand-configs",
	].flatMap((dir) => readdirSync(dir).map((name) => join(dir, name))),
];
for (const path of configs) {
	const parsed = parseModernStudyConfig(JSON.parse(readFileSync(path, "utf8")));
	if (!parsed.ok) throw new Error(parsed.reason);
	for (let i = 0; i < parsed.config.pairs; i++)
		existing.add(modernStudyPlan(parsed.config, i, 0).seed);
}
for (const line of gunzipSync(
	readFileSync("docs/modern-eight-vs-two-replication-results/results.jsonl.gz"),
)
	.toString("utf8")
	.trim()
	.split("\n"))
	existing.add(JSON.parse(line).result.plan.seed);
for (let seed = 27000; seed <= 27011; seed++) existing.add(seed);
for (let seed = 28000; seed <= 28023; seed++) existing.add(seed);
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
