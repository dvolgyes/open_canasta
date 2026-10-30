import { expect, it } from "vitest";
import { readMeshConfig } from "../../src/p2p/config";
import {
	LATE_TICK_MS,
	MQTT_SILENT_MS,
	NETWORK_REJOIN_MS,
	REJOIN_MS,
	RELAY_SILENT_MS,
} from "../../src/p2p/limits";
import { Mesh, type MeshRoom } from "../../src/p2p/mesh";
import type { WebRtcReport } from "../../src/p2p/webrtc-check";

it("records a relay reply before the first tick and stops listening after leave", async () => {
	let now = 0;
	const url = "wss://tracker.test";
	const socket = Object.assign(new EventTarget(), { readyState: 1 });
	const sockets: Record<string, typeof socket> = {};
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: { trackers: [url], rtc: {} },
			joinRoom: () => {
				sockets[url] = socket;
				return room;
			},
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => sockets,
			clock: { monotonic: () => now, wall: () => now },
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	socket.dispatchEvent(new Event("message"));
	now = 1_000;
	expect(mesh.diagnostics().relays[0]?.heardAgoMs).toBe(1_000);
	await mesh.leave();
	now = 2_000;
	socket.dispatchEvent(new Event("message"));
	expect(mesh.diagnostics().relays[0]?.heardAgoMs).toBe(2_000);
});

it("probes a silent Nostr relay when frequent checks are enabled and reconnects after no answer", async () => {
	let now = 0;
	let probes = 0;
	const url = "wss://nostr.test";
	const socket = Object.assign(new EventTarget(), { readyState: 1 });
	const reconnected: string[] = [];
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: { trackers: [], nostrRelays: [url], rtc: {} },
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({}),
			nostrSockets: () => ({ [url]: socket }),
			reconnectRelay: (kind, address) => reconnected.push(`${kind} ${address}`),
			checkRelay: async () => {
				probes++;
				return "silent";
			},
			silentLinks: () => true,
			clock: { monotonic: () => now, wall: () => now },
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	mesh.tick();
	expect(mesh.online()).toBe(true);
	now = 30_000;
	mesh.tick();
	await Promise.resolve();
	expect(probes).toBe(1);
	expect(reconnected).toEqual([]);
	mesh.tick();
	expect(reconnected).toEqual([`nostr ${url}`]);
	await mesh.leave();
});

it("reports each configured STUN server's answer", async () => {
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: {
				trackers: [],
				rtc: { iceServers: [{ urls: ["stun:one.test", "stun:two.test"] }] },
			},
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({}),
			clock: { monotonic: () => 0, wall: () => 0 },
			probeStun: async (url) =>
				url === "stun:one.test" ? "answered" : "no-answer",
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	await Promise.resolve();
	expect(mesh.diagnostics().stun).toEqual([
		{ url: "stun:one.test", state: "answered" },
		{ url: "stun:two.test", state: "no-answer" },
	]);
	await mesh.leave();
});

it("refreshes WebRTC diagnostics on network changes and ignores stale results", async () => {
	const pending: ((report: WebRtcReport) => void)[] = [];
	let changed = () => {};
	let notifications = 0;
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: { trackers: [], rtc: {} },
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({}),
			clock: { monotonic: () => 0, wall: () => 0 },
			watchNetwork: (onChange) => {
				changed = onChange;
				return () => {};
			},
			checkWebRtc: () => new Promise((resolve) => pending.push(resolve)),
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {
				notifications++;
			},
		},
	);
	expect(pending).toHaveLength(1);
	changed();
	expect(pending).toHaveLength(2);
	pending[1]?.({ kind: "checked", channel: "open", candidates: ["host mDNS"] });
	await Promise.resolve();
	pending[0]?.({ kind: "missing" });
	await Promise.resolve();
	expect(mesh.diagnostics().webRtc).toEqual({
		kind: "checked",
		channel: "open",
		candidates: ["host mDNS"],
	});
	expect(notifications).toBe(1);
	await mesh.leave();
});

