import { afterEach, expect, it, vi } from "vitest";
import { CallPresenceTimeout } from "../../src/ui/call-presence";

afterEach(() => vi.useRealTimers());

it("ends a call only after continuous absence and cancels when another person returns", () => {
	vi.useFakeTimers();
	const end = vi.fn();
	const presence = new CallPresenceTimeout(end);
	presence.update(false, true);
	vi.advanceTimersByTime(10_000);
	presence.update(true, true);
	vi.advanceTimersByTime(10_000);
	expect(end).not.toHaveBeenCalled();
	presence.update(false, true);
	vi.advanceTimersByTime(15_000);
	expect(end).toHaveBeenCalledOnce();
	presence.update(false, true);
	presence.stop();
	vi.advanceTimersByTime(15_000);
	expect(end).toHaveBeenCalledOnce();
});
