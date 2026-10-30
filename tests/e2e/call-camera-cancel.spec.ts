import { expect, test } from "@playwright/test";
import {
	chooseMode,
	installCallProbe,
	joinButton,
	joinWith,
	leaveButton,
	requestsFor,
	toggle,
} from "./call-probe";
import { createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("canceling a camera preview joins with the other selected media", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "cancel-host", {
		permissions: ["microphone", "camera"],
	});
	const guest = await Player.open(browser, baseURL, "cancel-guest", {
		permissions: ["microphone"],
	});
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, guest]) {
			await player.installRelay(hub);
			await player.addInitScript(installCallProbe);
		}
		const page = await host.page("/");
		const link = await createTableLink(page);
		const other = await guest.page(link);
		await pick(other, "N");
		await joinWith(page, "Audio only");
		await chooseMode(other, "Audio + video both ways");
		await joinButton(other).click();
		await expect(other.getByTestId("camera-preview")).toBeVisible();
		await other.getByTestId("camera-preview-cancel").click();
		await expect(leaveButton(other)).toBeVisible();
		await expect(toggle(other, "Send mic audio")).toHaveAttribute(
			"data-actual",
			"on",
		);
		await expect(toggle(other, "Send camera video")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(await requestsFor(other, "video")).toBe(1);
		await toggle(other, "Send camera video").click();
		await expect(other.getByTestId("camera-preview")).toBeVisible();
		await other.getByTestId("camera-preview-cancel").click();
		await expect(leaveButton(other)).toBeVisible();
		await expect(toggle(other, "Send camera video")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		await expect(toggle(other, "Send mic audio")).toHaveAttribute(
			"data-actual",
			"on",
		);
	} finally {
		await guest.close();
		await host.close();
	}
});
