import { expect, it } from "vitest";
import { Mesh, type MeshRoom } from "../../src/p2p/mesh";
import { frame } from "../../src/p2p/wire";

it("rejects messages from peers before admission and after they leave", async () => {
	const peer = "peer0000000000000000";
	const received: unknown[] = [];
	const actions: ReturnType<MeshRoom["makeAction"]>[] = [];
	const room: MeshRoom = {
		makeAction: () => {
			const action: ReturnType<MeshRoom["makeAction"]> = {
				send: async () => {},
				onMessage: null,
				onReceive: null,
				onReceiveProgress: null,
			};
			actions.push(action);
			return action;
		},
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
		},
		{
			join: () => {},
			leave: () => {},
			ctl: (sender, message) => received.push({ sender, message }),
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	const action = actions[0];
	if (!action?.onReceive || !action.onMessage)
		throw new Error("Missing control action");
	const message = { k: "gone", reason: "expired" };
	const context = {
		peerId: peer,
		byteLength: 10,
		kind: "message" as const,
		signal: new AbortController().signal,
	};
	const send = () =>
		action.onMessage?.(frame("table", message), { peerId: peer });
	expect(await action.onReceive(context)).toBe(false);
	await send();
	expect(received).toEqual([]);
	room.onPeerJoin?.(peer);
	expect(await action.onReceive(context)).toBe(true);
	await send();
	expect(received).toEqual([{ sender: peer, message }]);
	room.onPeerLeave?.(peer);
	expect(await action.onReceive(context)).toBe(false);
	await send();
	expect(received).toHaveLength(1);
	expect(mesh.diagnostics().dropped.stranger).toBe(4);
	await mesh.leave();
});

it("repairs only a silent link while checks are active and the page is running", async () => {
	let now = 0;
	let enabled = false;
	let closes = 0;
	let healthyCloses = 0;
	const left: string[] = [];
	const peer = "peer0000000000000000";
	const healthy = "healthy0000000000000";
	const connection = new EventTarget() as RTCPeerConnection;
	connection.close = () => {
		closes++;
	};
	const healthyConnection = new EventTarget() as RTCPeerConnection;
	healthyConnection.close = () => {
		healthyCloses++;
	};
	const actions: ReturnType<MeshRoom["makeAction"]>[] = [];
	const room: MeshRoom = {
		makeAction: () => {
			const action: ReturnType<MeshRoom["makeAction"]> = {
				send: async () => {},
				onMessage: null,
				onReceive: null,
				onReceiveProgress: null,
			};
			actions.push(action);
			return action;
		},
		getPeers: () => ({ [peer]: connection, [healthy]: healthyConnection }),
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
			clock: { monotonic: () => now, wall: () => now },
			silentLinks: () => enabled,
		},
		{
			join: () => {},
			leave: (id) => left.push(id),
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		},
	);
	room.onPeerJoin?.(peer);
	room.onPeerJoin?.(healthy);
	const advance = (ms: number) => {
		for (let end = now + ms; now < end; ) {
			now += 1_000;
			actions[0]?.onReceive?.({
				peerId: healthy,
				byteLength: 10,
				kind: "message",
				signal: new AbortController().signal,
			});
			mesh.tick();
		}
	};
	advance(20_000);
	expect(closes).toBe(0);
	enabled = true;
	advance(14_000);
	expect(closes).toBe(0);
	actions[0]?.onReceive?.({
		peerId: peer,
		byteLength: 10,
		kind: "message",
		signal: new AbortController().signal,
	});
	advance(14_000);
	expect(closes).toBe(0);
	now += 10_000;
	mesh.tick();
	advance(14_000);
	expect(closes).toBe(0);
	advance(1_000);
	expect(closes).toBe(1);
	expect(healthyCloses).toBe(0);
	expect(left).toEqual([peer]);
	expect(mesh.diagnostics().silentCloses).toBe(1);
	await mesh.leave();
});
