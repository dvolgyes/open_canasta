import { expect, test } from "@playwright/test";

for (const viewport of [
	{ width: 1280, height: 800 },
	{ width: 390, height: 844 },
	{ width: 320, height: 568 },
	{ width: 844, height: 390 },
]) {
	test(`the creation seats form a readable compass at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/");
		const grid = page.getByTestId("seat-grid");
		await expect(grid).toBeVisible({ timeout: 3_000 });
		for (const [seat, position] of [
			["N", "top"],
			["E", "right"],
			["S", "bottom"],
			["W", "left"],
		] as const) {
			const card = grid.locator(`[data-seat="${seat}"]`);
			await expect(card).toHaveAttribute("data-position", position);
			await expect(card.locator(`input[name="name-${seat}"]`)).toBeVisible();
			await expect(
				card.locator(`input[name="me"][value="${seat}"]`),
			).toBeVisible();
			await expect(card.locator(`input[name="bot-${seat}"]`)).toBeVisible();
		}
		const boxes = await Promise.all(
			["N", "E", "S", "W"].map((seat) =>
				grid.locator(`[data-seat="${seat}"]`).boundingBox(),
			),
		);
		const [north, east, south, west] = boxes;
		if (!north || !east || !south || !west)
			throw new Error("a seat is not visible");
		expect(north.y).toBeLessThan(west.y);
		expect(west.y).toBeLessThan(south.y);
		expect(west.x).toBeLessThan(east.x);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - innerWidth,
			),
		).toBeLessThanOrEqual(0);
	});
}
