/** Local paired SPSA study with retained legs and deterministic replay on resume. */
import { randomUUID } from "node:crypto";
import {
	type ModernMatchResult,
	modernResearchAgent,
	playModernMatch,
} from "../src/bot/research/modern-arena";
import { validModernResult } from "../src/bot/research/modern-evidence";
import {
	type ModernOptimizationEvent,
	type ModernOptimizationJob,
	parseModernOptimizerConfig,
	runModernOptimizer,
} from "../src/bot/research/modern-optimizer";
import {
	type ModernStudyStore,
	openModernStore,
	readStudyJson,
} from "./modern-store";

function jobName(job: ModernOptimizationJob): string {
	return `update-${job.update}-${job.label}-block-${job.block}`;
}

function retainIdentical(
	store: ModernStudyStore,
	name: string,
	value: unknown,
): void {
	if (!store.exists(name)) store.write(name, value);
	else if (JSON.stringify(store.read(name)) !== JSON.stringify(value))
		throw new Error(`retained optimizer record differs: ${name}`);
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
			"usage: node --import tsx scripts/modern-optimize.ts CONFIG.json OUTPUT_DIRECTORY [--resume]",
		);
	const parsed = parseModernOptimizerConfig(readStudyJson(configPath));
	if (!parsed.ok) throw new Error(parsed.reason);
	const config = parsed.config;
	const store = openModernStore(outputPath, resume === "--resume", config, [
		"scripts/modern-optimize.ts",
	]);
	const abort = new AbortController();
	const stop = () => abort.abort();
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	try {
		const evaluate = async (
			job: ModernOptimizationJob,
		): Promise<readonly [ModernMatchResult, ModernMatchResult] | null> => {
			const name = jobName(job);
			retainIdentical(store, `${name}.job.json`, job);
			const budget = {
				simulations: config.simulations,
				timeMs: config.timeMs,
				depth: config.depth,
			};
			const agents = {
				a: modernResearchAgent({ ...budget, priorWeights: job.candidate }),
				b: modernResearchAgent({ ...budget, priorWeights: job.opponent }),
			};
			const legs: ModernMatchResult[] = [];
			for (const side of [0, 1] as const) {
				if (abort.signal.aborted) return null;
				const plan = job.plans[side];
				const path = `${name}-team-${side}.json`;
				let result: ModernMatchResult;
				if (store.exists(path)) {
					const saved = store.read(path);
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
								`${JSON.stringify({ update: job.update, label: job.label, block: job.block, side, ...progress })}\n`,
							),
					);
					if (!validModernResult(result, plan, config.simulations))
						throw new Error("invalid generated match result");
					if (result.reason === "cancelled") {
						store.write(
							`${name}-team-${side}.cancelled-${randomUUID()}.json`,
							result,
						);
						return null;
					}
					store.write(path, result);
				}
				legs.push(result);
			}
			const first = legs[0],
				second = legs[1];
			if (!first || !second) throw new Error("missing modern optimizer leg");
			return [first, second];
		};
		const emit = async (event: ModernOptimizationEvent) => {
			if (event.kind === "pair") {
				const job = event.job as ModernOptimizationJob;
				retainIdentical(store, `${jobName(job)}.summary.json`, event.summary);
			} else if (event.kind === "update") {
				if (!Number.isSafeInteger(event.update))
					throw new Error("invalid optimizer update");
				retainIdentical(store, `update-${event.update}.json`, event);
			} else if (event.kind === "invalid-pair") {
				const job = event.job as ModernOptimizationJob;
				store.write(`${jobName(job)}.invalid-${randomUUID()}.json`, event);
			}
		};
		const result = await runModernOptimizer(config, evaluate, emit);
		process.stdout.write(`${JSON.stringify(result)}\n`);
		if (result.status !== "complete") process.exitCode = 2;
	} finally {
		process.removeListener("SIGINT", stop);
		process.removeListener("SIGTERM", stop);
		store.close();
	}
}

await main();
