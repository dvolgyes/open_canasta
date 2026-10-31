import { afterEach, expect, it, vi } from "vitest";
import { HostBotRunner } from "../../src/bot/host-runner";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import { modernStartMatch } from "../../src/canasta/modern-match";
import { tableSeat } from "../../src/game/canasta";
import { createModernModule } from "../../src/game/modern";
import type { TableController } from "../../src/p2p/table";
import { initialPlayers } from "../../src/players";
import { DEFAULT_BOT_SETUP } from "../../src/protocol";
import { CONFIG, TABLE } from "./p2p-fixtures";

vi.mock("../../src/bot/modern-search", async (original) => ({
	...(await original<typeof import("../../src/bot/modern-search")>()),
	chooseModernPosition: vi.fn(),
}));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("uses the modern bot's private observation and sends its legal decision", async () => {
	vi.useFakeTimers();
	vi.mocked(chooseModernPosition).mockResolvedValue({
		action: { type: "draw" },
		iterations: 1,
		elapsedMs: 0,
		choices: [],
	});
	const started = modernStartMatch(7, 0);
	if (!started.ok) throw new Error(started.reason);
	const seat = tableSeat(started.match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	const state = {
		...createModernModule(() => 0).initialState(TABLE, config),
		matches: 1,
		match: started.match,
	};
	const send = vi.fn().mockResolvedValue({ ok: true });
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			seat,
			roster: { bots: [seat] },
			table: { config, state, players: initialPlayers(config) },
		}),
		activateBots: async () => true,
		onChange: () => () => {},
		sendBot: send,
	} as unknown as TableController;
	const runner = new HostBotRunner(controller, {});
	try {
		await runner.start();
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]?.[1].action).toEqual({ type: "draw" });
		expect(
			modernApplyAction(
				started.match.hand,
				started.match.hand.turn,
				send.mock.calls[0]?.[1].action,
			).ok,
		).toBe(true);
		const observation = vi.mocked(chooseModernPosition).mock.calls[0]?.[0];
		expect(observation?.view.hand).toEqual(
			started.match.hand.hands[started.match.hand.turn],
		);
		expect(observation?.view).not.toHaveProperty("stock");
		expect(observation?.view).not.toHaveProperty("hands");
	} finally {
		runner.stop();
	}
});
