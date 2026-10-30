import { expect, test } from "@playwright/test";
import { joinWith, toggle } from "./call-probe";
import { CONNECT_MS, createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("audio-only peers show a voice indicator that follows receive and appearance controls", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL missing");
	const hub = new RelayHub("tracker", buildTrackerUrls());
	const host = await Player.open(browser, baseURL, "voice-host");
	const guest = await Player.open(browser, baseURL, "voice-guest");
	try {
		await Promise.all([host.installRelay(hub), guest.installRelay(hub)]);
		await Promise.all([
			host.grantPermissions(["microphone"]),
			guest.grantPermissions(["microphone"]),
		]);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const guestPage = await guest.page(link);
		await pick(guestPage, "N");
		await joinWith(hostPage, "Audio only");
		await joinWith(guestPage, "Audio only");
		const box = hostPage.getByTestId("voicebox-N");
		await expect(box).toBeVisible({ timeout: CONNECT_MS });
		await expect
			.poll(() => box.locator("[data-lit]").count(), { timeout: CONNECT_MS })
			.toBeGreaterThan(0);
		await hostPage.getByRole("button", { name: "Appearance settings" }).click();
		const dialog = hostPage.getByRole("dialog", {
			name: "Appearance settings",
		});
		await dialog
			.getByLabel("Show the voice box for a player without video")
			.uncheck();
		await expect(box).toBeHidden();
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await expect(box).toBeVisible();
		await toggle(hostPage, "Hear others: receive audio").click();
		await expect(box).toBeHidden();
		expect(host.errors).toEqual([]);
		expect(guest.errors).toEqual([]);
	} finally {
		await Promise.all([host.close(), guest.close()]);
	}
});
