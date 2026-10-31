import { afterEach, expect, it, vi } from "vitest";
import { ClientBotRunner } from "../../src/bot/client-runner";
import { chooseModernInNodeWorker } from "../../src/bot/modern-node-search";
import { modernStartMatch } from "../../src/canasta/modern-match";
import { tableSeat } from "../../src/game/canasta";
import { createModernModule } from "../../src/game/modern";
import type { TableController, TableView } from "../../src/p2p/table";
import { CONFIG, TABLE } from "./p2p-fixtures";

vi.mock("../../src/bot/modern-node-search", () => ({
	chooseModernInNodeWorker: vi.fn(),
}));
afterEach(() => vi.useRealTimers());

it("plays modern rules with the local node bot", async () => {
	vi.useFakeTimers();
	vi.mocked(chooseModernInNodeWorker).mockResolvedValue({
		action: { type: "draw" },
		iterations: 1,
		elapsedMs: 0,
		choices: [],
	});
	const match = modernStartMatch(1, 0);
	if (!match.ok) throw new Error(match.reason);
	const seat = tableSeat(match.match.hand.turn);
	const state = {
		...createModernModule(() => 0).initialState(TABLE, CONFIG),
		matches: 1,
		match: match.match,
	};
	const view = {
		ready: true,
		seat,
		table: { state },
		outbox: [],
		failures: [],
	} as unknown as TableView;
	const send = vi.fn().mockResolvedValue({ ok: true });
	const runner = new ClientBotRunner(
		{ tableId: TABLE, view: () => view, send } as unknown as TableController,
		undefined,
		() => {},
	);
	try {
		const pending = runner.advance(view);
		await vi.advanceTimersByTimeAsync(1000);
		await pending;
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({ action: { type: "draw" } }),
		);
		expect(chooseModernInNodeWorker).toHaveBeenCalledTimes(1);
	} finally {
		runner.stop();
	}
});

it("rejects the classic-only LLM chooser for a modern table", async () => {
	const match = modernStartMatch(1, 0);
	if (!match.ok) throw new Error(match.reason);
	const seat = tableSeat(match.match.hand.turn);
	const state = {
		...createModernModule(() => 0).initialState(TABLE, CONFIG),
		matches: 1,
		match: match.match,
	};
	const view = {
		ready: true,
		seat,
		table: { state },
		outbox: [],
		failures: [],
	} as unknown as TableView;
	const runner = new ClientBotRunner(
		{ tableId: TABLE, view: () => view } as unknown as TableController,
		{ choose: vi.fn() },
		() => {},
	);
	try {
		await expect(runner.advance(view)).rejects.toThrow(
			"LLM bot does not support modern rules",
		);
	} finally {
		runner.stop();
	}
});
