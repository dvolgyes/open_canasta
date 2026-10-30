import { expect, test } from "@playwright/test";
import {
	counts,
	installCallProbe,
	joinWith,
	leaveButton,
	requestsFor,
	senderFlow,
	toggle,
} from "./call-probe";
import { createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("the local preview can be hidden without stopping the sent camera", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "self-host", {
		permissions: ["microphone", "camera"],
	});
	const guest = await Player.open(browser, baseURL, "self-guest", {
		permissions: ["microphone", "camera"],
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
		expect((await counts(page)).captures).toBe(0);
		await joinWith(other, "See cameras; send voice");
		await joinWith(page, "Audio + video both ways");
		const video = page.getByTestId("video-self");
		const mirror = page.getByRole("button", { name: "Mirror my camera" });
		await expect(video).toBeVisible();
		await expect
			.poll(() =>
				video.evaluate(
					(node) => (node as HTMLVideoElement).srcObject instanceof MediaStream,
				),
			)
			.toBe(true);
		await expect
			.poll(() =>
				other
					.getByTestId("video-W")
					.evaluate(
						(node) =>
							(node as HTMLVideoElement).srcObject instanceof MediaStream,
					),
			)
			.toBe(true);
		const captures = await requestsFor(page, "video");
		await mirror.click();
		await expect(video).toBeHidden();
		await expect(mirror).toHaveAttribute("aria-pressed", "false");
		await expect(page.getByText("VIDEO IN PROGRESS")).toBeVisible();
		expect(await requestsFor(page, "video")).toBe(captures);
		await expect
			.poll(
				async () =>
					(await senderFlow(page, "video")).some(
						(sender) => sender.track && sender.bytes > 0,
					),
				{ timeout: 20_000 },
			)
			.toBe(true);
		await mirror.click();
		await expect(video).toBeVisible();
		await toggle(page, "Send camera video").click();
		await expect(video).toBeHidden();
		await expect(video).toHaveJSProperty("srcObject", null);
		await leaveButton(page).click();
		await expect(page.getByTestId("call-self")).toBeHidden();
	} finally {
		await guest.close();
		await host.close();
	}
});
