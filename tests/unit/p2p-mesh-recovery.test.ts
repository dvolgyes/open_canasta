import { expect, it } from "vitest";
import { MQTT_SILENT_MS, RELAY_SILENT_MS } from "../../src/p2p/limits";
import { Mesh, type MeshRoom } from "../../src/p2p/mesh";

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

it("replaces silent relays and keeps a relay that continues to answer", async () => {
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
	now = MQTT_SILENT_MS - 1;
	tracker.dispatchEvent(new Event("message"));
	mesh.tick();
	expect(reconnected).toEqual([]);
	now += 1;
	mesh.tick();
	expect(reconnected).toEqual(["mqtt wss://broker.test"]);
	now = MQTT_SILENT_MS - 1 + RELAY_SILENT_MS;
	mesh.tick();
	expect(reconnected).toContain("tracker wss://tracker.test");
	await mesh.leave();
});
