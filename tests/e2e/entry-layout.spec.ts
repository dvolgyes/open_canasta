import { expect, test } from "@playwright/test";
import {
	createTableLink,
	hostRows,
	openDrawer,
	openHostControls,
	ownLink,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("local search settings replace API credentials", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByLabel("Thinking time (seconds)")).toHaveValue("0.25");
	await expect(page.getByLabel("OpenRouter API key")).toHaveCount(0);
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	await openDrawer(page);
	await page.getByRole("button", { name: "Bot settings", exact: true }).click();
	const dialog = page.getByTestId("bot-model-dialog");
	await dialog.getByLabel("Thinking time (seconds)").fill("61");
	await dialog.getByRole("button", { name: "Save", exact: true }).click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"Thinking time must be from 0 to 60 seconds.",
	);
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();
});

test("a new game defaults to a South host", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('input[name="me"][value="S"]')).toBeChecked();
	await page.getByTestId("create").click();
	await expect(page).toHaveTitle(/player2 \(S, host\)$/);
	await page.goto("/?h=W");
	await expect(page.getByLabel("West name")).toHaveValue("player4");
});

test("a creator's edited name is suggested on the next game", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByLabel("South name").fill("  Ce\u0301line  ");
	await page.getByTestId("create").click();
	await expect(page).toHaveTitle(/Céline \(S, host\)$/, { timeout: 3_000 });
	await page.goto("/");
	await expect(page.getByLabel("South name")).toHaveValue("Céline");
	await page.goto("/?s=Booked&h=S");
	await expect(page.getByLabel("South name")).toHaveValue("Booked");
	await page.getByTestId("create").click();
	await page.goto("/");
	await expect(page.getByLabel("South name")).toHaveValue("Céline");
});

test("a direct seat link asks for the player's name", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "direct-name-host");
	const guest = await Player.open(browser, baseURL, "direct-name-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const page = await host.page("/");
		await page.getByLabel("East name").fill("");
		const link = await createTableLink(page);
		const join = await guest.page(ownLink(link, "E"));
		await expect(join.getByTestId("join-player-name")).toBeVisible({
			timeout: 15_000,
		});
		await join.getByTestId("join-player-name").fill("Alice");
		await join.getByRole("button", { name: "Join game", exact: true }).click();
		await expect(join).toHaveTitle(/Alice \(E\)/);
	} finally {
		await guest.close();
		await host.close();
	}
});

test("a guest names a placeholder seat and the host sees the new name", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "name-host");
	const guest = await Player.open(browser, baseURL, "name-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const hostPage = await host.page("/");
		await hostPage.getByLabel("East name").fill("");
		const link = await createTableLink(hostPage);
		const page = await guest.page(link);
		await page.getByTestId("pick-E").click();
		await expect(page.getByTestId("join-player-name")).toBeVisible({
			timeout: 10_000,
		});
		await page.getByTestId("join-player-name").fill("Alice");
		await page.getByRole("button", { name: "Join game", exact: true }).click();
		await expect(page).toHaveTitle(/Alice \(E\)/);
		await expect(hostPage.getByText(/East.*Alice/).first()).toBeAttached();
		await page.reload();
		await expect(page).toHaveTitle(/Alice \(E\)/);
		await page.goto("/");
		await expect(page.getByLabel("South name")).toHaveValue("Alice");
	} finally {
		await host.close();
		await guest.close();
	}
});

test("a personal link to an occupied seat returns to the picker", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "occupied-host");
	const occupant = await Player.open(browser, baseURL, "occupied-owner");
	const visitor = await Player.open(browser, baseURL, "occupied-visitor");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, occupant, visitor])
			await player.installRelay(hub);
		const link = await createTableLink(await host.page("/"));
		const ownerPage = await occupant.page(link);
		await ownerPage.getByTestId("pick-N").click();
		await expect(ownerPage).toHaveTitle(/player1 \(N\)/);
		const page = await visitor.page(ownLink(link, "N"));
		await expect(page.getByTestId("pick-E")).toBeVisible();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("pl"))
			.toBe("none");
	} finally {
		await visitor.close();
		await occupant.close();
		await host.close();
	}
});

