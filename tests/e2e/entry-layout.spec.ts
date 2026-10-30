import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

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

test("the seat picker shows the host and all available seats on a compass", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "grid-host");
	const guest = await Player.open(browser, baseURL, "grid-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const link = await createTableLink(await host.page("/"));
		const page = await guest.page(link);
		const grid = page.getByTestId("seat-grid");
		await expect(grid).toBeVisible({ timeout: 10_000 });
		await expect(grid.locator(".seat-card")).toHaveCount(4);
		await expect(page.getByTestId("pick-W")).toBeDisabled();
		await expect(page.getByTestId("pick-W")).toContainText("(host)");
		expect(
			await page
				.getByTestId("pick-W")
				.evaluate((element) => getComputedStyle(element).opacity),
		).toBe("1");
		for (const seat of ["N", "E", "S"])
			await expect(page.getByTestId(`pick-${seat}`)).toBeEnabled();
		for (const size of [
			{ width: 390, height: 844 },
			{ width: 320, height: 568 },
			{ width: 844, height: 390 },
		]) {
			await page.setViewportSize(size);
			const [north, east, south, west] = await Promise.all(
				["N", "E", "S", "W"].map((seat) =>
					page.getByTestId(`pick-${seat}`).boundingBox(),
				),
			);
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
		}
	} finally {
		await guest.close();
		await host.close();
	}
});
