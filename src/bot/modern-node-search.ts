/** Node worker isolation for modern search; the worker receives only the actor's observation. */
import { Worker } from "node:worker_threads";
import type { ModernAction } from "../canasta/modern-hand";
import { BotRequestAbortedError } from "./cancellation";
import type { SearchResult } from "./mcts";
import type { ModernObservation } from "./modern-inference";
import {
	chooseModernPosition,
	type ModernSearchOptions,
} from "./modern-search";

export type ModernNodeSearchOptions = Omit<
	ModernSearchOptions,
	"rng" | "now" | "signal" | "onProgress" | "fallback"
> & {
	readonly seed?: number;
	readonly signal?: AbortSignal;
};

type WorkerOptions = Omit<
	ModernNodeSearchOptions,
	"timeMs" | "seed" | "signal"
>;
export interface ModernNodeWorkerRequest {
	readonly observation: ModernObservation;
	readonly options: WorkerOptions;
	readonly deadline: number;
	readonly seed: number;
}

export type ModernNodeWorkerMessage =
	| {
			readonly kind: "progress" | "complete";
			readonly result: SearchResult<ModernAction>;
	  }
	| { readonly kind: "error"; readonly message: string };

/** A timer terminates an overrun; event-loop and OS scheduling limit wall-clock guarantees. */
export async function chooseModernInNodeWorker(
	observation: ModernObservation,
	options: ModernNodeSearchOptions,
): Promise<SearchResult<ModernAction>> {
	if (typeof options !== "object" || options === null || Array.isArray(options))
		throw new Error("invalid modern worker options");
	const fields = [
		"timeMs",
		"maxIterations",
		"maxDepth",
		"maxTreeDepth",
		"exploration",
		"priorWeight",
		"widening",
		"priorWeights",
		"sevenBlockedV1Weight",
		"knownPairV1Weight",
		"discardRiskV1Weight",
		"pairThreatV1Weight",
		"pairPileV1Weight",
		"history",
		"seed",
		"signal",
	];
	if (Object.keys(options).some((key) => !fields.includes(key)))
		throw new Error("invalid modern worker options");
	const { timeMs, signal, seed, ...searchOptions } = options;
	if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 2147483647)
		throw new Error("invalid modern worker thinking time");
	if (
		(options.maxIterations !== undefined &&
			(!Number.isSafeInteger(options.maxIterations) ||
				options.maxIterations < 0)) ||
		(options.maxDepth !== undefined &&
			(!Number.isSafeInteger(options.maxDepth) || options.maxDepth < 1)) ||
		(options.maxTreeDepth !== undefined &&
			(!Number.isSafeInteger(options.maxTreeDepth) ||
				options.maxTreeDepth < 1)) ||
		(options.exploration !== undefined &&
			(!Number.isFinite(options.exploration) || options.exploration < 0)) ||
		(options.priorWeight !== undefined &&
			(!Number.isFinite(options.priorWeight) || options.priorWeight < 0)) ||
		(options.widening !== undefined &&
			(!Number.isFinite(options.widening) || options.widening <= 0))
	)
		throw new Error("invalid modern worker search limits");
	if (signal !== undefined && !(signal instanceof AbortSignal))
		throw new Error("invalid modern worker signal");
	if (
		seed !== undefined &&
		(!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
	)
		throw new Error("invalid modern worker seed");
	if (signal?.aborted) throw new BotRequestAbortedError();
	const started = performance.now();
	let best = await chooseModernPosition(observation, {
		...searchOptions,
		timeMs: 0,
	});
	if (signal?.aborted) throw new BotRequestAbortedError();
	const remaining = timeMs - (performance.now() - started);
	if (remaining <= 0)
		return { ...best, elapsedMs: performance.now() - started };
	const request: ModernNodeWorkerRequest = {
		observation,
		options: searchOptions,
		deadline: performance.timeOrigin + started + timeMs,
		seed: seed ?? Math.floor(Math.random() * 0x100000000),
	};
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL("./modern-node-worker-bootstrap.mjs", import.meta.url),
			{
				workerData: request,
				env: {},
			},
		);
		let settled = false;
		const cleanup = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			void worker.terminate().catch((error: unknown) => {
				process.emitWarning(
					`Failed to terminate modern search worker: ${String(error)}`,
				);
			});
		};
		const finish = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve({ ...best, elapsedMs: performance.now() - started });
		};
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const abort = () => fail(new BotRequestAbortedError());
		const timer = setTimeout(
			finish,
			Math.max(0, timeMs - (performance.now() - started)),
		);
		signal?.addEventListener("abort", abort, { once: true });
		worker.on("message", (message: ModernNodeWorkerMessage) => {
			if (message.kind === "error") {
				const error = new Error(message.message);
				if (settled) process.emitWarning(error);
				else fail(error);
				return;
			}
			if (settled) return;
			if (performance.now() - started >= timeMs) {
				finish();
				return;
			}
			if (message.result.action !== undefined) best = message.result;
			if (message.kind === "complete") finish();
		});
		worker.on("error", (error) => {
			if (settled) process.emitWarning(error);
			else fail(error);
		});
		worker.on("exit", () => {
			if (settled) return;
			fail(new Error("modern search worker exited without a result"));
		});
	});
}
