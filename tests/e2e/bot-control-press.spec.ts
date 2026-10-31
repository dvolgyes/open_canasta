import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";
import { buildMqttUrls, buildTrackerUrls } from "./player";
import { RelayHub } from "./relay-hub";

test("a bot control keeps a press through routine table updates", async ({
	page,
	context,
}) => {
	await new RelayHub("tracker", buildTrackerUrls()).install(context, "press");
	await new RelayHub("mqtt", buildMqttUrls()).install(context, "press");
	await page.goto("/");
	await createTableLink(page);
	const control = page.locator(".seat-left .tile-bot-control");
	await expect(control).toBeVisible();
	const box = await page.evaluate(() => {
		const word = document.querySelector(".seat-left .tile-bot-control span");
		if (!(word instanceof HTMLElement)) return null;
		const rect = word.getBoundingClientRect();
		return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
	});
	if (!box) throw new Error("bot control has no visible bounds");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	// A press spans at least two ordinary 500 ms controller ticks.
	await page.waitForTimeout(1_100);
	await page.mouse.up();
	await expect(control).toHaveText("👱 Switch to player", {
		timeout: 3_000,
	});
	await expect(page.locator(".seat-left .bot-overlay")).toBeVisible();
	await expect(page.getByRole("dialog")).toBeHidden();
});
