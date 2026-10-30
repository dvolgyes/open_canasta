import { expect, test } from "@playwright/test";
import { createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("host controls group management while a guest can still request a reset", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "controls-host");
	const guest = await Player.open(browser, baseURL, "controls-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const page = await host.page("/");
		const link = await createTableLink(page);
		const other = await guest.page(link);
		await pick(other, "N");
		await expect(
			other.getByRole("button", { name: "Host controls" }),
		).toBeHidden();
		await expect(other.getByTestId("reset")).toBeVisible();
		const open = page.getByRole("button", { name: "Host controls" });
		await expect(open).toBeVisible({ timeout: 3_000 });
		await open.click();
		const dialog = page.getByTestId("host-controls-dialog");
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Player names" }),
		).toBeVisible();
		await expect(dialog.getByTestId("reload-players")).toBeVisible();
		await expect(dialog.getByTestId("reset")).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Copy network diagnostics" }),
		).toBeVisible();
		await dialog.getByRole("button", { name: "Close" }).click();
		await expect(dialog).toBeHidden();
	} finally {
		await guest.close();
		await host.close();
	}
});
