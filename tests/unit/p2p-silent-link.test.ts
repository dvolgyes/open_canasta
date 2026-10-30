import { expect, it } from "vitest";
import { Mesh, type MeshRoom } from "../../src/p2p/mesh";

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
