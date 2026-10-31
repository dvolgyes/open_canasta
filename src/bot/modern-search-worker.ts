import type { ModernObservation } from "./modern-inference";
import { chooseModernPosition } from "./modern-search";

/** The worker receives only the acting player's observation. */
self.onmessage = (
	event: MessageEvent<{ observation: ModernObservation; deadline: number }>,
) => {
	void chooseModernPosition(event.data.observation, {
		timeMs: Math.max(
			0,
			event.data.deadline - (performance.timeOrigin + performance.now()),
		),
		onProgress: (result) => self.postMessage({ done: false, result }),
	}).then(
		(result) => self.postMessage({ done: true, result }),
		(error: unknown) =>
			self.postMessage({
				error: error instanceof Error ? error.message : "modern search failed",
			}),
	);
};
