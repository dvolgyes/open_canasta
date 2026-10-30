import { expect, test } from "@playwright/test";
import { parseNostrMessage } from "../../src/p2p/nostr-message";
import type { Harness } from "./harness/main";

test("two pages discover each other through public Nostr relays", async ({
	browser,
}) => {
	test.skip(
		process.env.E2E_LIVE_NOSTR !== "1",
		"Set E2E_LIVE_NOSTR=1 to test public relays",
	);
	test.setTimeout(120_000);
	const host = await browser.newContext();
	const guest = await browser.newContext();
	const outcomes: Record<string, number> = {};
	try {
		const first = await host.newPage();
		const second = await guest.newPage();
		for (const page of [first, second])
			page.on("websocket", (socket) => {
				socket.on("framereceived", ({ payload }) => {
					const message = parseNostrMessage(payload);
					if (!message) return;
					const label =
						message.type === "OK"
							? message.accepted
								? "accepted"
								: `rejected:${message.reason}`
							: message.type === "CLOSED"
								? `closed:${message.reason}`
								: message.type;
					outcomes[label] = (outcomes[label] ?? 0) + 1;
				});
			});
		const query = new URLSearchParams({
			trackers: "none",
			mqtt: "none",
			nostr:
				process.env.E2E_NOSTR_URLS ??
				"wss://nos.lol,wss://relay.primal.net,wss://relay.snort.social",
			stun: "none",
		});
		const url = `http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?${query}`;
		await Promise.all([first.goto(url), second.goto(url)]);
		await Promise.all([
			first.waitForFunction(() => window.ocHarness !== undefined),
			second.waitForFunction(() => window.ocHarness !== undefined),
		]);
		const { key } = await first.evaluate(() =>
			(window.ocHarness as Harness).createTable("N"),
		);
		await second.evaluate(
			(link) => (window.ocHarness as Harness).openTable(link),
			key,
		);
		for (const page of [first, second])
			await expect
				.poll(
					() =>
						page.evaluate(
							() => (window.ocHarness as Harness).view()?.peers.length ?? 0,
						),
					{ timeout: Number(process.env.E2E_NOSTR_CONNECT_MS ?? 90_000) },
				)
				.toBe(1);
	} finally {
		console.error("Nostr relay outcome counts:", outcomes);
		await Promise.all([host.close(), guest.close()]);
	}
});
