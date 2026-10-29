import { expect, test } from "@playwright/test";

test("the create page requests a screen wake lock", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: {
				request: async () => {
					document.documentElement.dataset.wakeRequested = "yes";
					return { released: false, release: async () => {} };
				},
			},
		});
	});
	await page.goto("/");
	await expect(page.getByTestId("create")).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute(
		"data-wake-requested",
		"yes",
	);
});