test("the host edits a player's name and the guest receives the change", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "rename-host");
	const guest = await Player.open(browser, baseURL, "rename-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const page = await guest.page(link);
		await page.getByTestId("pick-E").click();
		await expect(page).toHaveTitle(/player3 \(E\)/);
		await expect(
			hostPage.locator('li[data-seat="E"][data-state="online"]'),
		).toBeAttached();
		await hostPage.setViewportSize({ width: 1920, height: 1080 });
		const seatName = hostPage.locator(".seat-label .name").first();
		await expect(seatName).toHaveAttribute("role", "button");
		await seatName.focus();
		await seatName.press("Enter");
		await expect(hostPage.getByTestId("player-editor")).toBeVisible();
		await hostPage
			.getByTestId("player-editor")
			.getByRole("button", { name: "Cancel" })
			.click();
		const caption = hostPage.locator(".tile-caption").first();
		await caption.click();
		await expect(hostPage.getByTestId("player-editor")).toBeVisible();
		await hostPage
			.getByTestId("player-editor")
			.getByRole("button", { name: "Cancel" })
			.click();
		await expect(page.locator(".seat-label .name").first()).not.toHaveAttribute(
			"role",
			"button",
		);
		await openHostControls(hostPage);
		await hostPage
			.getByRole("button", { name: "Player names" })
			.click({ timeout: 10_000 });
		await hostPage.getByTestId("rename-E").fill("Alice");
		await hostPage
			.getByTestId("player-editor")
			.getByRole("button", { name: "Save" })
			.click();
		await expect(hostPage.getByTestId("player-editor")).not.toBeVisible({
			timeout: 3_000,
		});
		await expect(hostPage.getByText(/East.*Alice/).first()).toBeAttached({
			timeout: 3_000,
		});
		await expect(page).toHaveTitle(/Alice \(E\)/);
		await hostPage.setViewportSize({ width: 320, height: 568 });
		await expect(
			hostPage.locator(".seat-label .name").first(),
		).not.toHaveAttribute("role", "button");
		await openHostControls(hostPage);
		await hostPage.getByRole("button", { name: "Player names" }).click();
		await expect(
			hostPage
				.getByTestId("player-editor")
				.getByRole("button", { name: "Save" }),
		).toBeVisible();
		expect(
			await hostPage.evaluate(
				() => document.documentElement.scrollWidth - innerWidth,
			),
		).toBeLessThanOrEqual(0);
	} finally {
		await host.close();
		await guest.close();
	}
});

test("a new host retains replicated player names", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "profile-host");
	const east = await Player.open(browser, baseURL, "profile-east");
	const north = await Player.open(browser, baseURL, "profile-north");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, east, north]) await player.installRelay(hub);
		const hostPage = await host.page("/");
		await hostPage.getByLabel("East name").fill("");
		const link = await createTableLink(hostPage);
		const eastPage = await east.page(link);
		await eastPage.getByTestId("pick-E").click();
		await eastPage.getByTestId("join-player-name").fill("Alice");
		await eastPage
			.getByRole("button", { name: "Join game", exact: true })
			.click();
		await expect(eastPage).toHaveTitle(/Alice \(E\)/);
		const northPage = await north.page(link);
		await northPage.getByTestId("pick-N").click();
		await expect(northPage).toHaveTitle(/player1 \(N\)/);
		await expect(northPage.getByText(/East.*Alice/).first()).toBeAttached();
		await expect(
			hostPage.locator('li[data-seat="N"][data-state="online"]'),
		).toBeAttached();
		await host.close();
		const become = northPage.getByTestId("become-host");
		await expect(become).toBeEnabled({ timeout: 45_000 });
		await become.click();
		await expect(hostRows(northPage)).toHaveAttribute("data-seat", "N", {
			timeout: 30_000,
		});
		await expect(hostRows(eastPage)).toHaveAttribute("data-seat", "N", {
			timeout: 30_000,
		});
		await expect(eastPage).toHaveTitle(/Alice \(E\)/);
	} finally {
		await north.close();
		await east.close();
		await host.close();
	}
});

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
			expect(north.width).toBeGreaterThanOrEqual(100);
			expect(south.width).toBeGreaterThanOrEqual(100);
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
