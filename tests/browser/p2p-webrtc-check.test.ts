import { expect, it } from "vitest";
import { webRtcCheck } from "../../src/p2p/webrtc-check";

it("opens a local data channel and reports candidate classes without addresses", async () => {
	const report = await webRtcCheck(RTCPeerConnection, {}, 8_000)();
	expect(report).toMatchObject({ kind: "checked", channel: "open" });
	if (report.kind !== "checked") throw new Error("WebRTC is missing");
	expect(report.candidates.some((label) => label.startsWith("host "))).toBe(
		true,
	);
	for (const label of report.candidates)
		expect(label).toMatch(/^(host|srflx|prflx|relay) (IPv4|IPv6|mDNS)( TCP)?$/);
}, 10_000);
