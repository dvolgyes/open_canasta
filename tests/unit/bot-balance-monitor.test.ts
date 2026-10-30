import { expect, it, vi } from "vitest";
import type { OpenRouterBalance } from "../../src/bot/openrouter-balance";
import { BotBalanceMonitor } from "../../src/ui/bot-balance-monitor";

it("discards a previous key's late balance and keeps the latest key's result", async () => {
	const pending = new Map<string, (result: OpenRouterBalance) => void>();
	const read = vi.fn(
		(key: string) =>
			new Promise<OpenRouterBalance>((resolve) => pending.set(key, resolve)),
	);
	const show = vi.fn();
	const monitor = new BotBalanceMonitor(read, show);
	monitor.update("first", "1:1", true);
	monitor.update("second", "1:1", true);
	pending.get("second")?.({ balanceUsd: 3 });
	await Promise.resolve();
	pending.get("first")?.({ balanceUsd: 99 });
	await Promise.resolve();
	expect(show).toHaveBeenLastCalledWith({ balanceUsd: 3 });
	expect(show).not.toHaveBeenCalledWith({ balanceUsd: 99 });
});

it("refreshes once per hand and ignores a result after the host leaves", async () => {
	let resolve: ((result: OpenRouterBalance) => void) | undefined;
	const read = vi.fn(
		() =>
			new Promise<OpenRouterBalance>((done) => {
				resolve = done;
			}),
	);
	const show = vi.fn();
	const monitor = new BotBalanceMonitor(read, show);
	monitor.update("key", "1:1", true);
	monitor.update("key", "1:1", true);
	expect(read).toHaveBeenCalledTimes(1);
	monitor.update("key", "1:1", false);
	resolve?.({ balanceUsd: 5 });
	await Promise.resolve();
	expect(show).not.toHaveBeenCalledWith({ balanceUsd: 5 });
	monitor.update("key", "1:2", true);
	expect(read).toHaveBeenCalledTimes(2);
});
