import { expect, it } from "vitest";
import type { MeshHandlers } from "../../src/p2p/mesh";
import { trysteroMesh } from "../../src/p2p/trystero";

it("opens no relay socket when tracker and MQTT discovery are disabled", async () => {
	const opened: string[] = [];
	const nativeWebSocket = globalThis.WebSocket;
	globalThis.WebSocket = new Proxy(nativeWebSocket, {
		construct(_target, args) {
			opened.push(String(args[0]));
			throw new Error("unexpected relay socket");
		},
	});
	const handlers: MeshHandlers = {
		join: () => {},
		leave: () => {},
		ctl: () => {},
		log: () => {},
		call: () => {},
		change: () => {},
	};
	try {
		const mesh = trysteroMesh(
			"discovery-off",
			"k".repeat(43),
			{ trackers: [], mqttBrokers: [], rtc: { iceServers: [] } },
			{ monotonic: () => performance.now(), wall: () => Date.now() },
		)(handlers);
		try {
			mesh.tick();
			await Promise.resolve();
			expect(opened).toEqual([]);
			expect(mesh.diagnostics()).toMatchObject({ relays: [], stun: [] });
		} finally {
			await mesh.leave();
		}
	} finally {
		globalThis.WebSocket = nativeWebSocket;
	}
});
