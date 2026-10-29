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
