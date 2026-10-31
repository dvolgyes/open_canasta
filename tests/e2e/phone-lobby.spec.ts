import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";

test("the phone lobby shows a board and waiting seats before the deal", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 780 });
	await page.goto("/");
	await createTableLink(page);
	const table = page.getByTestId("table");
	await expect(table).toHaveAttribute("data-phase", "waiting");
	await expect(page.getByTestId("table-prompt")).toContainText("to join");
	await expect(table.locator(".seat-bottom .lobby-backs")).toBeVisible();
	await expect(table.locator(".centre")).toBeHidden();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(320);
});
