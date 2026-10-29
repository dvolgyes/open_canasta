import { expect, it, vi } from "vitest";
import { StunChecks, stunProbe } from "../../src/p2p/stun-probe";

it("reports a browser that refuses to create the probe connection", async () => {
	const blocked = class {
		constructor() {
			throw new DOMException("blocked", "NotSupportedError");
		}
	};
	await expect(
		stunProbe(blocked as unknown as typeof RTCPeerConnection)("stun:one.test"),
	).resolves.toBe("no-answer");
});

it("counts a server-reflexive candidate as an answer and closes the connection", async () => {
	class Connection {
		static last: Connection;
		onicecandidate:
			| ((event: { candidate: { candidate: string } | null }) => void)
			| null = null;
		closed = false;
		constructor(readonly config: RTCConfiguration) {
			Connection.last = this;
		}
		createDataChannel() {}
		async createOffer() {
			return {};
		}
		async setLocalDescription() {
			this.onicecandidate?.({
				candidate: { candidate: "candidate:1 1 udp 1 203.0.113.1 9 typ srflx" },
			});
		}
		close() {
			this.closed = true;
		}
	}
	const probe = stunProbe(Connection as unknown as typeof RTCPeerConnection);
	await expect(probe("stun:one.test")).resolves.toBe("answered");
	expect(Connection.last.config).toEqual({
		iceServers: [{ urls: "stun:one.test" }],
	});
	expect(Connection.last.closed).toBe(true);
});

it("checks each server initially, retries only while alone, and stops notifying after close", async () => {
	const pending: ((answer: "answered" | "no-answer") => void)[] = [];
	const notify = vi.fn();
	const checks = new StunChecks(
		["stun:one.test"],
		() => new Promise((resolve) => pending.push(resolve)),
		notify,
	);
	checks.tick(0, false);
	expect(pending).toHaveLength(1);
	pending[0]?.("answered");
	await Promise.resolve();
	expect(checks.statuses()[0]?.state).toBe("answered");
	checks.tick(60_000, false);
	expect(pending).toHaveLength(1);
	checks.tick(60_000, true);
	expect(pending).toHaveLength(2);
	checks.close();
	pending[1]?.("no-answer");
	await Promise.resolve();
	expect(notify).toHaveBeenCalledTimes(1);
});
