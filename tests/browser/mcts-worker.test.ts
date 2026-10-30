import { expect, it } from "vitest";
import { observeCanasta } from "../../src/bot/canasta-search";
import { chooseLocalCanasta } from "../../src/bot/worker-search";
import { applyAction, newHand } from "../../src/canasta";

it("keeps the page responsive and returns a legal worker decision by the deadline", async () => {
	const hand = newHand({ seed: 75, dealer: 3, teamScores: [0, 0] });
	const started = performance.now();
	const pending = chooseLocalCanasta(observeCanasta(hand, 0), { timeMs: 500 });
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(performance.now() - started).toBeLessThan(400);
	const result = await pending;
	expect(result.iterations).toBeGreaterThan(0);
	expect(performance.now() - started).toBeLessThan(1000);
	if (!result.action) throw new Error("worker returned no action");
	expect(applyAction(hand, 0, result.action).ok).toBe(true);
});

it("terminates a worker when the pending position is cancelled", async () => {
	const hand = newHand({ seed: 75, dealer: 3, teamScores: [0, 0] });
	const abort = new AbortController();
	const pending = chooseLocalCanasta(observeCanasta(hand, 0), {
		timeMs: 10000,
		signal: abort.signal,
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	abort.abort();
	await expect(pending).rejects.toThrow("aborted");
});
