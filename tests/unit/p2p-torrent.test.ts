import { afterEach, describe, expect, it, vi } from "vitest";
import { RTCPeerConnection as WeriftPeerConnection } from "werift";
import { APP_ID } from "../../src/p2p/config";
import { joinRoom } from "../../src/p2p/signaling";
import { trysteroMesh } from "../../src/p2p/trystero";

/** A tracker socket that opens at once and records each announce; it answers nothing. */
class FakeTracker {
	static readonly sent = new Map<string, Record<string, unknown>[]>();
	static readonly sockets = new Map<string, FakeTracker>();
	readonly url: string;
	readyState = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		FakeTracker.sockets.set(url, this);
		FakeTracker.sent.set(url, []);
		queueMicrotask(() => {
			this.readyState = 1;
			this.onopen?.();
		});
	}

	send(data: string): void {
		FakeTracker.sent.get(this.url)?.push(JSON.parse(data));
	}

	close(): void {}
}

const rtcPolyfill = WeriftPeerConnection as unknown as typeof RTCPeerConnection;

/** The offer count of the first announce that carries offers, sent to the tracker at the URL. */
function firstOfferCount(url: string): number | undefined {
	const announces = FakeTracker.sent.get(url) ?? [];
	const withOffers = announces.find(
		(message) => Array.isArray(message.offers) && message.offers.length > 0,
	);
	return (withOffers?.offers as unknown[] | undefined)?.length;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("the torrent strategy", () => {
	it("rejects invalid offer counts before opening a relay", () => {
		const socket = vi.fn();
		vi.stubGlobal("WebSocket", socket);
		for (const offersPerAnnounce of [
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			expect(() =>
				joinRoom(
					{
						appId: APP_ID,
						trackerUrls: ["wss://tracker.test"],
						nostrRelayUrls: [],
						mqttBrokerUrls: [],
						offersPerAnnounce,
					},
					"invalid-offers",
				),
			).toThrow("offersPerAnnounce must be a positive integer");
		}
		expect(socket).not.toHaveBeenCalled();
	});

	it("ignores an oversized tracker frame and still handles the next valid message", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
		const url = "wss://oversized-frame.test";
		const room = joinRoom(
			{
				appId: APP_ID,
				rtcPolyfill,
				trackerUrls: [url],
				nostrRelayUrls: [],
				mqttBrokerUrls: [],
			},
			"oversized-frame-room",
		);
		try {
			await expect
				.poll(() => firstOfferCount(url), { timeout: 10_000 })
				.toBe(1);
			const socket = FakeTracker.sockets.get(url);
			if (!socket?.onmessage) throw new Error("tracker socket is not ready");
			const emptyMessage = JSON.stringify({ "warning message": "" });
			const atLimit = JSON.stringify({
				"warning message": "x".repeat(1_048_576 - emptyMessage.length),
			});
			expect(atLimit.length).toBe(1_048_576);
			socket.onmessage({ data: atLimit });
			expect(warning).toHaveBeenCalledTimes(1);
			now.mockReturnValue(130_000);
			socket.onmessage({
				data: JSON.stringify({ "warning message": "x".repeat(1_048_576) }),
			});
			expect(warning).toHaveBeenCalledTimes(1);
			socket.onmessage({
				data: JSON.stringify({ "warning message": "small" }),
			});
			expect(warning).toHaveBeenCalledTimes(2);
		} finally {
			await room.leave();
			warning.mockRestore();
			now.mockRestore();
		}
	}, 20_000);

	it("limits repeated tracker warnings and reports them again after the interval", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
		const url = "wss://warning-flood.test";
		const otherUrl = "wss://other-warning.test";
		const room = joinRoom(
			{
				appId: APP_ID,
				rtcPolyfill,
				trackerUrls: [url, otherUrl],
				nostrRelayUrls: [],
				mqttBrokerUrls: [],
			},
			"warning-flood-room",
		);
		try {
			await expect
				.poll(() => firstOfferCount(url), { timeout: 10_000 })
				.toBe(1);
			await expect
				.poll(() => firstOfferCount(otherUrl), { timeout: 10_000 })
				.toBe(1);
			const socket = FakeTracker.sockets.get(url);
			if (!socket?.onmessage) throw new Error("tracker socket is not ready");
			const other = FakeTracker.sockets.get(otherUrl);
			if (!other?.onmessage) throw new Error("other tracker is not ready");
			const burst = () => {
				for (let i = 0; i < 100; i++) {
					for (const field of ["failure reason", "warning message"])
						socket.onmessage?.({
							data: JSON.stringify({ [field]: "untrusted" }),
						});
				}
			};
			burst();
			expect(warning).toHaveBeenCalledTimes(2);
			other.onmessage({ data: JSON.stringify({ "warning message": "other" }) });
			expect(warning).toHaveBeenCalledTimes(3);
			now.mockReturnValue(129_999);
			burst();
			expect(warning).toHaveBeenCalledTimes(3);
			now.mockReturnValue(130_000);
			burst();
			expect(warning).toHaveBeenCalledTimes(5);
			now.mockReturnValue(90_000);
			burst();
			expect(warning).toHaveBeenCalledTimes(7);
		} finally {
			await room.leave();
			warning.mockRestore();
			now.mockRestore();
		}
	}, 20_000);

	it("ignores malformed and invalid tracker messages", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const url = "wss://invalid-message.test";
		const room = joinRoom(
			{
				appId: APP_ID,
				rtcPolyfill,
				trackerUrls: [url],
				nostrRelayUrls: [],
				mqttBrokerUrls: [],
			},
			"invalid-message-room",
		);
		try {
			await expect
				.poll(() => firstOfferCount(url), { timeout: 10_000 })
				.toBe(1);
			const socket = FakeTracker.sockets.get(url);
			if (!socket?.onmessage) throw new Error("tracker socket is not ready");
			for (const data of [
				"{",
				"null",
				JSON.stringify({ interval: "slow" }),
				JSON.stringify({ offer: { type: "offer", sdp: 42 } }),
			]) {
				expect(() => socket.onmessage?.({ data })).not.toThrow();
			}
		} finally {
			await room.leave();
		}
	}, 20_000);

	it("sends one offer in each announce, as Trystero does, when the room sets no count", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const url = "wss://default-count.test";
		const room = joinRoom(
			{
				appId: APP_ID,
				rtcPolyfill,
				trackerUrls: [url],
				nostrRelayUrls: [],
				mqttBrokerUrls: [],
			},
			"pair-room",
		);
		await expect.poll(() => firstOfferCount(url), { timeout: 10_000 }).toBe(1);
		await room.leave();
	}, 20_000);

	it("tells the tracker that the page stopped when it leaves a room, so the tracker sends no more offers to it", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const url = "wss://leave.test";
		const room = joinRoom(
			{
				appId: APP_ID,
				rtcPolyfill,
				trackerUrls: [url],
				nostrRelayUrls: [],
				mqttBrokerUrls: [],
			},
			"left-room",
		);
		await expect.poll(() => firstOfferCount(url), { timeout: 10_000 }).toBe(1);
		const infoHash = FakeTracker.sent.get(url)?.[0]?.info_hash;
		await room.leave();
		await expect
			.poll(() => FakeTracker.sent.get(url)?.at(-1), { timeout: 5_000 })
			.toMatchObject({
				action: "announce",
				event: "stopped",
				info_hash: infoHash,
				numwant: 0,
				offers: [],
			});
	}, 20_000);

	it("sends three offers in each table-room announce, so that stale peers at the front of the swarm cannot take them all", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const url = "wss://table-count.test";
		const mesh = trysteroMesh(
			"table-room",
			"key",
			{ trackers: [url], rtc: {} },
			{ monotonic: () => performance.now(), wall: () => Date.now() },
			rtcPolyfill,
		)({
			join: () => {},
			leave: () => {},
			ctl: () => {},
			log: () => {},
			call: () => {},
			change: () => {},
		});
		await expect.poll(() => firstOfferCount(url), { timeout: 10_000 }).toBe(3);
		await mesh.leave();
	}, 20_000);
});
