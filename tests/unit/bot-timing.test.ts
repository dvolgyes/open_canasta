import { expect, it, vi } from "vitest";
import { BotRequestAbortedError } from "../../src/bot/browser-openrouter";
import {
	botActionDelay,
	readBotActionDelay,
	waitForBotAction,
} from "../../src/bot/timing";
import type { MaybeStorage } from "../../src/session";

it("limits saved action delays to whole seconds from one to sixty", () => {
	expect(botActionDelay(1_000)).toBe(1_000);
	expect(botActionDelay(60_000)).toBe(60_000);
	for (const invalid of [0, 999, 1_500, 61_000, NaN, "3000", null])
		expect(() => botActionDelay(invalid)).toThrow(/whole seconds/);
});

it("ignores damaged stored delays", () => {
	const storage = { getItem: () => "1500" } as unknown as MaybeStorage;
	expect(readBotActionDelay(storage)).toBe(1_000);
});

it("cancels a pending delay when the action is no longer valid", async () => {
	const controller = new AbortController();
	const waiting = waitForBotAction(performance.now(), 1_000, controller.signal);
	controller.abort();
	await expect(waiting).rejects.toBeInstanceOf(BotRequestAbortedError);
});

it("does not add delay after a model request already took the minimum time", async () => {
	vi.useFakeTimers();
	try {
		await waitForBotAction(
			performance.now() - 1_000,
			1_000,
			new AbortController().signal,
		);
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});
