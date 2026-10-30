import { expect, test } from "@playwright/test";
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
	try {
		const first = await host.newPage();
		const second = await guest.newPage();
		const url = `http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?trackers=none&mqtt=none&nostr=wss%3A%2F%2Fnos.lol%2Cwss%3A%2F%2Frelay.primal.net%2Cwss%3A%2F%2Frelay.snort.social&stun=none`;
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
					{ timeout: 90_000 },
				)
				.toBe(1);
	} finally {
		await Promise.all([host.close(), guest.close()]);
	}
});
