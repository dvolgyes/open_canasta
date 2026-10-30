import { expect, test } from "@playwright/test";
import type { Harness } from "./harness/main";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("a peer's build report is shown only while that peer is connected", async ({
	browser,
}) => {
	const host = await Player.open(
		browser,
		"http://localhost:4174/",
		"build-host",
	);
	const guest = await Player.open(
		browser,
		"http://localhost:4174/",
		"build-guest",
	);
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const hostPage = await host.page("/");
		const guestPage = await guest.page("/");
		await hostPage.evaluate(() =>
			sessionStorage.setItem("test-build-date", "2026-01-01T00:00:00Z"),
		);
		await guestPage.evaluate(() =>
			sessionStorage.setItem("test-build-date", "2026-02-01T00:00:00Z"),
		);
		const { key } = await hostPage.evaluate(() =>
			(window.ocHarness as Harness).createTable("W"),
		);
		await guestPage.evaluate(
			(tableKey) => (window.ocHarness as Harness).openTable(tableKey),
			key,
		);
		await expect
			.poll(
				() =>
					hostPage.evaluate(
						() => (window.ocHarness as Harness).view()?.newerBuild,
					),
				{ timeout: 20_000 },
			)
			.toBe("2026-02-01T00:00:00Z");
		await guest.close();
		await expect
			.poll(
				() =>
					hostPage.evaluate(
						() => (window.ocHarness as Harness).view()?.newerBuild,
					),
				{ timeout: 20_000 },
			)
			.toBeUndefined();
	} finally {
		await guest.close();
		await host.close();
	}
});
