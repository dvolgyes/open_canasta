import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chooseCanasta } from "../../src/bot/canasta-search";
import { HostBotRunner } from "../../src/bot/host-runner";
import { startMatch } from "../../src/canasta";
import { canastaModule, tableSeat } from "../../src/game/canasta";
import { BOT_CONTROL_CHANGED } from "../../src/p2p/bot-seats";
import type { TableController } from "../../src/p2p/table";
import { initialPlayers } from "../../src/players";
import { DEFAULT_BOT_SETUP } from "../../src/protocol";
import { CONFIG, TABLE } from "./p2p-fixtures";

vi.mock("../../src/bot/canasta-search", async (original) => ({
	...(await original<typeof import("../../src/bot/canasta-search")>()),
	chooseCanasta: vi.fn(),
}));

const decision = {
	action: { type: "draw" as const },
	iterations: 10,
	elapsedMs: 1,
	choices: [],
};
beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(chooseCanasta).mockReset().mockResolvedValue(decision);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("local bots must not make API requests");
		}),
	);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function fixture() {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	const state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	const view = {
		hosting: true,
		ready: true,
		allConnected: true,
		seat,
		roster: { bots: [seat] },
		table: { config, state, players: initialPlayers(config) },
	};
	let changed = () => {};
	const send = vi
		.fn<
			(
				...args: unknown[]
			) => Promise<{ ok: boolean; reason?: string; waiting?: boolean }>
		>()
		.mockResolvedValue({ ok: true });
	const errors = vi.fn();
	const controller = {
		tableId: TABLE,
		view: () => view,
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		sendBot: send,
	} as unknown as TableController;
	const runner = new HostBotRunner(controller, {}, errors);
	return { view, runner, send, errors, changed: () => changed() };
}

it("paces local decisions without a key or network requests", async () => {
	const f = fixture();
	try {
		expect(await f.runner.start()).toBe(true);
		await vi.advanceTimersByTimeAsync(999);
		expect(f.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(f.send).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		f.runner.stop();
	}
});

it("cancels a paced decision on pause and searches again on resume", async () => {
	const f = fixture();
	try {
		await f.runner.start();
		await vi.advanceTimersByTimeAsync(100);
		f.runner.pause();
		await vi.advanceTimersByTimeAsync(1100);
		expect(f.send).not.toHaveBeenCalled();
		f.runner.resume();
		await vi.advanceTimersByTimeAsync(1000);
		expect(f.send).toHaveBeenCalledTimes(1);
		expect(chooseCanasta).toHaveBeenCalledTimes(2);
	} finally {
		f.runner.stop();
	}
});

it.each(["match", "branch"])(
	"discards a pending search when the %s changes at equal counters",
	async (kind) => {
		const f = fixture();
		let release = (_value: typeof decision) => {};
		vi.mocked(chooseCanasta).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		try {
			await f.runner.start();
			expect(chooseCanasta).toHaveBeenCalledTimes(1);
			f.view.table.state = {
				...f.view.table.state,
				matches: kind === "match" ? 2 : 1,
				match: startMatch(11, undefined, f.view.table.state.match.dealer),
			};
			f.changed();
			expect(vi.mocked(chooseCanasta).mock.calls[0]?.[1].signal?.aborted).toBe(
				true,
			);
			release(decision);
			await vi.advanceTimersByTimeAsync(1000);
			expect(chooseCanasta).toHaveBeenCalledTimes(2);
			expect(f.send).toHaveBeenCalledTimes(1);
			expect(f.errors).not.toHaveBeenCalled();
		} finally {
			release(decision);
			f.runner.stop();
		}
	},
);

it("cancels pacing when a new match replaces the decision", async () => {
	const f = fixture();
	try {
		await f.runner.start();
		await vi.advanceTimersByTimeAsync(500);
		f.view.table.state = { ...f.view.table.state, matches: 2 };
		f.changed();
		await vi.advanceTimersByTimeAsync(500);
		expect(f.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(500);
		expect(f.send).toHaveBeenCalledTimes(1);
		expect(chooseCanasta).toHaveBeenCalledTimes(2);
	} finally {
		f.runner.stop();
	}
});

it("searches again after a completed action when a new match starts", async () => {
	const f = fixture();
	try {
		await f.runner.start();
		await vi.advanceTimersByTimeAsync(1000);
		f.view.table.state = { ...f.view.table.state, matches: 2 };
		f.changed();
		await vi.advanceTimersByTimeAsync(1000);
		expect(f.send).toHaveBeenCalledTimes(2);
	} finally {
		f.runner.stop();
	}
});

it("retries a temporarily waiting action without repeating the search", async () => {
	const f = fixture();
	f.send.mockResolvedValueOnce({ ok: false, waiting: true });
	try {
		await f.runner.start();
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		f.changed();
		await vi.advanceTimersByTimeAsync(0);
		expect(f.send).toHaveBeenCalledTimes(2);
		expect(chooseCanasta).toHaveBeenCalledTimes(1);
	} finally {
		f.runner.stop();
	}
});

it.each([true, false])(
	"recovers rejected queued actions after a control change (new position: %s)",
	async (newPosition) => {
		const f = fixture();
		let release = (_value: { ok: boolean; reason?: string }) => {};
		f.send.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		try {
			await f.runner.start();
			await vi.advanceTimersByTimeAsync(1000);
			if (newPosition) {
				f.view.table.state = { ...f.view.table.state, matches: 2 };
				f.changed();
			}
			release({ ok: false, reason: BOT_CONTROL_CHANGED });
			await vi.advanceTimersByTimeAsync(1000);
			expect(f.send).toHaveBeenCalledTimes(2);
			expect(f.errors).not.toHaveBeenCalled();
		} finally {
			release({ ok: true });
			f.runner.stop();
		}
	},
);

it("searches and sends while another player is disconnected", async () => {
	const f = fixture();
	f.view.allConnected = false;
	try {
		await f.runner.start();
		await vi.advanceTimersByTimeAsync(1000);
		expect(f.send).toHaveBeenCalledTimes(1);
		expect(chooseCanasta).toHaveBeenCalledTimes(1);
	} finally {
		f.runner.stop();
	}
});

it.each(["stop", "host", "seat"])(
	"does not send a completed search after losing %s authority",
	async (kind) => {
		const f = fixture();
		try {
			await f.runner.start();
			await vi.advanceTimersByTimeAsync(100);
			if (kind === "stop") f.runner.stop();
			if (kind === "host") f.view.hosting = false;
			if (kind === "seat") f.runner.setSeatEnabled(f.view.seat, false);
			await vi.advanceTimersByTimeAsync(1000);
			expect(f.send).not.toHaveBeenCalled();
		} finally {
			f.runner.stop();
		}
	},
);
