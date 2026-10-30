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

test("the solo name and start button share a row on narrow screens", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto("/solo/");
	for (const locale of ["en", "de", "hu", "no", "es", "pt", "fr", "it", "nl"]) {
		await page.evaluate(
			(value) => localStorage.setItem("dvolgyes-open_canasta.locale", value),
			locale,
		);
		await page.reload();
		const input = page.getByTestId("solo-name");
		const start = page.getByTestId("create-solo");
		const labelText = await input.evaluate((node) => {
			const label = node.closest("label");
			const text = label?.firstChild;
			if (!text) throw new Error("missing name label");
			const range = document.createRange();
			range.selectNodeContents(text);
			const rect = range.getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom };
		});
		const [field, button] = await Promise.all([
			input.boundingBox(),
			start.boundingBox(),
		]);
		if (!field || !button) throw new Error("solo controls are missing");
		expect(labelText.bottom).toBeGreaterThan(field.y);
		expect(labelText.top).toBeLessThan(field.y + field.height);
		expect(button.y).toBeLessThan(field.y + field.height);
		expect(button.y + button.height).toBeGreaterThan(field.y);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - innerWidth,
			),
		).toBeLessThanOrEqual(0);
	}
});
