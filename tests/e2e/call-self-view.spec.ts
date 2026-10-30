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

test("the desktop call controls fit their tile in every language", async ({
	page,
}) => {
	await page.goto("/");
	await createTableLink(page);
	for (const locale of ["en", "de", "hu", "no", "es", "pt", "fr", "it", "nl"]) {
		await page.evaluate(
			(value) => localStorage.setItem("dvolgyes-open_canasta.locale", value),
			locale,
		);
		await page.reload();
		const panel = page.getByTestId("call-panel");
		await expect(panel).toBeVisible();
		const bounds = await panel.evaluate((node) => {
			const panelBox = node.getBoundingClientRect();
			const children = [
				node.querySelector("h4"),
				...node.querySelectorAll(".call-switches button"),
			];
			return children.every((child) => {
				if (!child) return false;
				const box = child.getBoundingClientRect();
				return (
					box.left >= panelBox.left - 1 &&
					box.right <= panelBox.right + 1 &&
					box.top >= panelBox.top - 1 &&
					box.bottom <= panelBox.bottom + 1
				);
			});
		});
		expect(bounds, `call controls in ${locale}`).toBe(true);
	}
});

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
		const panel = page.getByTestId("call-panel");
		const tile = page.getByTestId("tile-N");
		const panelBox = await panel.boundingBox();
		const tileBox = await tile.boundingBox();
		expect(panelBox).not.toBeNull();
		expect(tileBox).not.toBeNull();
		expect(panelBox?.width).toBeCloseTo(tileBox?.width ?? 0, 0);
		expect(panelBox?.height).toBeCloseTo(tileBox?.height ?? 0, 0);
		expect((await counts(page)).captures).toBe(0);
		await joinWith(other, "See cameras; send voice");
		await joinWith(page, "Audio + video both ways");
		const video = page.getByTestId("video-self");
		const mirror = page.getByRole("button", { name: "Mirror my camera" });
		await expect(video).toBeVisible();
		const previewBox = await page.getByTestId("call-self").boundingBox();
		const switchesBox = await panel.locator(".call-switches").boundingBox();
		const leaveBox = await leaveButton(page).boundingBox();
		expect(previewBox?.height).toBeCloseTo(panelBox?.height ?? 0, 0);
		expect(switchesBox?.y ?? 0).toBeGreaterThan(previewBox?.y ?? 0);
		expect(leaveBox?.y ?? 0).toBeGreaterThanOrEqual(
			(panelBox?.y ?? 0) + (panelBox?.height ?? 0),
		);
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