it("reconnects configured relays on network changes and stops watching on leave", async () => {
	const reconnected: string[] = [];
	let changed = () => {};
	let stopped = false;
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: {
				trackers: ["wss://tracker.test"],
				mqttBrokers: ["wss://broker.test"],
				rtc: {},
			},
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({}),
			clock: { monotonic: () => 0, wall: () => 0 },
			watchNetwork: (onChange) => {
				changed = onChange;
				return () => {
					stopped = true;
				};
			},
			reconnectRelay: (kind, url) => reconnected.push(`${kind} ${url}`),
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	changed();
	expect(reconnected).toEqual([
		"tracker wss://tracker.test",
		"mqtt wss://broker.test",
	]);
	await mesh.leave();
	expect(stopped).toBe(true);
	changed();
	expect(reconnected).toHaveLength(2);
});

it("replaces apparently open relays after timers stop while the page is hidden", async () => {
	let now = 0;
	let shown = () => {};
	const reconnected: string[] = [];
	const tracker = { readyState: 1 };
	const broker = { readyState: 3 };
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: {
				trackers: ["wss://tracker.test"],
				mqttBrokers: ["wss://broker.test"],
				rtc: {},
			},
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({ "wss://tracker.test": tracker }),
			mqttSockets: () => ({ "wss://broker.test": broker }),
			clock: { monotonic: () => now, wall: () => now },
			watchNetwork: (_changed, onShown) => {
				shown = onShown;
				return () => {};
			},
			reconnectRelay: (kind, url) => reconnected.push(`${kind} ${url}`),
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	mesh.tick();
	now = LATE_TICK_MS;
	shown();
	expect(reconnected).toEqual(["mqtt wss://broker.test"]);
	reconnected.length = 0;
	broker.readyState = 1;
	now++;
	shown();
	expect(reconnected).toEqual([
		"tracker wss://tracker.test",
		"mqtt wss://broker.test",
	]);
	await mesh.leave();
});

it("rejoins promptly after a network change when a relay opens", async () => {
	let changed = () => {};
	let open = false;
	let joins = 0;
	const room = (): MeshRoom => ({
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	});
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: { trackers: ["wss://tracker.test"], rtc: {} },
			joinRoom: () => {
				joins++;
				return room();
			},
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({
				"wss://tracker.test": { readyState: open ? 1 : 0 },
			}),
			clock: { monotonic: () => 100, wall: () => 100 },
			watchNetwork: (onChange) => {
				changed = onChange;
				return () => {};
			},
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	changed();
	mesh.tick();
	expect(joins).toBe(1);
	open = true;
	mesh.tick();
	expect(joins).toBe(2);
	await mesh.leave();
});

it.each([
	{ delay: 1_000, immediate: true },
	{ delay: NETWORK_REJOIN_MS, immediate: false },
])(
	"uses the network recovery window when the last peer drops: $delay ms",
	async ({ delay, immediate }) => {
		let now = 0;
		let changed = () => {};
		let joins = 0;
		const peer = "abcdefghijklmnopqrst";
		const peers: Record<string, RTCPeerConnection> = {
			[peer]: {} as RTCPeerConnection,
		};
		const room: MeshRoom = {
			makeAction: () => ({
				send: async () => {},
				onMessage: null,
				onReceive: null,
				onReceiveProgress: null,
			}),
			getPeers: () => peers,
			leave: async () => {},
			onPeerJoin: null,
			onPeerLeave: null,
		};
		const mesh = new Mesh(
			{
				tableId: "table",
				key: "key",
				config: { trackers: ["wss://tracker.test"], rtc: {} },
				joinRoom: () => {
					joins++;
					return room;
				},
				self: "0123456789AbCdEfGhIj",
				trackerSockets: () => ({ "wss://tracker.test": { readyState: 1 } }),
				clock: { monotonic: () => now, wall: () => now },
				watchNetwork: (onChange) => {
					changed = onChange;
					return () => {};
				},
			},
			{
				join: () => {},
				leave: () => {},
				ctl: () => {},
				log: () => {},
				call: () => {},
				change: () => {},
			},
		);
		room.onPeerJoin?.(peer);
		mesh.tick();
		changed();
		now = delay;
		delete peers[peer];
		room.onPeerLeave?.(peer);
		mesh.tick();
		expect(joins).toBe(immediate ? 2 : 1);
		now++;
		mesh.tick();
		expect(joins).toBe(immediate ? 2 : 1);
		now = delay + REJOIN_MS;
		mesh.tick();
		expect(joins).toBe(immediate ? 3 : 2);
		await mesh.leave();
	},
);

