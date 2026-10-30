import { describe, expect, it } from "vitest";
import {
	DEFAULT_MQTT_BROKER_URLS,
	DEFAULT_NOSTR_RELAY_URLS,
	DEFAULT_TRACKER_URLS,
	parseMqttBrokerUrls,
	parseNostrRelayUrls,
	parseTrackerUrls,
	readMeshConfig,
} from "../../src/p2p/config";
import { classifyJoinError } from "../../src/p2p/mesh";

describe("parseTrackerUrls", () => {
	it("allows trackers to be disabled when another relay is used", () => {
		expect(parseTrackerUrls(" none ")).toEqual({ ok: true, urls: [] });
	});
	it.each([
		["absent", undefined],
		["empty", ""],
		["blank", "  ,  "],
	])("gives the four default trackers when %s", (_name, value) => {
		expect(parseTrackerUrls(value)).toEqual({
			ok: true,
			urls: DEFAULT_TRACKER_URLS,
		});
		expect(DEFAULT_TRACKER_URLS).toContain("wss://tracker.novage.com.ua");
		expect(DEFAULT_TRACKER_URLS).toHaveLength(4);
	});

	it("accepts wss: URLs separated by commas or spaces and removes duplicates", () => {
		expect(
			parseTrackerUrls(
				"wss://a.example, wss://b.example:8443/announce wss://a.example",
			),
		).toEqual({
			ok: true,
			urls: ["wss://a.example", "wss://b.example:8443/announce"],
		});
	});

	it.each([
		["plain ws", "ws://tracker.example"],
		["https", "https://tracker.example"],
		["credentials", "wss://user:secret@tracker.example"],
		["a query", "wss://tracker.example/?token=1"],
		["a fragment", "wss://tracker.example/#k"],
		["not a URL", "tracker.example"],
	])("refuses %s", (_name, url) => {
		const result = parseTrackerUrls(`wss://good.example ${url}`);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toContain("VITE_TRACKER_URLS");
	});

	it("refuses more than eight URLs", () => {
		const urls = Array.from(
			{ length: 9 },
			(_, index) => `wss://t${index}.example`,
		);
		expect(parseTrackerUrls(urls.join(","))).toEqual({
			ok: false,
			error: "At most 8 tracker URLs are allowed (VITE_TRACKER_URLS).",
		});
	});

	it("does not echo credentials or query values from an invalid tracker URL", () => {
		for (const url of [
			"wss://user:example-secret@tracker.example",
			"wss://tracker.example/?token=example-secret",
		]) {
			const result = parseTrackerUrls(url);
			expect(result.ok).toBe(false);
			expect(JSON.stringify(result)).not.toContain("example-secret");
		}
	});
});

describe("readMeshConfig", () => {
	it("combines the tracker list with the STUN list", () => {
		expect(
			readMeshConfig({
				VITE_TRACKER_URLS: "wss://tracker.example",
				VITE_STUN_URLS: "stun:stun.example:3478",
			}),
		).toEqual({
			ok: true,
			config: {
				trackers: ["wss://tracker.example"],
				nostrRelays: DEFAULT_NOSTR_RELAY_URLS,
				mqttBrokers: DEFAULT_MQTT_BROKER_URLS,
				rtc: { iceServers: [{ urls: ["stun:stun.example:3478"] }] },
			},
		});
	});

	it("gives the tracker error before the STUN error", () => {
		const result = readMeshConfig({
			VITE_TRACKER_URLS: "ws://tracker.example",
			VITE_STUN_URLS: "turn:relay.example",
		});
		expect(!result.ok && result.error).toContain("VITE_TRACKER_URLS");
	});

	it("refuses a TURN server, so no relay service is used", () => {
		const result = readMeshConfig({ VITE_STUN_URLS: "turn:relay.example" });
		expect(!result.ok && result.error).toContain("TURN URLs are not supported");
	});
});

describe("parseNostrRelayUrls", () => {
	it("supports defaults, disabling and validated custom relays", () => {
		expect(parseNostrRelayUrls(undefined)).toEqual({
			ok: true,
			urls: DEFAULT_NOSTR_RELAY_URLS,
		});
		expect(parseNostrRelayUrls("none")).toEqual({ ok: true, urls: [] });
		expect(
			parseNostrRelayUrls("wss://relay.example wss://relay.example"),
		).toEqual({ ok: true, urls: ["wss://relay.example"] });
		for (const url of [
			"ws://relay.example",
			"wss://user:secret@relay.example",
			"wss://relay.example/?token=secret",
		]) {
			const result = parseNostrRelayUrls(url);
			expect(result.ok).toBe(false);
			expect(JSON.stringify(result)).not.toContain("secret");
		}
		expect(
			parseNostrRelayUrls(
				Array.from({ length: 9 }, (_, i) => `wss://r${i}.example`).join(","),
			).ok,
		).toBe(false);
	});
});

describe("parseMqttBrokerUrls", () => {
	it("supports defaults, explicit disabling and validated custom brokers", () => {
		expect(parseMqttBrokerUrls(undefined)).toEqual({
			ok: true,
			urls: DEFAULT_MQTT_BROKER_URLS,
		});
		expect(parseMqttBrokerUrls("none")).toEqual({ ok: true, urls: [] });
		expect(
			parseMqttBrokerUrls(
				"wss://broker.example/mqtt wss://broker.example/mqtt",
			),
		).toEqual({ ok: true, urls: ["wss://broker.example/mqtt"] });
		expect(parseMqttBrokerUrls("wss://user:secret@broker.example").ok).toBe(
			false,
		);
		expect(
			JSON.stringify(parseMqttBrokerUrls("wss://user:secret@broker.example")),
		).not.toContain("secret");
		expect(parseMqttBrokerUrls("ws://broker.example").ok).toBe(false);
	});
});

describe("classifyJoinError", () => {
	// The texts of @trystero-p2p/core 0.26.0 (dist/signal-handler.mjs).
	it.each([
		["incorrect room password when decrypting offer", "wrong-key"],
		["incorrect room password when decrypting answer", "wrong-key"],
		["incorrect password", "wrong-key"],
		[
			"could not connect to peer abc after exchanging SDP; configure TURN servers with turnConfig or rtcConfig.iceServers",
			"unreachable",
		],
		["peer connection closed", "other"],
		["", "other"],
	])("classifies %j as %s", (error, expected) => {
		expect(classifyJoinError(error)).toBe(expected);
	});
});
