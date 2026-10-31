import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { BotRequestAbortedError } from "./browser-openrouter";

export const DEFAULT_BOT_ACTION_DELAY_MS = 1_000;
export const BOT_ACTION_DELAY_KEY = `${STORAGE_PREFIX}settings.bot-action-delay-ms`;
export const BOT_THINKING_TIME_KEY = `${STORAGE_PREFIX}settings.bot-thinking-time-ms`;

export function thinkingTime(value = 250): number {
	if (!Number.isFinite(value) || value < 0 || value > 60000)
		throw new Error("thinking time must be from 0 to 60000 milliseconds");
	return value;
}

export function readThinkingTime(storage: MaybeStorage): number {
	const stored = storage?.getItem(BOT_THINKING_TIME_KEY);
	const value = stored == null || stored === "" ? 250 : Number(stored);
	return Number.isFinite(value) && value >= 0 && value <= 60000 ? value : 250;
}

function validDelay(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 1_000 &&
		value <= 60_000 &&
		value % 1_000 === 0
	);
}

export function botActionDelay(value: unknown): number {
	if (value === undefined) return DEFAULT_BOT_ACTION_DELAY_MS;
	if (!validDelay(value))
		throw new Error("bot action delay must be whole seconds from 1 to 60");
	return value;
}

export function readBotActionDelay(storage: MaybeStorage): number {
	const value = storage?.getItem(BOT_ACTION_DELAY_KEY);
	const parsed = value && /^\d+$/.test(value) ? Number(value) : undefined;
	return validDelay(parsed) ? parsed : DEFAULT_BOT_ACTION_DELAY_MS;
}

/** Model and search time count toward the minimum; cancellation removes the pending timer. */
export function waitForBotAction(
	startedAt: number,
	minimumMs: number,
	signal: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(new BotRequestAbortedError());
		const remaining = minimumMs - (performance.now() - startedAt);
		if (remaining <= 0) return resolve();
		const abort = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", abort);
			reject(new BotRequestAbortedError());
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, Math.ceil(remaining));
		signal.addEventListener("abort", abort, { once: true });
	});
}