it("replaces silent relays and keeps a relay that continues to answer", async () => {
	let now = 0;
	let tracker = Object.assign(new EventTarget(), { readyState: 1 });
	const broker = Object.assign(new EventTarget(), { readyState: 1 });
	const reconnected: string[] = [];
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: {
				trackers: ["wss://tracker.test"],
				mqttBrokers: ["wss://broker.test"],
				rtc: {},
			},
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({ "wss://tracker.test": tracker }),
			mqttSockets: () => ({ "wss://broker.test": broker }),
			reconnectRelay: (kind, url) => reconnected.push(`${kind} ${url}`),
			clock: { monotonic: () => now, wall: () => now },
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	mesh.tick();
	expect(mesh.diagnostics().relays).toEqual([
		{ kind: "tracker", url: "wss://tracker.test", open: true },
		{ kind: "mqtt", url: "wss://broker.test", open: true },
	]);
	broker.readyState = 3;
	expect(mesh.diagnostics().relays[1]).toEqual({
		kind: "mqtt",
		url: "wss://broker.test",
		open: false,
	});
	broker.readyState = 1;
	now = MQTT_SILENT_MS - 1;
	tracker.dispatchEvent(new Event("message"));
	mesh.tick();
	expect(mesh.diagnostics().relays[0]).toEqual({
		kind: "tracker",
		url: "wss://tracker.test",
		open: true,
		heardAgoMs: 0,
	});
	expect(reconnected).toEqual([]);
	now += 1;
	mesh.tick();
	expect(mesh.diagnostics().relays[0]?.heardAgoMs).toBe(1);
	expect(reconnected).toEqual(["mqtt wss://broker.test"]);
	now = MQTT_SILENT_MS - 1 + RELAY_SILENT_MS;
	mesh.tick();
	expect(reconnected).toContain("tracker wss://tracker.test");
	const oldTracker = tracker;
	tracker = Object.assign(new EventTarget(), { readyState: 1 });
	now++;
	mesh.tick();
	reconnected.length = 0;
	now += RELAY_SILENT_MS - 1;
	oldTracker.dispatchEvent(new Event("message"));
	now++;
	mesh.tick();
	expect(reconnected).toContain("tracker wss://tracker.test");
	await mesh.leave();
});

it("tracks tracker and MQTT recovery independently when their URLs are the same", async () => {
	const url = "wss://multiprotocol.test/";
	const config = readMeshConfig({
		VITE_TRACKER_URLS: url,
		VITE_MQTT_BROKER_URLS: url,
		VITE_NOSTR_RELAY_URLS: "none",
		VITE_STUN_URLS: "none",
	});
	if (!config.ok) throw new Error(config.error);
	let now = 0;
	const tracker = Object.assign(new EventTarget(), { readyState: 1 });
	const broker = Object.assign(new EventTarget(), { readyState: 1 });
	const reconnected: string[] = [];
	const room: MeshRoom = {
		makeAction: () => ({
			send: async () => {},
			onMessage: null,
			onReceive: null,
			onReceiveProgress: null,
		}),
		getPeers: () => ({}),
		leave: async () => {},
		onPeerJoin: null,
		onPeerLeave: null,
	};
	const mesh = new Mesh(
		{
			tableId: "table",
			key: "key",
			config: config.config,
			joinRoom: () => room,
			self: "0123456789AbCdEfGhIj",
			trackerSockets: () => ({ [url]: tracker }),
			mqttSockets: () => ({ [url]: broker }),
			reconnectRelay: (kind, address) => reconnected.push(`${kind} ${address}`),
			clock: { monotonic: () => now, wall: () => now },
		},
		{
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	mesh.tick();
	now = MQTT_SILENT_MS - 1;
	tracker.dispatchEvent(new Event("message"));
	mesh.tick();
	now++;
	mesh.tick();
	expect(reconnected).toEqual([`mqtt ${url}`]);
	expect(mesh.diagnostics().relays).toEqual([
		{ kind: "tracker", url, open: true, heardAgoMs: 1 },
		{ kind: "mqtt", url, open: true },
	]);
	now = MQTT_SILENT_MS - 1 + RELAY_SILENT_MS;
	broker.dispatchEvent(new Event("message"));
	mesh.tick();
	expect(reconnected).toEqual([`mqtt ${url}`, `tracker ${url}`]);
	await mesh.leave();
});
