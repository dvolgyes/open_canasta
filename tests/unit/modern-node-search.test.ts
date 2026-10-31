import { expect, it } from "vitest";
import { BotRequestAbortedError } from "../../src/bot/cancellation";
import { observeModern } from "../../src/bot/modern-inference";
import { chooseModernInNodeWorker } from "../../src/bot/modern-node-search";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";

it("returns a legal fallback at the deadline and a completed search with more time", async () => {
	const dealt = modernNewHand({ seed: 412, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const view = observeModern(dealt.hand, 0);
	const started = performance.now();
	const timed = await chooseModernInNodeWorker(view, {
		timeMs: 10,
		maxIterations: 1000000,
		maxDepth: 80,
		seed: 9,
	});
	expect(performance.now() - started).toBeLessThan(5000);
	if (!timed.action) throw new Error("missing deadline fallback");
	expect(modernApplyAction(dealt.hand, 0, timed.action).ok).toBe(true);
	expect(timed.iterations).toBeLessThan(1000000);
	const completed = await chooseModernInNodeWorker(view, {
		timeMs: 10000,
		maxIterations: 1,
		maxDepth: 1,
		maxTreeDepth: 1,
		knownPairV1Weight: 7,
		discardRiskV1Weight: 5,
		pairThreatV1Weight: 5,
		pairPileV1Weight: 5,
		seed: 9,
	});
	expect(completed.iterations).toBe(1);
	if (!completed.action) throw new Error("missing completed action");
	expect(modernApplyAction(dealt.hand, 0, completed.action).ok).toBe(true);
}, 20000);

it("honors cancellation and rejects invalid worker inputs", async () => {
	const dealt = modernNewHand({ seed: 412, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const view = observeModern(dealt.hand, 0);
	const controller = new AbortController();
	controller.abort();
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 1000, signal: controller.signal }),
	).rejects.toBeInstanceOf(BotRequestAbortedError);
	await expect(
		chooseModernInNodeWorker(view, { timeMs: Number.NaN }),
	).rejects.toThrow();
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 100, seed: -1 }),
	).rejects.toThrow();
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 0, maxDepth: 0 }),
	).rejects.toThrow("invalid modern worker search limits");
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 0, maxTreeDepth: 0 }),
	).rejects.toThrow("invalid modern worker search limits");
	await expect(
		chooseModernInNodeWorker(view, {
			timeMs: 0,
			discardRiskV1Weight: Number.NaN,
		}),
	).rejects.toThrow("invalid modern discard-risk weight");
	await expect(
		chooseModernInNodeWorker(view, {
			timeMs: 0,
			pairThreatV1Weight: Number.NaN,
		}),
	).rejects.toThrow("invalid modern pair-threat weight");
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 0, maxIterations: -1 }),
	).rejects.toThrow("invalid modern worker search limits");
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 0, widening: 0 }),
	).rejects.toThrow("invalid modern worker search limits");
	await expect(
		chooseModernInNodeWorker(view, { timeMs: 0, signal: null as never }),
	).rejects.toThrow("invalid modern worker signal");
	await expect(
		chooseModernInNodeWorker(view, {
			timeMs: 0,
			unexpected: "private data",
		} as never),
	).rejects.toThrow("invalid modern worker options");
	const pending = new AbortController();
	const result = chooseModernInNodeWorker(view, {
		timeMs: 10000,
		signal: pending.signal,
	});
	setTimeout(() => pending.abort(), 20);
	await expect(result).rejects.toBeInstanceOf(BotRequestAbortedError);
	const malformed = {
		...view,
		view: { ...view.view, handCounts: [view.view.hand.length, 1000, 0, 0] },
	};
	await expect(
		chooseModernInNodeWorker(malformed, { timeMs: 10000, seed: 9 }),
	).rejects.toThrow("hand counts exceed the deck");
}, 20000);

it("returns the latest completed search work when the worker reaches its deadline", async () => {
	const dealt = modernNewHand({ seed: 412, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const started = performance.now();
	const result = await chooseModernInNodeWorker(observeModern(dealt.hand, 0), {
		timeMs: 3000,
		maxIterations: 1000000,
		maxDepth: 1,
		seed: 9,
	});
	expect(performance.now() - started).toBeLessThan(8000);
	expect(result.iterations).toBeGreaterThan(0);
	expect(result.iterations).toBeLessThan(1000000);
	if (!result.action) throw new Error("missing completed action");
	expect(modernApplyAction(dealt.hand, 0, result.action).ok).toBe(true);
}, 12000);
