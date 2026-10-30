import { expect, test } from "@playwright/test";
import { CONNECT_MS, createTableLink, ownLink } from "./pages";
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
