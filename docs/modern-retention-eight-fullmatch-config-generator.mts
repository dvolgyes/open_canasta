import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";

const manifest = gunzipSync(
	readFileSync("docs/modern-retention-eight-seed-inputs.txt.gz"),
)
	.toString("utf8")
	.trim()
	.split("\n")
	.filter(Boolean);
const existing = new Set<number>();
for (const path of manifest) {
	const record = JSON.parse(readFileSync(path, "utf8"));
	if (typeof record.plan?.seed === "number") existing.add(record.plan.seed);
}
const files = [
	"docs/modern-pair-confirm-handcrafted.json",
	"docs/modern-pair-confirm-zero.json",
	"docs/modern-pair-pile-heldout-config.json",
	"docs/modern-pair-retention-heldout-handcrafted.json",
	"docs/modern-pair-retention-heldout-zero.json",
	...[
		"docs/modern-pair-pile-grid-configs",
		"docs/modern-pair-retention-grid-configs",
		"docs/modern-retention-eight-hand-configs",
	].flatMap((dir) => readdirSync(dir).map((name) => join(dir, name))),
];
for (const path of files) {
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
const planned = new Set<number>();
for (const [opponent, split] of [
	["handcrafted", 0],
	["zero", 1],
] as const) {
	const old = JSON.parse(
		readFileSync(`docs/modern-pair-retention-heldout-${opponent}.json`, "utf8"),
	);
	const input = {
		...old,
		seed: 12913,
		split,
		aSimulations: 8,
		bSimulations: 2,
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
		`docs/modern-retention-eight-fullmatch-${opponent}.json`,
		`${JSON.stringify(input, null, "\t")}\n`,
	);
}
if (planned.size !== 100 || existing.size < 1000)
	throw new Error("seed check incomplete");
console.log(
	JSON.stringify({
		existingSeeds: existing.size,
		distinctNewSeeds: planned.size,
	}),
);
