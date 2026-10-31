/** Local-only paired modern Canasta study with retained, resumable match legs. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import {
	type ModernMatchResult,
	modernResearchAgent,
	playModernMatch,
} from "../src/bot/research/modern-arena";
import {
	summarizeModernPairs,
	validModernResult,
} from "../src/bot/research/modern-evidence";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../src/bot/research/modern-study";
import { MODERN_RULES_VERSION } from "../src/canasta/modern-hand";

function readJson(path: string): unknown {
	if (statSync(path).size > 1024 * 1024)
		throw new Error(`JSON file exceeds 1 MiB: ${path}`);
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function fingerprint(): string {
	const hash = createHash("sha256");
	const visit = (path: string) => {
		if (statSync(path).isDirectory()) {
			for (const name of readdirSync(path).sort()) visit(join(path, name));
		} else {
			hash.update(path).update(readFileSync(path));
		}
	};
	for (const path of [
		"src",
		"scripts/modern-study.ts",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	])
		visit(path);
	return hash.digest("hex");
}

function writeNew(path: string, value: unknown): void {
	const temporary = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value, null, "\t")}\n`, {
		flag: "wx",
	});
	try {
		linkSync(temporary, path);
	} finally {
		unlinkSync(temporary);
	}
}

async function main(): Promise<void> {
	const [configPath, outputPath, resume, ...extra] = process.argv.slice(2);
	if (
		!configPath ||
		!outputPath ||
		extra.length ||
		(resume !== undefined && resume !== "--resume")
	)
		throw new Error(
			"usage: node --import tsx scripts/modern-study.ts CONFIG.json OUTPUT_DIRECTORY [--resume]",
		);
	const parsed = parseModernStudyConfig(readJson(configPath));
	if (!parsed.ok) throw new Error(parsed.reason);
	const config = parsed.config;
	const out = resolve(outputPath);
	const identity = {
		config,
		rulesVersion: MODERN_RULES_VERSION,
		sourceSha256: fingerprint(),
		baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim(),
		node: process.version,
	};
	const manifest = join(out, "manifest.json");
	if (resume) {
		const saved = readJson(manifest) as { identity?: unknown };
		if (JSON.stringify(saved.identity) !== JSON.stringify(identity))
			throw new Error(
				"resume requires the identical configuration, source, and Node version",
			);
	} else {
		mkdirSync(out);
		writeNew(manifest, { identity, createdAt: new Date().toISOString() });
	}
	const lockPath = join(out, "run.lock");
	const lock = openSync(lockPath, "wx");
	const abort = new AbortController();
	const stop = () => abort.abort();
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	try {
		writeFileSync(lock, JSON.stringify({ pid: process.pid, host: hostname() }));
		const budget = {
			simulations: config.simulations,
			timeMs: config.timeMs,
			depth: config.depth,
		};
		const agents = {
			a: modernResearchAgent({ ...budget, priorWeights: config.a }),
			b: modernResearchAgent({ ...budget, priorWeights: config.b }),
		};
		const pairs: [ModernMatchResult, ModernMatchResult][] = [];
		for (
			let index = 0;
			index < config.pairs && !abort.signal.aborted;
			index++
		) {
			const legs: ModernMatchResult[] = [];
			for (const side of [0, 1] as const) {
				if (abort.signal.aborted) break;
				const plan = modernStudyPlan(config, index, side);
				const path = join(out, `pair-${index}-team-${side}.json`);
				let result: ModernMatchResult;
				if (existsSync(path)) {
					const saved = readJson(path);
					if (!validModernResult(saved, plan, config.simulations))
						throw new Error(`invalid retained match: ${path}`);
					result = saved;
				} else {
					result = await playModernMatch(
						plan,
						(_seat, policy) => agents[policy],
						abort.signal,
						(progress) =>
							process.stderr.write(
								`${JSON.stringify({ pair: index, side, ...progress })}\n`,
							),
					);
					if (!validModernResult(result, plan, config.simulations))
						throw new Error("invalid generated match result");
					if (result.reason === "cancelled") {
						writeNew(`${path}.cancelled-${randomUUID()}.json`, result);
						break;
					}
					writeNew(path, result);
				}
				legs.push(result);
			}
			const first = legs[0],
				second = legs[1];
			if (!first || !second) break;
			pairs.push([first, second]);
		}
		const summary = summarizeModernPairs(
			pairs,
			config.pairs,
			config.simulations,
		);
		process.stdout.write(`${JSON.stringify(summary)}\n`);
		if (!summary.eligible) process.exitCode = 2;
	} finally {
		process.removeListener("SIGINT", stop);
		process.removeListener("SIGTERM", stop);
		closeSync(lock);
		unlinkSync(lockPath);
	}
}

await main();
