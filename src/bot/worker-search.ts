/** Browser deadline enforcement and cancellation; Node uses cooperative search. */
import type { Action } from "../canasta";
import { type CanastaObservation, chooseCanasta } from "./canasta-search";
import { BotRequestAbortedError } from "./cancellation";
import type { SearchResult } from "./mcts";
import { thinkingTime } from "./timing";

export async function chooseLocalCanasta(
	observation: CanastaObservation,
	options: { timeMs: number; signal?: AbortSignal },
): Promise<SearchResult<Action>> {
	thinkingTime(options.timeMs);
	if (options.signal?.aborted) throw new BotRequestAbortedError();
	if (typeof Worker === "undefined") return chooseCanasta(observation, options);
	const started = performance.now();
	let best = await chooseCanasta(observation, { timeMs: 0 });
	if (options.signal?.aborted) throw new BotRequestAbortedError();
	const remaining = options.timeMs - (performance.now() - started);
	if (remaining <= 0) return best;
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./search-worker.ts", import.meta.url), {
			type: "module",
		});
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
				{ done: boolean; result: SearchResult<Action> } | { error: string }
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
			reject(new Error("local search worker failed"));
		};
		worker.postMessage({
			observation,
			deadline: performance.timeOrigin + started + options.timeMs,
		});
	});
}
