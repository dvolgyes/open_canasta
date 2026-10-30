import { expect, test } from "@playwright/test";
import { counts, installCallProbe } from "./call-probe";
import { createTableLink } from "./pages";
import { Player } from "./player";

test("phone landscape view can be previewed, canceled, and saved without starting media", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL missing");
	const player = await Player.open(browser, baseURL, "orientation-phone", {
		viewport: { width: 844, height: 390 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		await player.addInitScript(installCallProbe);
		const page = await player.page("/");
		await createTableLink(page);
		const table = page.getByTestId("table");
		await expect(table).toHaveAttribute("data-form", "compact");
		const button = page.getByRole("button", { name: "Appearance settings" });
		const dialog = page.getByRole("dialog", { name: "Appearance settings" });
		const choice = dialog.getByLabel(
			"On a phone or tablet in landscape, show the desktop view",
		);
		await button.click();
		await choice.check();
		await expect(table).toHaveAttribute("data-form", "desktop");
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(844);
		expect((await counts(page)).captures).toBe(0);
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await expect(table).toHaveAttribute("data-form", "compact");
		await button.click();
		await choice.check();
		await dialog.getByRole("button", { name: "Save" }).click();
		expect((await counts(page)).captures).toBe(0);
		await page.reload();
		await expect(table).toHaveAttribute("data-form", "desktop");
		expect((await counts(page)).captures).toBe(0);
		expect(player.errors).toEqual([]);
	} finally {
		await player.close();
	}
});
