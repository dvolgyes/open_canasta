import { expect, test } from "@playwright/test";
import {
	caption,
	counts,
	expectAudioArrives,
	installCallProbe,
	joinWith,
} from "./call-probe";
import { CONNECT_MS, createTableLink, openHostControls, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("renaming a player preserves an active audio call", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "rename-call-host", {
		permissions: ["microphone"],
	});
	const guest = await Player.open(browser, baseURL, "rename-call-guest", {
		permissions: ["microphone"],
	});
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, guest]) {
			await player.installRelay(hub);
			await player.addInitScript(installCallProbe);
		}
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const guestPage = await guest.page(link);
		await pick(guestPage, "E");
		await joinWith(hostPage, "Audio only");
		await joinWith(guestPage, "Audio only");
		await expect(caption(hostPage, "E")).toContainText("player3", {
			timeout: CONNECT_MS,
		});
		await expectAudioArrives(hostPage);
		await expectAudioArrives(guestPage);
		const hostBefore = await counts(hostPage);
		const guestBefore = await counts(guestPage);
		await openHostControls(hostPage);
		await hostPage.getByRole("button", { name: "Player names" }).click();
		await hostPage.getByTestId("rename-E").fill("Alice");
		await hostPage
			.getByTestId("player-editor")
			.getByRole("button", { name: "Save" })
			.click();
		await expect(guestPage).toHaveTitle(/Alice \(E\)/);
		await expect(caption(hostPage, "E")).toContainText("Alice");
		await expectAudioArrives(hostPage);
		await expectAudioArrives(guestPage);
		expect((await counts(hostPage)).captures).toBe(hostBefore.captures);
		expect((await counts(guestPage)).captures).toBe(guestBefore.captures);
	} finally {
		await guest.close();
		await host.close();
	}
});
