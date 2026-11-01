import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import { chooseLocalModern } from "../../src/bot/modern-worker-search";
import {
	type ModernAction,
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";

it("runs the modern bot in a worker and returns a legal action", async () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const started = performance.now();
	const pending = chooseLocalModern(observeModern(dealt.hand, 0), {
		timeMs: 500,
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(performance.now() - started).toBeLessThan(400);
	const result = await pending;
	if (!result.action) throw new Error("modern worker returned no action");
	expect(modernApplyAction(dealt.hand, 0, result.action).ok).toBe(true);
});

it("searches an active modern turn with visible undo history in the browser worker", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const melded = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-AC", "0-AS", "1-JK0"],
	});
	if (!melded.ok) throw new Error(melded.reason);
	const observation = observeModern(melded.hand, 0);
	expect(observation.undoViews?.length).toBeGreaterThan(0);
	const worker = new Worker(
		new URL("../../src/bot/modern-search-worker.ts", import.meta.url),
		{ type: "module" },
	);
	try {
		const action = await new Promise<ModernAction>((resolve, reject) => {
			worker.onmessage = (event) => {
				if ("error" in event.data) reject(new Error(event.data.error));
				else if (event.data.done) resolve(event.data.result.action);
			};
			worker.onerror = () => reject(new Error("modern worker failed"));
			worker.postMessage({
				observation,
				deadline: performance.timeOrigin + performance.now() + 500,
			});
		});
		expect(action).toBeDefined();
		expect(modernApplyAction(melded.hand, 0, action).ok).toBe(true);
	} finally {
		worker.terminate();
	}
}, 10000);

it("cancels a pending modern worker decision", async () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const abort = new AbortController();
	const pending = chooseLocalModern(observeModern(dealt.hand, 0), {
		timeMs: 10_000,
		signal: abort.signal,
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	abort.abort();
	await expect(pending).rejects.toThrow("aborted");
});
