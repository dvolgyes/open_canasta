import { describe, expect, it } from "vitest";
import { createNostrSubscriptions } from "../../src/p2p/nostr-subscriptions";

describe("Nostr subscription batches", () => {
	it("batches topics and routes only events belonging to their subscription", () => {
		const sent: unknown[] = [];
		const received: string[] = [];
		let nextId = 0;
		const subscriptions = createNostrSubscriptions({
			send: (message) => sent.push(message),
			newId: () => `sub${++nextId}`,
			kindFor: (topic) => Number(topic),
			now: () => 123,
		});
		for (let i = 0; i < 251; i++)
			subscriptions.add(String(i), (topic, content) =>
				received.push(`${topic}:${content}`),
			);
		subscriptions.flush();
		expect(sent).toHaveLength(2);
		expect(sent[0]).toEqual([
			"REQ",
			"sub1",
			{
				kinds: Array.from({ length: 250 }, (_, i) => i),
				since: 123,
				"#x": Array.from({ length: 250 }, (_, i) => String(i)),
			},
		]);
		subscriptions.deliver("sub1", "250", "wrong batch");
		subscriptions.deliver("unknown", "0", "unknown subscription");
		subscriptions.deliver("sub2", "250", "ok");
		expect(received).toEqual(["250:ok"]);
	});

	it("closes obsolete subscriptions and does not deliver after cleanup", () => {
		const sent: unknown[] = [];
		const received: string[] = [];
		let nextId = 0;
		const subscriptions = createNostrSubscriptions({
			send: (message) => sent.push(message),
			newId: () => `sub${++nextId}`,
			kindFor: () => 20000,
			now: () => 0,
		});
		const remove = subscriptions.add("topic", (_, content) =>
			received.push(content),
		);
		subscriptions.flush();
		remove();
		subscriptions.deliver("sub1", "topic", "late");
		subscriptions.flush();
		expect(sent.at(-1)).toEqual(["CLOSE", "sub1"]);
		expect(received).toEqual([]);
	});

	it("does not let an old cleanup remove a replacement handler", () => {
		const received: string[] = [];
		const subscriptions = createNostrSubscriptions({
			send: () => {},
			newId: () => "sub",
			kindFor: () => 20000,
			now: () => 0,
		});
		const old = subscriptions.add("topic", () => received.push("old"));
		subscriptions.add("topic", () => received.push("new"));
		old();
		subscriptions.flush();
		subscriptions.deliver("sub", "topic", "message");
		expect(received).toEqual(["new"]);
	});

	it("reissues the current subscriptions after reconnect", () => {
		const sent: unknown[] = [];
		const subscriptions = createNostrSubscriptions({
			send: (message) => sent.push(message),
			newId: () => "sub",
			kindFor: () => 20000,
			now: () => 123,
		});
		subscriptions.add("one", () => {});
		subscriptions.add("two", () => {});
		subscriptions.flush();
		subscriptions.flush();
		expect(sent).toEqual([
			["REQ", "sub", { kinds: [20000], since: 123, "#x": ["one", "two"] }],
			["REQ", "sub", { kinds: [20000], since: 123, "#x": ["one", "two"] }],
		]);
	});

	it("rejects duplicate subscription identifiers before sending", () => {
		const sent: unknown[] = [];
		const subscriptions = createNostrSubscriptions({
			send: (message) => sent.push(message),
			newId: () => "duplicate",
			kindFor: () => 20000,
			now: () => 0,
		});
		for (let i = 0; i < 251; i++) subscriptions.add(String(i), () => {});
		expect(() => subscriptions.flush()).toThrow("Invalid or duplicate");
		expect(sent).toEqual([]);
	});
});
