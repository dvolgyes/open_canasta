import { beforeEach, expect, it, vi } from "vitest";

interface FakeAction {
	send: ReturnType<typeof vi.fn>;
	onReceive:
		| ((event: { peerId: string; byteLength: number }) => boolean)
		| null;
	onMessage: ((text: string, meta: { peerId: string }) => void) | null;
}
interface FakeRoom {
	action: FakeAction;
	makeAction(): FakeAction;
	getPeers(): Record<string, object>;
	leave: ReturnType<typeof vi.fn>;
	onPeerJoin: ((peer: string) => void) | null;
	onPeerLeave: ((peer: string) => void) | null;
}
const state = vi.hoisted(() => ({
	room: undefined as unknown as FakeRoom,
	config: undefined as unknown as Record<string, unknown>,
}));
vi.mock("../../src/p2p/signaling", () => ({
	selfId: "self",
	joinRoom: (config: Record<string, unknown>) => {
		state.config = config;
		return state.room;
	},
}));

import { communityTransport } from "../../src/community/transport";

beforeEach(() => {
	state.room = {
		action: { send: vi.fn(async () => {}), onReceive: null, onMessage: null },
		makeAction() {
			return this.action;
		},
		getPeers: () => ({}),
		leave: vi.fn(async () => {}),
		onPeerJoin: null,
		onPeerLeave: null,
	};
});

it("bounds messages, validates JSON, and keeps the private key out of discovery", async () => {
	const message = vi.fn();
	const channel = communityTransport({ trackers: [], rtc: {} })(
		"waiting-v1",
		undefined,
		{ message, join: vi.fn(), leave: vi.fn(), problem: vi.fn() },
	);
	expect(state.config.password).toBeUndefined();
	expect(state.config.appId).toMatch(/community-v1$/);
	expect(
		state.room.action.onReceive?.({ peerId: "peer", byteLength: 16_385 }),
	).toBe(false);
	state.room.action.onMessage?.("not json", { peerId: "peer" });
	expect(message).not.toHaveBeenCalled();
	state.room.action.onMessage?.('{"k":"offer"}', { peerId: "peer" });
	expect(message).toHaveBeenCalledWith("peer", { k: "offer" });
	for (let i = 0; i < 32; i++)
		expect(
			state.room.action.onReceive?.({ peerId: "peer", byteLength: 10 }),
		).toBe(true);
	expect(
		state.room.action.onReceive?.({ peerId: "peer", byteLength: 10 }),
	).toBe(false);
	channel.send("x".repeat(16_384));
	expect(state.room.action.send).not.toHaveBeenCalled();
	await channel.leave();
});

it("stops the discovery channel when its peer capacity is exceeded", async () => {
	const problem = vi.fn();
	state.room.getPeers = () =>
		Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i), {}]));
	const channel = communityTransport({ trackers: [], rtc: {} })(
		"waiting-v1",
		undefined,
		{ message: vi.fn(), join: vi.fn(), leave: vi.fn(), problem },
	);
	state.room.onPeerJoin?.("peer");
	expect(problem).toHaveBeenCalledOnce();
	expect(channel.peers()).toEqual([]);
	await channel.leave();
});
