import { expect, it, vi } from "vitest";
import { ClientBotRunner } from "../../src/bot/client-runner";
import { startMatch } from "../../src/canasta";
import {
	type CanastaState,
	canastaModule,
	parseCanastaState,
	tableSeat,
} from "../../src/game/canasta";
import type { TableController, TableView } from "../../src/p2p/table";
import { CONFIG, TABLE } from "./p2p-fixtures";

function rig() {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const initial = parseCanastaState(
		canastaModule.initialState(TABLE, CONFIG),
		TABLE,
	);
	if (!initial) throw new Error("initial state is invalid");
	let state: CanastaState = { ...initial, matches: 1, match, actions: 0 };
	let ready = true;
	const send = vi.fn(async () => ({ ok: true }));
	const view = () =>
		({
			ready,
			seat,
			table: { state },
			outbox: [],
			failures: [],
		}) as unknown as TableView;
	const controller = {
		tableId: TABLE,
		view,
		send,
	} as unknown as TableController;
	const choose = vi.fn(async () => 0);
	const runner = new ClientBotRunner(controller, { choose }, () => {});
	return {
		match,
		seat,
		send,
		view,
		choose,
		runner,
		change: (next: typeof state) => {
			state = next;
		},
		state: () => state,
		setReady: (value: boolean) => {
			ready = value;
		},
	};
}

it("retries a decision that finished while the host was disconnected", async () => {
	const r = rig();
	let release: (choice: number) => void = () => {};
	r.choose.mockImplementationOnce(
		() =>
			new Promise<number>((resolve) => {
				release = resolve;
			}),
	);
	const pending = r.runner.advance(r.view());
	await vi.waitFor(() => expect(r.choose).toHaveBeenCalledTimes(1));
	r.setReady(false);
	release(0);
	await pending;
	expect(r.send).not.toHaveBeenCalled();
	r.setReady(true);
	await Promise.all([r.runner.advance(r.view()), r.runner.advance(r.view())]);
	expect(r.send).toHaveBeenCalledTimes(1);
	expect(r.choose).toHaveBeenCalledTimes(1);
});

it("discards a deferred decision if the match changes while disconnected", async () => {
	const r = rig();
	let release: (choice: number) => void = () => {};
	r.choose.mockImplementationOnce(
		() =>
			new Promise<number>((resolve) => {
				release = resolve;
			}),
	);
	const pending = r.runner.advance(r.view());
	await vi.waitFor(() => expect(r.choose).toHaveBeenCalledTimes(1));
	r.setReady(false);
	release(0);
	await pending;
	r.change({ ...r.state(), matches: 2, match: startMatch(7) });
	await r.runner.advance(r.view());
	r.setReady(true);
	await r.runner.advance(r.view());
	expect(r.choose).toHaveBeenCalledTimes(2);
	expect(r.send).toHaveBeenCalledTimes(1);
	expect(r.send).toHaveBeenCalledWith(expect.objectContaining({ match: 2 }));
});

it("takes a turn in a new match even when the counters repeat", async () => {
	const r = rig();
	await r.runner.advance(r.view());
	expect(r.send).toHaveBeenCalledTimes(1);
	r.change({ ...r.state(), matches: 2, match: startMatch(7) });
	await r.runner.advance(r.view());
	expect(r.send).toHaveBeenCalledTimes(2);
});

it("votes for a reset requested from its seat", async () => {
	const r = rig();
	r.change({
		...r.state(),
		reset: {
			id: "123e4567-e89b-42d3-a456-426614174000",
			requester: "W",
			required: [r.seat],
			approved: [],
		},
	});
	await r.runner.advance(r.view());
	await r.runner.advance(r.view());
	expect(r.send).toHaveBeenCalledWith(
		expect.objectContaining({ type: "reset-vote", approve: true }),
	);
	expect(r.send).toHaveBeenCalledTimes(1);
	expect(r.choose).not.toHaveBeenCalled();
});

it("drops a delayed decision after the match changes", async () => {
	const r = rig();
	let release: (choice: number) => void = () => {};
	r.choose.mockImplementationOnce(
		() =>
			new Promise<number>((resolve) => {
				release = resolve;
			}),
	);
	const earlier = r.runner.advance(r.view());
	await vi.waitFor(() => expect(r.choose).toHaveBeenCalledTimes(1));
	r.change({ ...r.state(), matches: 2, match: startMatch(7) });
	await r.runner.advance(r.view());
	release(0);
	await earlier;
	expect(r.send).toHaveBeenCalledTimes(1);
	expect(r.send).toHaveBeenCalledWith(
		expect.objectContaining({ type: "action", match: 2 }),
	);
});

it("votes during an outstanding model request and drops the old decision", async () => {
	const r = rig();
	let release: (choice: number) => void = () => {};
	r.choose.mockImplementationOnce(
		() =>
			new Promise<number>((resolve) => {
				release = resolve;
			}),
	);
	const earlier = r.runner.advance(r.view());
	await vi.waitFor(() => expect(r.choose).toHaveBeenCalledTimes(1));
	r.change({
		...r.state(),
		reset: {
			id: "123e4567-e89b-42d3-a456-426614174000",
			requester: "W",
			required: [r.seat],
			approved: [],
		},
	});
	await r.runner.advance(r.view());
	release(0);
	await earlier;
	expect(r.send).toHaveBeenCalledTimes(1);
	expect(r.send).toHaveBeenCalledWith(
		expect.objectContaining({ type: "reset-vote", approve: true }),
	);
});
