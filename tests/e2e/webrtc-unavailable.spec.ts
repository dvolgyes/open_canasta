import { expect, test } from "@playwright/test";

test("explains why the game cannot connect when WebRTC is unavailable", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(globalThis, "RTCPeerConnection", {
			value: undefined,
		});
	});
	await page.goto("./");
	await expect(
		page.getByText(
			"This browser cannot connect to other players because WebRTC is unavailable.",
		),
	).toBeVisible();
});
