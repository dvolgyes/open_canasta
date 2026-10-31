import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import { chooseLocalModern } from "../../src/bot/modern-worker-search";
import {
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
