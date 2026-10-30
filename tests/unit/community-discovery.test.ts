import { expect, it, vi } from "vitest";
import { Discovery } from "../../src/community/discovery";
import {
	type ChannelHandlers,
	type CommunityChannel,
	DISCOVERY_ROOM,
	type OpenCommunity,
} from "../../src/community/transport";

it("hands the existing connection to matchmaking and closes it once", async () => {
	let callbacks: ChannelHandlers | undefined;
	const peers = ["other"];
	const leave = vi.fn(async () => {});
	const send = vi.fn();
	const channel: CommunityChannel = {
		self: "self",
		peers: () => peers,
		send,
		leave,
	};
	const open = vi.fn<OpenCommunity>((_room, _key, handlers) => {
		callbacks = handlers;
		return channel;
	});
	const discovery = new Discovery(open);
	const changed = vi.fn();
	discovery.subscribe(changed);
	discovery.start();
	expect(discovery.count).toBe(1);
	const handlers: ChannelHandlers = {
		message: vi.fn(),
		join: vi.fn(),
		leave: vi.fn(),
		problem: vi.fn(),
	};
	const session = discovery.open(DISCOVERY_ROOM, undefined, handlers);
	await Promise.resolve();
	expect(open).toHaveBeenCalledTimes(1);
	expect(handlers.join).toHaveBeenCalledWith("other");
	callbacks?.message("other", { k: "offer" });
	expect(handlers.message).toHaveBeenCalledWith("other", { k: "offer" });
	peers.length = 0;
	callbacks?.leave("other");
	expect(discovery.count).toBe(0);
	expect(changed).toHaveBeenCalledTimes(2);
	await session.leave();
	await discovery.stop();
	expect(leave).toHaveBeenCalledTimes(1);
	expect(discovery.count).toBeUndefined();
});

it("reports a discovery failure to a session that joins later", async () => {
	let callbacks: ChannelHandlers | undefined;
	const channel: CommunityChannel = {
		self: "self",
		peers: () => [],
		send: () => {},
		leave: async () => {},
	};
	const discovery = new Discovery((_room, _key, handlers) => {
		callbacks = handlers;
		return channel;
	});
	discovery.start();
	callbacks?.problem();
	expect(discovery.count).toBeUndefined();
	const handlers: ChannelHandlers = {
		message: vi.fn(),
		join: vi.fn(),
		leave: vi.fn(),
		problem: vi.fn(),
	};
	discovery.open(DISCOVERY_ROOM, undefined, handlers);
	await Promise.resolve();
	expect(handlers.problem).toHaveBeenCalledOnce();
	await discovery.stop();
});

it("ignores callbacks from a connection after it is replaced", async () => {
	const callbacks: ChannelHandlers[] = [];
	const channel: CommunityChannel = {
		self: "self",
		peers: () => [],
		send: () => {},
		leave: async () => {},
	};
	const discovery = new Discovery((_room, _key, handlers) => {
		callbacks.push(handlers);
		return channel;
	});
	discovery.start();
	await discovery.stop();
	const handlers: ChannelHandlers = {
		message: vi.fn(),
		join: vi.fn(),
		leave: vi.fn(),
		problem: vi.fn(),
	};
	discovery.open(DISCOVERY_ROOM, undefined, handlers);
	await Promise.resolve();
	callbacks[0]?.message("old", "stale");
	callbacks[0]?.join("old");
	callbacks[0]?.problem();
	expect(handlers.message).not.toHaveBeenCalled();
	expect(handlers.join).not.toHaveBeenCalled();
	expect(handlers.problem).not.toHaveBeenCalled();
	expect(discovery.count).toBe(0);
	await discovery.stop();
});

it("does not deliver a queued failure after the session leaves", async () => {
	let callbacks: ChannelHandlers | undefined;
	const discovery = new Discovery((_room, _key, handlers) => {
		callbacks = handlers;
		return {
			self: "self",
			peers: () => [],
			send: () => {},
			leave: async () => {},
		};
	});
	discovery.start();
	callbacks?.problem();
	const handlers: ChannelHandlers = {
		message: vi.fn(),
		join: vi.fn(),
		leave: vi.fn(),
		problem: vi.fn(),
	};
	const session = discovery.open(DISCOVERY_ROOM, undefined, handlers);
	await session.leave();
	await Promise.resolve();
	expect(handlers.problem).not.toHaveBeenCalled();
});

it("does not replay peers from an old connection to a reused handler", async () => {
	let opened = 0;
	const discovery = new Discovery(() => {
		opened++;
		const peers = opened === 1 ? ["old"] : ["new"];
		return {
			self: "self",
			peers: () => peers,
			send: () => {},
			leave: async () => {},
		};
	});
	const handlers: ChannelHandlers = {
		message: vi.fn(),
		join: vi.fn(),
		leave: vi.fn(),
		problem: vi.fn(),
	};
	const old = discovery.open(DISCOVERY_ROOM, undefined, handlers);
	void old.leave();
	discovery.open(DISCOVERY_ROOM, undefined, handlers);
	await Promise.resolve();
	expect(handlers.join).toHaveBeenCalledTimes(1);
	expect(handlers.join).toHaveBeenCalledWith("new");
	await old.leave();
	expect(discovery.count).toBe(1);
	await discovery.stop();
});
