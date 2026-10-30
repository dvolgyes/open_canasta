import { expect, test } from "@playwright/test";

test("solo and multiplayer setup pages can be opened directly", async ({
	page,
}) => {
	await page.goto("/solo/");
	await expect(page.getByTestId("solo-name")).toBeVisible();
	await expect(page.getByTestId("create-solo")).toBeVisible();
	await expect(page.getByTestId("create")).toBeHidden();
	await expect(page.locator('input[name="openrouter-key"]')).toBeVisible();
	await page.goto("/solo/index.html");
	await expect(page.getByTestId("create-solo")).toBeVisible();
	expect(await page.evaluate(() => new URL(document.baseURI).pathname)).toBe(
		"/",
	);
	await page.goto("/create/");
	await expect(page.getByTestId("solo-name")).toBeHidden();
	await expect(page.getByTestId("create")).toBeVisible();
	await expect(page.getByLabel("South name")).toBeVisible();
});
