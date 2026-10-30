import { describe, expect, it } from "vitest";
import { candidateLabel, webRtcCheck } from "../../src/p2p/webrtc-check";

describe("WebRTC diagnostics", () => {
	it("reports a missing WebRTC implementation", async () => {
		await expect(webRtcCheck(undefined, {})()).resolves.toEqual({
			kind: "missing",
		});
	});

	it("reports a browser that refuses to create a peer connection", async () => {
		const blocked = class {
			constructor() {
				throw new DOMException("blocked", "NotSupportedError");
			}
		};
		await expect(
			webRtcCheck(blocked as unknown as typeof RTCPeerConnection, {})(),
		).resolves.toEqual({
			kind: "checked",
			channel: "failed",
			candidates: [],
		});
	});

	it("reports a refused data channel and closes both connections", async () => {
		const connections: Connection[] = [];
		class Connection {
			closed = false;
			constructor() {
				connections.push(this);
			}
			createDataChannel() {
				throw new DOMException("blocked", "NotSupportedError");
			}
			close() {
				this.closed = true;
			}
		}
		await expect(
			webRtcCheck(Connection as unknown as typeof RTCPeerConnection, {})(),
		).resolves.toEqual({
			kind: "checked",
			channel: "failed",
			candidates: [],
		});
		expect(connections.map((connection) => connection.closed)).toEqual([
			true,
			true,
		]);
	});

	it("propagates an unexpected channel error after closing both connections", async () => {
		const connections: Connection[] = [];
		class Connection {
			closed = false;
			constructor() {
				connections.push(this);
			}
			createDataChannel() {
				throw new Error("unexpected");
			}
			close() {
				this.closed = true;
			}
		}
		await expect(
			webRtcCheck(Connection as unknown as typeof RTCPeerConnection, {})(),
		).rejects.toThrow("unexpected");
		expect(connections.map((connection) => connection.closed)).toEqual([
			true,
			true,
		]);
	});

	it("reports only known candidate types and address families", () => {
		expect(
			candidateLabel("candidate:1 1 udp 1 192.168.1.20 54321 typ host"),
		).toBe("host IPv4");
		expect(
			candidateLabel("candidate:2 1 udp 1 2001:db8::7 61000 typ srflx"),
		).toBe("srflx IPv6");
		expect(candidateLabel("candidate:3 1 tcp 1 name.local 9 typ host")).toBe(
			"host mDNS TCP",
		);
		expect(
			candidateLabel("candidate:1 1 udp 1 192.168.1.20 9 typ 192.168.1.20"),
		).toBeUndefined();
		expect(
			candidateLabel("candidate:1 1 unknown 1 192.168.1.20 9 typ host"),
		).toBeUndefined();
		expect(candidateLabel("")).toBeUndefined();
	});
});
