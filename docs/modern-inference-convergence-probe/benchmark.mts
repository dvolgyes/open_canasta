import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const [baselinePath, candidatePath, ...extra] = process.argv.slice(2);
if (!baselinePath || !candidatePath || extra.length)
	throw new Error(
		"usage: node --import tsx docs/modern-inference-convergence-probe/benchmark.mts BASELINE.ts CANDIDATE.ts",
	);
const before = (await import(pathToFileURL(baselinePath).href)).inferCards;
const after = (await import(pathToFileURL(candidatePath).href)).inferCards;
const corpus = JSON.parse(
	gunzipSync(
		readFileSync("docs/modern-inference-convergence-probe/corpus.json.gz"),
	).toString("utf8"),
);
if (corpus.length !== 120) throw new Error("unexpected corpus");
for (const { input } of corpus) {
	if (JSON.stringify(before(input)) !== JSON.stringify(after(input)))
		throw new Error("bounds differ");
}
const samples = [];
for (let round = 0; round < 5; round++) {
	let oldMs = 0,
		newMs = 0;
	for (const [index, { input }] of corpus.entries()) {
		for (const name of (index + round) % 2 === 0
			? ["old", "new"]
			: ["new", "old"]) {
			const start = performance.now();
			if (name === "old") before(input);
			else after(input);
			const elapsed = performance.now() - start;
			if (name === "old") oldMs += elapsed;
			else newMs += elapsed;
		}
	}
	samples.push({ oldMs, newMs, ratio: newMs / oldMs });
}
const ratios = samples.map((sample) => sample.ratio).toSorted((a, b) => a - b);
process.stdout.write(
	`${JSON.stringify({ observations: corpus.length, equalBounds: true, samples, medianRatio: ratios[2] })}\n`,
);
