/** Executes only a seat's observation in a disposable browser worker. */
import { type CanastaObservation, chooseCanasta } from "./canasta-search";

self.onmessage = (
	event: MessageEvent<{ observation: CanastaObservation; deadline: number }>,
) => {
	void chooseCanasta(event.data.observation, {
		timeMs: Math.max(
			0,
			event.data.deadline - (performance.timeOrigin + performance.now()),
		),
		onProgress: (result) => self.postMessage({ done: false, result }),
	}).then(
		(result) => self.postMessage({ done: true, result }),
		(error: unknown) =>
			self.postMessage({
				error: error instanceof Error ? error.message : "local search failed",
			}),
	);
};
