import { describe, expect, it } from "vitest";
import {
	MAX_NOSTR_FRAME_CHARS,
	parseNostrMessage,
} from "../../src/p2p/nostr-message";

describe("Nostr relay messages", () => {
	it("reads the subscribed topic and content from an event", () => {
		expect(
			parseNostrMessage(
				JSON.stringify([
					"EVENT",
					"subscription",
					{
						tags: [
							["other", "ignored"],
							["x", "topic"],
						],
						content: "offer",
					},
				]),
			),
		).toEqual({
			type: "EVENT",
			subId: "subscription",
			topic: "topic",
			content: "offer",
		});
	});

	it("recognizes relay status without exposing its untrusted text", () => {
		expect(
			parseNostrMessage(
				JSON.stringify(["OK", "event", false, "rate-limited: text\nsecret"]),
			),
		).toEqual({
			type: "OK",
			accepted: false,
			reason: "rate-limited",
		});
		expect(
			parseNostrMessage(JSON.stringify(["CLOSED", "sub", "blocked: text"])),
		).toEqual({
			type: "CLOSED",
			subId: "sub",
			reason: "blocked",
		});
		expect(parseNostrMessage(JSON.stringify(["EOSE", "sub"]))).toEqual({
			type: "EOSE",
			subId: "sub",
		});
		expect(
			parseNostrMessage(JSON.stringify(["NOTICE", "private relay text"])),
		).toEqual({ type: "NOTICE" });
		expect(
			parseNostrMessage(
				JSON.stringify(["OK", "event", false, "unknown: text"]),
			),
		).toEqual({ type: "OK", accepted: false, reason: "other" });
		for (const prefix of [
			"rate-limited",
			"duplicate",
			"blocked",
			"restricted",
			"auth-required",
			"pow",
		] as const)
			expect(
				parseNostrMessage(
					JSON.stringify(["OK", "event", false, `${prefix}: detail`]),
				),
			).toEqual({ type: "OK", accepted: false, reason: prefix });
	});

	it("accepts the frame and subscription size boundaries", () => {
		const prefix = JSON.stringify(["EOSE", "s".repeat(64)]);
		expect(
			parseNostrMessage(
				prefix + " ".repeat(MAX_NOSTR_FRAME_CHARS - prefix.length),
			),
		).toEqual({ type: "EOSE", subId: "s".repeat(64) });
	});

	it("rejects invalid and oversized messages", () => {
		expect(parseNostrMessage(null)).toBeUndefined();
		for (const message of [
			"{",
			" ".repeat(MAX_NOSTR_FRAME_CHARS + 1),
			JSON.stringify(["EVENT", "", { tags: [["x", "topic"]], content: "a" }]),
			JSON.stringify([
				"EVENT",
				"s".repeat(65),
				{ tags: [["x", "topic"]], content: "a" },
			]),
			JSON.stringify(["EVENT", "sub", { tags: [["x", ""]], content: "a" }]),
			JSON.stringify([
				"EVENT",
				"sub",
				{ tags: [["x", "t".repeat(1025)]], content: "a" },
			]),
			JSON.stringify(["EVENT", "sub", { tags: [["x", "topic"]], content: 1 }]),
			JSON.stringify(["EOSE", ""]),
			JSON.stringify(["CLOSED", "sub", 1]),
			JSON.stringify(["OK", "event", "yes", ""]),
			JSON.stringify(["NOTICE", 1]),
		])
			expect(parseNostrMessage(message)).toBeUndefined();
	});
});
