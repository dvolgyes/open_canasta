import type { ModernAction } from "../canasta/modern-hand";
import { BotRequestAbortedError } from "./cancellation";
import type { SearchResult } from "./mcts";
import type { ModernObservation } from "./modern-inference";
import { chooseModernPosition } from "./modern-search";
import { thinkingTime } from "./timing";

/** Run modern search in a disposable browser worker with a legal zero-budget fallback. */
export async function chooseLocalModern(
	observation: ModernObservation,
	options: { timeMs: number; signal?: AbortSignal },
): Promise<SearchResult<ModernAction>> {
	thinkingTime(options.timeMs);
	if (options.signal?.aborted) throw new BotRequestAbortedError();
	if (typeof Worker === "undefined")
		return chooseModernPosition(observation, options);
	const started = performance.now();
	let best = await chooseModernPosition(observation, { timeMs: 0 });
	if (options.signal?.aborted) throw new BotRequestAbortedError();
	const remaining = options.timeMs - (performance.now() - started);
	if (remaining <= 0) return best;
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL("./modern-search-worker.ts", import.meta.url),
			{ type: "module" },
		);
		const cleanup = () => {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			worker.terminate();
		};
		const finish = () => {
			cleanup();
			resolve({ ...best, elapsedMs: performance.now() - started });
		};
		const abort = () => {
			cleanup();
			reject(new BotRequestAbortedError());
		};
		const timer = setTimeout(finish, remaining);
		options.signal?.addEventListener("abort", abort, { once: true });
		worker.onmessage = (
			event: MessageEvent<
				| { done: boolean; result: SearchResult<ModernAction> }
				| { error: string }
			>,
		) => {
			if ("error" in event.data) {
				cleanup();
				reject(new Error(event.data.error));
				return;
			}
			if (event.data.result.action !== undefined) best = event.data.result;
			if (event.data.done) finish();
		};
		worker.onerror = () => {
			cleanup();
			reject(new Error("modern search worker failed"));
		};
		worker.postMessage({
			observation,
			deadline: performance.timeOrigin + started + options.timeMs,
		});
	});
}
