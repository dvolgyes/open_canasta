import { afterEach, describe, expect, it, vi } from "vitest";
import { RTCPeerConnection as WeriftPeerConnection } from "werift";
import { APP_ID } from "../../src/p2p/config";
import { joinRoom } from "../../src/p2p/torrent";
import { trysteroMesh } from "../../src/p2p/trystero";

/** A tracker socket that opens at once and records each announce; it answers nothing. */
class FakeTracker {
	static readonly sent = new Map<string, Record<string, unknown>[]>();
	readonly url: string;
	readyState = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
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
	it("sends one offer in each announce, as Trystero does, when the room sets no count", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const url = "wss://default-count.test";
		const room = joinRoom(
			{ appId: APP_ID, rtcPolyfill, relayConfig: { urls: [url] } },
			"pair-room",
		);
		await expect.poll(() => firstOfferCount(url), { timeout: 10_000 }).toBe(1);
		await room.leave();
	}, 20_000);

	it("tells the tracker that the page stopped when it leaves a room, so the tracker sends no more offers to it", async () => {
		vi.stubGlobal("WebSocket", FakeTracker);
		const url = "wss://leave.test";
		const room = joinRoom(
			{ appId: APP_ID, rtcPolyfill, relayConfig: { urls: [url] } },
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
