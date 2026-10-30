import { expect, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	openHostControls,
	ownLink,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("a direct link asks for a name before starting an abandoned setup", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await Player.open(browser, baseURL, "direct-seed-creator");
	const newcomer = await Player.open(browser, baseURL, "direct-seed-newcomer");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await creator.installRelay(hub);
		await newcomer.installRelay(hub);
		const first = await creator.page("/");
		await first.getByLabel("North name").fill("");
		const link = await createTableLink(first);
		await creator.close();
		const page = await newcomer.page(ownLink(link, "N"));
		await expect(page.getByTestId("join-player-name")).toBeVisible({
			timeout: CONNECT_MS,
		});
		await page.getByTestId("join-player-name").fill("Alice");
		await page.getByRole("button", { name: "Join game", exact: true }).click();
		await expect(page).toHaveTitle(/Alice \(N, host\)$/, { timeout: 90_000 });
		await page.reload();
		await expect(page).toHaveTitle(/Alice \(N(?:, host)?\)$/, {
			timeout: CONNECT_MS,
		});
	} finally {
		await newcomer.close();
		await creator.close();
	}
});

test("a direct link uses the live host's newer seat name", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "renamed-seat-host");
	const guest = await Player.open(browser, baseURL, "renamed-seat-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const page = await host.page("/");
		await page.getByLabel("East name").fill("");
		const link = await createTableLink(page);
		await openHostControls(page);
		await page.getByRole("button", { name: "Player names" }).click();
		await page.getByTestId("rename-E").fill("Alice");
		await page
			.locator(".player-editor-seat")
			.filter({ has: page.getByTestId("rename-E") })
			.getByLabel("Ask the player for a name")
			.uncheck();
		await page
			.getByTestId("player-editor")
			.getByRole("button", { name: "Save" })
			.click();
		await expect(page.getByTestId("player-editor")).not.toBeVisible();
		const join = await guest.page(ownLink(link, "E"));
		await expect(join).toHaveTitle(/Alice \(E\)/, { timeout: CONNECT_MS });
		await expect(join.getByTestId("join-player-name")).not.toBeVisible();
	} finally {
		await guest.close();
		await host.close();
	}
});
