import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";

/** Add every planned deal from the listed fixed study configurations. */
export function addStudySeeds(
	seeds: Set<number>,
	paths: readonly string[],
): void {
	for (const path of paths) {
		const parsed = parseModernStudyConfig(
			JSON.parse(readFileSync(path, "utf8")),
		);
		if (!parsed.ok) throw new Error(parsed.reason);
		for (let index = 0; index < parsed.config.pairs; index++)
			seeds.add(modernStudyPlan(parsed.config, index, 0).seed);
	}
}

/** Fixed earlier records and plans used by the depth and meld-prior studies. */
export function earlierModernSeeds(): Set<number> {
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
	addStudySeeds(existing, [
		"docs/modern-pair-confirm-handcrafted.json",
		"docs/modern-pair-confirm-zero.json",
		"docs/modern-pair-pile-heldout-config.json",
		"docs/modern-pair-retention-heldout-handcrafted.json",
		"docs/modern-pair-retention-heldout-zero.json",
		"docs/modern-retention-eight-fullmatch-handcrafted.json",
		"docs/modern-retention-eight-fullmatch-zero.json",
		...[
			"docs/modern-pair-pile-grid-configs",
			"docs/modern-pair-retention-grid-configs",
			"docs/modern-retention-eight-hand-configs",
		].flatMap((dir) => readdirSync(dir).map((name) => join(dir, name))),
	]);
	for (const line of gunzipSync(
		readFileSync(
			"docs/modern-eight-vs-two-replication-results/results.jsonl.gz",
		),
	)
		.toString("utf8")
		.trim()
		.split("\n"))
		existing.add(JSON.parse(line).result.plan.seed);
	for (let seed = 27000; seed <= 27011; seed++) existing.add(seed);
	for (let seed = 28000; seed <= 28023; seed++) existing.add(seed);
	if (existing.size !== 1184) throw new Error("earlier seed check incomplete");
	return existing;
}
