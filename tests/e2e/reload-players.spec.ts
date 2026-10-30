import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("the host can reload a connected player without losing the seat", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "reload-host");
	const guest = await Player.open(browser, baseURL, "reload-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const page = await guest.page(link);
		await page.getByTestId("pick-E").click();
		await expect(
			hostPage.locator('li[data-seat="E"][data-state="online"]'),
		).toBeAttached();
		const reload = page.waitForEvent("load", { timeout: 15_000 });
		await hostPage.getByTestId("reload-players").click();
		await reload;
		await expect(page).toHaveTitle(/player3 \(E\)/);
		await expect(
			hostPage.locator('li[data-seat="E"][data-state="online"]'),
		).toBeAttached();
	} finally {
		await guest.close();
		await host.close();
	}
});
