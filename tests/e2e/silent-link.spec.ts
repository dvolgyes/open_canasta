import { expect, test } from "@playwright/test";
import { freeze } from "./lifecycle";
import {
	CONNECT_MS,
	createTableLink,
	openDrawer,
	pick,
	rosterSeat,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("frequent checks reconnect a frozen player's silent link", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "silent-host");
	const guest = await Player.open(browser, baseURL, "silent-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const page = await host.page("/");
		const link = await createTableLink(page);
		await openDrawer(page);
		const network = page.getByTestId("network");
		await network.locator("summary").click();
		await network.getByLabel("Check the connection more often").check();
		const other = await guest.page(link);
		await pick(other, "N");
		await expect(rosterSeat(page, "N")).toHaveAttribute(
			"data-state",
			"online",
			{ timeout: CONNECT_MS },
		);
		const thaw = await freeze(other);
		try {
			await expect(rosterSeat(page, "N")).toHaveAttribute(
				"data-state",
				"offline",
				{ timeout: 19_000 },
			);
		} finally {
			await thaw();
		}
		await expect(rosterSeat(page, "N")).toHaveAttribute(
			"data-state",
			"online",
			{ timeout: CONNECT_MS },
		);
	} finally {
		await guest.close();
		await host.close();
	}
});
