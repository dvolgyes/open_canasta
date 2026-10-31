/** Headless research CLI: bounded local campaigns, paired workers, and replay from retained legs. */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { REFERENCE_PRIOR } from "../src/bot/canasta-prior";
import { NODE_PROMPT_TEMPLATES } from "../src/bot/node-prompts";
import {
	type MatchPlan,
	type MatchResult,
	playMatch,
	playPair,
} from "../src/bot/research/arena";
import {
	type CampaignConfig,
	makePairJob,
	type PairJob,
	runCampaign,
	studySeed,
} from "../src/bot/research/campaign";
import { mapConcurrent } from "../src/bot/research/concurrency";
import { parseStudyConfig } from "../src/bot/research/config";
import {
	type RequestRecord,
	researchChooser,
	validRequestRecord,
} from "../src/bot/research/openrouter";
import {
	type LocalPolicy,
	llmAgent,
	localAgent,
} from "../src/bot/research/policies";
import { boundedEstimate } from "../src/bot/research/statistics";

function readJson(path: string): unknown {
	if (statSync(path).size > 1024 * 1024)
		throw new Error(`JSON file exceeds 1 MiB: ${path}`);
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
function fingerprint(): string {
	const hash = createHash("sha256");
	const visit = (path: string) => {
		if (statSync(path).isDirectory())
			for (const name of readdirSync(path).sort()) visit(join(path, name));
		else if (
			path.endsWith(".ts") ||
			path.endsWith(".txt") ||
			path.endsWith(".mjs") ||
			path.endsWith(".json")
		)
			hash.update(path).update(readFileSync(path));
	};
	for (const path of [
		"src",
		"public/bot-prompts",
		"scripts/canasta-study.ts",
		"scripts/canasta-study-worker.ts",
		"scripts/canasta-study-worker.mjs",
		"scripts/run-classic-1000.ts",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	])
		visit(path);
	return hash.digest("hex");
}
function validResult(value: unknown, plan: MatchPlan): value is MatchResult {
	if (typeof value !== "object" || value === null) return false;
	const r = value as Partial<MatchResult>;
	return (
		JSON.stringify(r.plan) === JSON.stringify(plan) &&
		(r.status === "complete" || r.status === "incomplete") &&
		(r.aWin === 0 || r.aWin === 1 || r.aWin === null) &&
		(r.status === "complete"
			? r.aWin !== null
			: r.aWin === null && typeof r.reason === "string") &&
		Array.isArray(r.scores) &&
		r.scores.length === 2 &&
		r.scores.every(Number.isFinite) &&
		(r.status !== "complete" ||
			(Math.max(...r.scores) >= 5000 &&
				r.scores[0] !== r.scores[1] &&
				r.aWin ===
					Number((r.scores[0] > r.scores[1] ? 0 : 1) === plan.aTeam))) &&
		[r.hands, r.actions, r.simulations, r.resets].every(
			(v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0,
		) &&
		typeof r.elapsedMs === "number" &&
		Number.isFinite(r.elapsedMs) &&
		r.elapsedMs >= 0
	);
}

async function main(): Promise<void> {
	const [configPath, outPath, resumeFlag, ...extra] = process.argv.slice(2);
	if (
		!configPath ||
		!outPath ||
		extra.length ||
		(resumeFlag !== undefined && resumeFlag !== "--resume")
	)
		throw new Error(
			"usage: node --import tsx scripts/canasta-study.ts CONFIG.json OUTPUT_DIRECTORY [--resume]",
		);
	const parsed = parseStudyConfig(readJson(configPath));
	if (!parsed.ok) throw new Error(parsed.reason);
	const config = parsed.config,
		out = resolve(outPath);
	const deadline = performance.now() + config.maxWallMs;
	const signal = AbortSignal.timeout(config.maxWallMs);
	const identity = { config, sourceSha256: fingerprint() };
	const manifestPath = join(out, "manifest.json");
	if (resumeFlag) {
		const saved = readJson(manifestPath) as { identity?: unknown };
		if (JSON.stringify(saved.identity) !== JSON.stringify(identity))
			throw new Error(
				"resume requires the identical configuration and source fingerprint",
			);
	} else {
		mkdirSync(out); // Existing directories are never overwritten by a new campaign.
		writeFileSync(
			manifestPath,
			`${JSON.stringify(
				{
					identity,
					createdAt: new Date().toISOString(),
					commit: execFileSync("git", ["rev-parse", "HEAD"], {
						encoding: "utf8",
					}).trim(),
					node: process.version,
					cpu: os.cpus()[0]?.model,
					platform: process.platform,
				},
				null,
				"\t",
			)}\n`,
			{ flag: "wx" },
		);
	}
	const lock = join(out, "run.lock");
	if (existsSync(lock))
		throw new Error(
			"run.lock exists; verify the previous coordinator has stopped before removing its lock and resuming",
		);
	writeFileSync(
		lock,
		JSON.stringify({ pid: process.pid, host: os.hostname() }),
		{ flag: "wx", flush: true },
	);
	try {
		const save = (name: string, value: unknown) => {
			const path = join(out, name),
				temporary = `${path}.${process.pid}.tmp`;
			writeFileSync(temporary, `${JSON.stringify(value, null, "\t")}\n`, {
				flush: true,
			});
			renameSync(temporary, path);
		};
		const emit = async (event: Readonly<Record<string, unknown>>) => {
			appendFileSync(join(out, "events.jsonl"), `${JSON.stringify(event)}\n`);
			if (event.kind !== "pair")
				process.stderr.write(`${JSON.stringify(event)}\n`);
			if (event.kind === "checkpoint") save("checkpoint.json", event);
		};
		const requestRecords = new Map<string, RequestRecord>();
		for (const name of readdirSync(out).filter(
			(n) => n.startsWith("request-") && n.endsWith(".json"),
		)) {
			const record = readJson(join(out, name));
			if (!validRequestRecord(record) || name !== `request-${record.id}.json`)
				throw new Error("invalid saved LLM request record");
			requestRecords.set(record.id, record);
		}
		const chooser = config.llm
			? await researchChooser(
					process.env.OPENROUTER_RESEARCH_API_KEY ?? "",
					config.llm,
					{
						records: requestRecords,
						write: (record) => {
							save(`request-${record.id}.json`, record);
							requestRecords.set(record.id, record);
						},
					},
				)
			: undefined;
		const evaluate = async (
			job: Omit<PairJob, "b"> & { b: LocalPolicy | { kind: "llm" } },
		) =>
			playPair(
				job.plan,
				async (plan) => {
					const path = join(out, `${job.id}-${plan.aTeam}.json`);
					const expected = { plan, a: job.a, b: job.b };
					if (existsSync(path)) {
						const stored = readJson(path) as {
							task?: unknown;
							result?: unknown;
						};
						if (
							JSON.stringify(stored.task) !== JSON.stringify(expected) ||
							!validResult(stored.result, plan)
						)
							throw new Error(`invalid cached match ${path}`);
						return stored.result;
					}
					if (signal.aborted)
						throw new Error(
							"study wall-time limit reached; completed legs retained for resume",
						);
					process.stderr.write(
						`match ${job.id}, A=${plan.aTeam === 0 ? "N-S" : "E-W"}\n`,
					);
					const result =
						config.parallel && job.b.kind !== "llm"
							? await new Promise<MatchResult>((fulfill, reject) => {
									const worker = new Worker(
										new URL("./canasta-study-worker.mjs", import.meta.url),
										{
											workerData: expected,
											resourceLimits: { maxOldGenerationSizeMb: 512 },
										},
									);
									const timer = setTimeout(
										() => {
											void worker.terminate();
											reject(
												new Error(
													"study wall-time limit reached; completed legs retained",
												),
											);
										},
										Math.max(1, deadline - performance.now()),
									);
									let received = false;
									worker.once("message", (value: unknown) => {
										received = true;
										if (validResult(value, plan)) fulfill(value);
										else reject(new Error("invalid worker result"));
									});
									worker.once("error", reject);
									worker.once("exit", (code) => {
										clearTimeout(timer);
										if (code !== 0 || !received)
											reject(
												new Error(
													`match worker exited (${code}) without a result`,
												),
											);
									});
								})
							: await playMatch(
									plan,
									(seat, side) => {
										if (side === "a") return localAgent(job.a);
										if (job.b.kind !== "llm") return localAgent(job.b);
										if (!chooser)
											throw new Error("LLM opponent is not configured");
										return llmAgent(
											chooser(`${job.id}-${plan.aTeam}-${seat}`),
											NODE_PROMPT_TEMPLATES,
										);
									},
									signal,
								);
					save(`${job.id}-${plan.aTeam}.json`, { task: expected, result });
					return result;
				},
				config.parallel && job.b.kind !== "llm",
			);
		if (config.mode === "train") {
			const state = await runCampaign(
				config.campaign,
				evaluate,
				emit,
				config.llm
					? async (state) => {
							const llm = config.llm;
							if (!llm) throw new Error("LLM settings missing");
							const candidate: (number | null)[] = [],
								anchor: (number | null)[] = [];
							for (let block = 0; block < llm.pairs; block++)
								for (const label of ["candidate", "anchor"] as const) {
									const index =
										(Math.ceil(state.update / config.campaign.checkpointEvery) -
											1) *
											llm.pairs +
										block;
									const job = makePairJob(
										config.campaign,
										`llm-${state.update}-${label}-${block}`,
										5,
										index,
										label === "candidate" ? state.candidate : REFERENCE_PRIOR,
										REFERENCE_PRIOR,
									);
									const result = await evaluate({ ...job, b: { kind: "llm" } });
									await emit({
										kind: "pair",
										phase: "llm-validation",
										update: state.update,
										label,
										block,
										result,
									});
									(label === "candidate" ? candidate : anchor).push(
										result.score,
									);
								}
							return {
								candidate: boundedEstimate(
									candidate,
									llm.pairs,
									config.campaign.alpha,
								),
								anchor: boundedEstimate(
									anchor,
									llm.pairs,
									config.campaign.alpha,
								),
								requests: requestRecords.size,
								diagnosticOnly: true,
							};
						}
					: undefined,
			);
			save("summary.json", state);
			process.stdout.write(`${JSON.stringify(state)}\n`);
		} else {
			const values = await mapConcurrent(
				Array.from({ length: config.pairs }, (_, block) => block),
				config.parallelPairs ?? 1,
				async (block) => {
					const split = config.split === "test" ? 4 : 3;
					const base: CampaignConfig = {
						seed: config.seed,
						budget: config.budget,
						updates: 1,
						trainingPairs: 1,
						evaluationPairs: config.pairs,
						checkpointEvery: 1,
						alpha: config.alpha,
						method: "spsa",
						schedule: { step: 0.1, perturbation: 0.2, stability: 10 },
						maxHands: config.maxHands,
						maxActionsPerHand: config.maxActionsPerHand,
					};
					const job = makePairJob(
						base,
						`evaluation-${block}`,
						split,
						block,
						config.candidate,
						config.candidate,
					);
					const opponent =
						config.opponent.kind !== "mcts"
							? config.opponent
							: { ...config.opponent, budget: config.budget };
					const result = await evaluate({ ...job, b: opponent });
					await emit({
						kind: "pair",
						phase: config.split,
						block,
						dealSeed: studySeed(config.seed, split, block),
						result,
					});
					return result.score;
				},
			);
			const summary = boundedEstimate(values, config.pairs, config.alpha);
			save("summary.json", summary);
			process.stdout.write(`${JSON.stringify(summary)}\n`);
			if (summary.completed !== summary.planned) process.exitCode = 1;
		}
	} finally {
		unlinkSync(lock);
	}
}

await main();
