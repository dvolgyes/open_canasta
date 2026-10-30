import { expect, test } from "@playwright/test";
import type { Harness } from "./harness/main";
import { createTableLink } from "./pages";
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
		await guestPage.evaluate(() =>
			sessionStorage.setItem("test-build-commit", "abcd1234"),
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
		await expect
			.poll(
				() =>
					hostPage.evaluate(
						() => (window.ocHarness as Harness).view()?.peers[0]?.build?.commit,
					),
				{ timeout: 20_000 },
			)
			.toBe("abcd1234");
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

test("the host sees each player's reported build without an automatic reload", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "build-ui-host");
	const guest = await Player.open(
		browser,
		"http://localhost:4174/",
		"build-ui-guest",
	);
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const key = new URLSearchParams(new URL(link).hash.slice(1)).get("k");
		if (!key) throw new Error("missing table key");
		const guestPage = await guest.page("/");
		await guestPage.evaluate(() => {
			sessionStorage.setItem("test-build-date", "9999-12-31T23:59:59Z");
			sessionStorage.setItem("test-build-commit", "ffffffffffffffff");
		});
		await guestPage.evaluate(
			(tableKey) => (window.ocHarness as Harness).openTable(tableKey, "E"),
			key,
		);
		await expect(hostPage.getByTestId("build-notice")).toBeVisible({
			timeout: 20_000,
		});
		const reload = hostPage.getByTestId("reload-players");
		await expect(reload).toHaveAttribute("data-outdated", "true");
		await expect(reload).toHaveAttribute("title", /East:.*ffffffffffffffff/);
		await expect(hostPage).toHaveTitle(/player4 \(W, host\)/);
		await guest.close();
		await expect(hostPage.getByTestId("build-notice")).toBeHidden({
			timeout: 20_000,
		});
	} finally {
		await guest.close();
		await host.close();
	}
});
