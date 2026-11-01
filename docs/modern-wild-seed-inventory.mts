import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const paths = gunzipSync(readFileSync("docs/modern-wild-seed-inputs.txt.gz"))
	.toString("utf8")
	.trim()
	.split("\n");
if (paths.length !== 7548 || new Set(paths).size !== paths.length)
	throw new Error("unexpected seed-inventory input list");
const seeds = new Set<number>([121, 9137]);
const collect = (value: unknown): void => {
	if (typeof value !== "object" || value === null) return;
	if (Array.isArray(value)) {
		for (const child of value) collect(child);
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		if (key === "seed" && Number.isSafeInteger(child) && (child as number) >= 0)
			seeds.add(child as number);
		else collect(child);
	}
};
for (const path of paths) {
	const bytes = readFileSync(path);
	const text = (path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString(
		"utf8",
	);
	if (/\.jsonl(?:\.gz)?$/.test(path)) {
		for (const line of text.trim().split("\n"))
			if (line) collect(JSON.parse(line));
	} else collect(JSON.parse(text));
}
const recordedSeeds = [...seeds].toSorted((a, b) => a - b);
writeFileSync(
	"docs/modern-wild-recorded-seeds.json.gz",
	gzipSync(
		Buffer.from(
			`${JSON.stringify({ inputFiles: paths.length, recordedSeeds })}\n`,
		),
	),
);
process.stdout.write(
	`${JSON.stringify({ inputFiles: paths.length, recordedSeeds: seeds.size })}\n`,
);
