import { expect, type Page, test } from "@playwright/test";
import { BUTTON_MS, HOST_LOST_MS } from "../../src/p2p/limits";
import { freeze } from "./lifecycle";
import {
	CONNECT_MS,
	createTableLink,
	hostRows,
	openDrawer,
	openHostControls,
	ownLink,
	pick,
	takeTurn,
	turnOrder,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

/** Exercises local worker decisions and the existing host/seat recovery contracts. */
test.describe.configure({ mode: "serial" });

for (const layout of ["desktop", "compact"] as const) {
	test(`call controls indicate when only host bots are present (${layout})`, async ({
		page,
		context,
	}) => {
		await page.setViewportSize(
			layout === "compact"
				? { width: 360, height: 800 }
				: { width: 1280, height: 720 },
		);
		await new RelayHub("tracker", buildTrackerUrls()).install(
			context,
			`call-bots-${layout}`,
		);
		await routeBots(page);
		await page.goto("/solo/");
		await page.getByLabel("Your name").fill("Alice");
		await page.getByTestId("create-solo").click();
		const controls =
			layout === "compact"
				? page
						.getByTestId("call-row")
						.getByRole("group", { name: "Table call" })
				: page.getByTestId("call-panel");
		await expect(
			controls.getByRole("button", { name: "Join call" }),
		).toBeDisabled();
		await expect(controls).toHaveCSS("filter", "grayscale(1) brightness(0.6)");
		await expect(controls).toHaveAttribute("data-bots-only", "true");
	});
}

/** Counts actual local search starts; any unexpected API request fails the test. */
async function routeBots(page: Page): Promise<() => number> {
	let searches = 0;
	page.on("worker", () => searches++);
	page.on("request", (request) => {
		expect(request.url()).not.toContain("openrouter.ai");
	});
	return () => searches;
}

const tableState = (page: Page) =>
	page.getByTestId("table").evaluate((element) => ({
		hand: element.getAttribute("data-hand"),
		phase: element.getAttribute("data-phase"),
	}));

test("a solo game starts with the player at South and three local MCTS bots", async ({
	page,
}) => {
	await routeBots(page);
	await page.goto("/solo/");
	await page.getByLabel("Your name").fill("Alice", { timeout: 5_000 });
	await page.getByTestId("create-solo").click({ timeout: 5_000 });
	await expect(page).toHaveTitle(/Alice \(S, host\)/);
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{ timeout: CONNECT_MS },
	);
	await expect(page.locator(".seat .tile-bot-control")).toHaveCount(3);
	await page.reload();
	await expect(page).toHaveTitle(/Alice \(S, host\)/, { timeout: CONNECT_MS });
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{ timeout: CONNECT_MS },
	);
	await page.getByRole("button", { name: "New table", exact: true }).click();
	await expect(page.getByTestId("create")).toBeVisible();
	await expect(page).toHaveURL(/\/create\/$/);
});

test("solo bots have no network measurements before or after reload", async ({
	page,
}) => {
	await routeBots(page);
	await page.goto("/solo/");
	await page.getByLabel("Your name").fill("Alice");
	await page.getByTestId("create-solo").click();
	for (const reload of [false, true]) {
		if (reload) await page.reload();
		await expect(page).toHaveTitle(/Alice \(S, host\)/, {
			timeout: CONNECT_MS,
		});
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-phase",
			"play",
			{ timeout: CONNECT_MS },
		);
		for (const seat of ["N", "E", "S", "W"] as const)
			await expect(page.getByTestId(`network-quality-${seat}`)).toBeHidden();
		await openHostControls(page);
		const matrix = page.getByTestId("quality-matrix");
		await expect(matrix.locator('th[scope="row"] s')).toHaveText([
			"N",
			"E",
			"W",
		]);
		await expect(matrix.locator('th[scope="col"] s')).toHaveText([
			"N",
			"E",
			"W",
		]);
		await expect(matrix.locator("td[data-quality]")).toHaveCount(0);
		await expect(matrix.locator("td")).toHaveText(Array<string>(16).fill(""));
		await page
			.getByTestId("host-controls-dialog")
			.getByRole("button", { name: "Close", exact: true })
			.click();
	}
});

test("an expired solo game can restart from its setup", async ({ page }) => {
	test.setTimeout(120_000);
	await page.clock.setFixedTime(Date.now());
	await routeBots(page);
	await page.goto("/solo/");
	await page.getByLabel("Your name").fill("Alice");
	await page.getByTestId("create-solo").click();
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{ timeout: CONNECT_MS },
	);
	const bookmark = page.url();
	await page.clock.setFixedTime(Date.now() + 9 * 60 * 60 * 1_000);
	await expect(page.getByTestId("banner")).toHaveAttribute(
		"data-kind",
		"expired",
	);
	await page.getByRole("button", { name: "Restart this game" }).click();
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{ timeout: CONNECT_MS },
	);
	await expect(page).toHaveURL(bookmark);
});

test("a fresh browser seeds an abandoned setup with its configured bot seats", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await browser.newContext({ baseURL });
	const newcomer = await browser.newContext({ baseURL });
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await hub.install(creator, "bot-seed-creator");
		await hub.install(newcomer, "bot-seed-newcomer");
		const first = await creator.newPage();
		await routeBots(first);
		await first.goto("/");
		for (const seat of ["N", "E", "S"])
			await first.locator(`input[name="bot-${seat}"]`).check();
		const link = await createTableLink(first);
		await creator.close();
		const page = await newcomer.newPage();
		await routeBots(page);
		await page.goto("/");
		await page.evaluate(() =>
			localStorage.setItem(
				"dvolgyes-open_canasta.openrouter-api-key",
				"test-key",
			),
		);
		await page.goto(ownLink(link, "W"));
		await expect(page).toHaveTitle(/player4 \(W, host\)$/, {
			timeout: 90_000,
		});
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-phase",
			"play",
			{
				timeout: CONNECT_MS,
			},
		);
	} finally {
		await newcomer.close();
		await creator.close();
	}
});

test("bot artwork fills the tile above its readable name", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await routeBots(page);
	await page.goto("/solo/");
	await page.getByTestId("create-solo").click();
	for (const seat of ["N", "E", "W"]) {
		const tile = page.getByTestId(`tile-${seat}`);
		const overlay = tile.locator(".bot-overlay");
		const caption = tile.locator(".tile-caption");
		await expect(overlay).toBeVisible({ timeout: CONNECT_MS });
		const modelArtwork = overlay.locator(".bot-artwork");
		await expect(modelArtwork).toBeVisible();
		await expect
			.poll(() =>
				modelArtwork.evaluate(
					(node) => (node as HTMLImageElement).naturalWidth,
				),
			)
			.toBeGreaterThan(0);
		const [art, name] = await Promise.all([
			overlay.boundingBox(),
			caption.boundingBox(),
		]);
		if (!art || !name) throw new Error("bot tile is not visible");
		expect(art.y + art.height).toBeLessThanOrEqual(name.y + 1);
		expect(
			await overlay.evaluate((node) => getComputedStyle(node).backgroundImage),
		).not.toBe("none");
	}
});

test("a player name containing bot does not reserve a seat for a host bot", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "named-human-host");
	const guest = await Player.open(browser, baseURL, "named-human-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const page = await host.page("/");
		await routeBots(page);
		await page.locator('input[name="name-N"]').fill("Abbot");
		await page.locator('input[name="bot-E"]').check();
		const link = await createTableLink(page);
		const join = await guest.page(link);
		await expect(join.getByTestId("pick-N")).toBeEnabled({
			timeout: CONNECT_MS,
		});
		await join.getByTestId("pick-N").click();
		await expect(join).toHaveTitle(/Abbot \(N\)/);
	} finally {
		await guest.close();
		await host.close();
	}
});

test("the host opens a bot seat for a named human player", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "open-bot-host");
	const guest = await Player.open(browser, baseURL, "open-bot-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await guest.installRelay(hub);
		const page = await host.page("/");
		await routeBots(page);
		await page.locator('input[name="bot-E"]').check();
		const link = await createTableLink(page);
		await openHostControls(page);
		await page.getByRole("button", { name: "Player names" }).click();
		const editor = page.getByTestId("player-editor");
		await editor
			.locator('[data-seat="E"]')
			.getByRole("button", { name: "Open seat for a new player" })
			.click({ timeout: 10_000 });
		await editor.getByRole("button", { name: "Save" }).click();
		await expect(editor).not.toBeVisible();
		const join = await guest.page(link);
		await expect(join.getByTestId("pick-E")).toBeEnabled({
			timeout: CONNECT_MS,
		});
		await join.getByTestId("pick-E").click();
		await expect(join.getByTestId("join-player-name")).toBeVisible({
			timeout: 10_000,
		});
		await join.getByTestId("join-player-name").fill("Alice");
		await join.getByRole("button", { name: "Join game", exact: true }).click();
		await expect(join).toHaveTitle(/Alice \(E\)/);
	} finally {
		await guest.close();
		await host.close();
	}
});

test("the host can save and cancel the bot action pace", async ({
	page,
	context,
}) => {
	await new RelayHub("tracker", buildTrackerUrls()).install(
		context,
		"pace-host",
	);
	const requests = await routeBots(page);
	await page.goto("/");
	await createTableLink(page);
	await openDrawer(page);
	await page.getByRole("button", { name: "Bot settings", exact: true }).click();
	const dialog = page.getByTestId("bot-settings-dialog");
	const delay = dialog.getByLabel("Minimum time per bot action (seconds)");
	await expect(delay).toBeVisible({ timeout: 3_000 });
	await expect(delay).toHaveValue("1");
	await delay.fill("61");
	await dialog.getByRole("button", { name: "Save", exact: true }).click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"Enter a whole number between 1 and 60.",
	);
	await delay.fill("3");
	await dialog.getByRole("button", { name: "Save", exact: true }).click();
	await page.getByRole("button", { name: "Bot settings", exact: true }).click();
	await expect(delay).toHaveValue("3");
	await delay.fill("5");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await page.reload();
	await openDrawer(page);
	await page.getByRole("button", { name: "Bot settings", exact: true }).click();
	await expect(delay).toHaveValue("3");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.getByTestId("create").click();
	await expect.poll(() => requests(), { timeout: 30_000 }).toBeGreaterThan(0);
	await page.waitForTimeout(1_100);
	await expect(page.getByTestId("table")).toHaveAttribute("data-at", "0");
	await expect(page.getByTestId("table")).not.toHaveAttribute("data-at", "0", {
		timeout: 10_000,
	});
});

test("a solo table resumes and its bots play after an offline reload", async ({
	page,
	context,
}) => {
	await context.routeWebSocket("**/*", (socket) => void socket.close());
	const requests = await routeBots(page);
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toHaveAttribute("data-phase", "play");
	await openDrawer(page);
	await page.getByRole("button", { name: "Pause bots" }).click();
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	await page.reload();
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{
			timeout: CONNECT_MS,
		},
	);
	await openDrawer(page);
	const previousRequests = requests();
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect
		.poll(() => requests(), { timeout: 30_000 })
		.toBeGreaterThan(previousRequests);
});

test("host bots continue playing after the game is reset", async ({
	page,
	context,
}) => {
	await context.routeWebSocket("**/*", (socket) => void socket.close());
	const requests = await routeBots(page);
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.getByTestId("create").click();
	await expect.poll(() => requests(), { timeout: 30_000 }).toBeGreaterThan(3);
	await openDrawer(page);
	await page.getByRole("button", { name: "Pause bots" }).click();
	await openHostControls(page);
	await page.getByTestId("reset").click();
	await expect(page.getByTestId("reset-decision")).toBeVisible();
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect(page.getByTestId("reset-decision")).toBeHidden({
		timeout: 30_000,
	});
	const afterReset = requests();
	await expect
		.poll(() => requests(), { timeout: 30_000 })
		.toBeGreaterThan(afterReset + 2);
});

test("a player can stop their autoplay after the host reloads", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "autoplay-host");
	const north = await Player.open(browser, baseURL, "autoplay-north");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await host.installRelay(hub);
		await north.installRelay(hub);
		const hostPage = await host.page("/");
		await routeBots(hostPage);
		const link = await createTableLink(hostPage);
		const northPage = await north.page(link);
		await pick(northPage, "N");
		await host.grantPermissions(["microphone"]);
		await north.grantPermissions(["microphone"]);
		for (const participant of [hostPage, northPage])
			await participant
				.getByTestId("call-panel")
				.getByRole("button", { name: "Join call", exact: true })
				.click();
		await expect(northPage.getByTestId("call-note")).toContainText(
			"Connected to West.",
			{ timeout: CONNECT_MS },
		);
		const toggle = northPage.getByTestId("player-autoplay-toggle");
		await expect(toggle).toBeVisible({ timeout: CONNECT_MS });
		await toggle.click();
		await northPage.getByTestId("autoplay-confirm-enable").click();
		await expect(toggle).toHaveText("Stop autoplay", { timeout: CONNECT_MS });
		await expect
			.poll(() => new URL(hostPage.url()).searchParams.get("autoplay_seats"))
			.toBe("N");
		await hostPage.reload();
		await expect(hostPage).toHaveTitle(/\(W, host\)$/, { timeout: CONNECT_MS });
		await expect(
			hostPage.getByTestId("tile-N").locator(".bot-overlay"),
		).toBeVisible({ timeout: CONNECT_MS });
		await expect(toggle).toHaveText("Stop autoplay", { timeout: CONNECT_MS });
		await expect(
			northPage.getByRole("button", { name: "Leave call", exact: true }),
		).toBeVisible();
		await expect(
			northPage.getByRole("button", { name: "Send mic audio", exact: true }),
		).toHaveAttribute("data-actual", "on");
		await toggle.click();
		await expect(toggle).toHaveText("Enable autoplay (bot)", {
			timeout: CONNECT_MS,
		});
		await expect(
			hostPage.getByTestId("tile-N").locator(".bot-overlay"),
		).toBeHidden();
		await expect(northPage.locator(".player-autoplay-status")).toHaveText(
			"Autoplay stopped.",
		);
		await expect
			.poll(() => new URL(hostPage.url()).searchParams.has("autoplay_seats"))
			.toBe(false);
		await expect(
			northPage.getByRole("button", { name: "Leave call", exact: true }),
		).toBeVisible();
		await toggle.click();
		await northPage.getByTestId("autoplay-confirm-enable").click();
		await expect(toggle).toHaveText("Stop autoplay", { timeout: CONNECT_MS });
		await hostPage
			.getByTestId("tile-N")
			.getByRole("button", { name: "Switch to player" })
			.click();
		await expect(toggle).toHaveText("Enable autoplay (bot)", {
			timeout: CONNECT_MS,
		});
		await expect(northPage.locator(".player-autoplay-status")).toHaveText(
			"Autoplay stopped by the host.",
		);
	} finally {
		await host.close();
		await north.close();
	}
});

test("host bots wait for every seat before dealing the next hand", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const requests = await routeBots(page);
	await page.goto("/");
	for (const [seat, name] of [
		["N", "robot north"],
		["E", "bot east"],
		["S", "robot south"],
		["W", "robot west"],
	] as const) {
		await page.locator(`input[name="name-${seat}"]`).fill(name);
	}
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	const tableUrl = new URL(page.url());
	expect(tableUrl.searchParams.get("b")).toBe("NESW");
	expect([...tableUrl.searchParams.keys()]).not.toEqual(
		expect.arrayContaining([expect.stringMatching(/^bot_/)]),
	);
	// Local bots require no API credentials in the URL or browser storage.
	expect(tableUrl.href).not.toMatch(/api.?key|test-key/i);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBeNull();
	await openDrawer(page);
	await page.getByRole("button", { name: "Pause bots" }).click();
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect(page.getByRole("button", { name: "Pause bots" })).toBeVisible();

	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"hand-over",
		{ timeout: 200_000 },
	);
	const east = page.getByTestId("tile-E").locator(".tile-bot-control");
	await east.click();
	await expect(east).toHaveAttribute("data-bot", "false");
	await expect(page.getByTestId("table-prompt")).toHaveText(
		"Waiting for bot east (E) to come back",
		{ timeout: 20_000 },
	);
	await expect(page.getByTestId("table")).toHaveAttribute("data-hand", "1");
	await east.click();
	await expect
		.poll(() => tableState(page), { timeout: 200_000 })
		.toEqual({ hand: "2", phase: "play" });
	// A hand needs at least a draw and a discard from each seat before anybody can go out.
	expect(requests()).toBeGreaterThan(8);
});

test("paused bots stay paused after the host reloads, and play again only on resume", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const requests = await routeBots(page);
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	await openDrawer(page);
	await page.getByRole("button", { name: "Pause bots" }).click();
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();

	await page.reload();
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{
			timeout: CONNECT_MS,
		},
	);
	await openDrawer(page);
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Pause bots" })).toBeHidden();
	await expect(
		page.getByTestId("tile-E").locator(".bot-overlay"),
	).toBeVisible();
	const pausedAt = await page.getByTestId("table").getAttribute("data-at");
	const pausedRequests = requests();
	// Paused bots must not create search workers.
	await page.waitForTimeout(5_000);
	expect(requests()).toBe(pausedRequests);
	expect(await page.getByTestId("table").getAttribute("data-at")).toBe(
		pausedAt,
	);

	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect(page.getByRole("button", { name: "Pause bots" })).toBeVisible();
	await expect
		.poll(() => requests(), { timeout: 30_000 })
		.toBeGreaterThan(pausedRequests);

	// Bots that played before a reload play after it.
	await page.reload();
	const resumedRequests = requests();
	await expect
		.poll(() => requests(), { timeout: CONNECT_MS })
		.toBeGreaterThan(resumedRequests);
	await openDrawer(page);
	await expect(page.getByRole("button", { name: "Pause bots" })).toBeVisible();
});

test("a previously saved personal link keeps the host's bots paused", async ({
	page,
}) => {
	const requests = await routeBots(page);
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	const earlierLink = page.url();
	await openDrawer(page);
	await page.getByRole("button", { name: "Pause bots" }).click();
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	await page.goto(earlierLink);
	await expect(page.getByTestId("table")).toHaveAttribute(
		"data-phase",
		"play",
		{ timeout: CONNECT_MS },
	);
	await openDrawer(page);
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	const pausedRequests = requests();
	await page.waitForTimeout(5_000);
	expect(requests()).toBe(pausedRequests);
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect
		.poll(() => requests(), { timeout: 30_000 })
		.toBeGreaterThan(pausedRequests);
});

test("a host's paused bots remain paused after host handover and return", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	test.setTimeout(180_000);
	const host = await Player.open(browser, baseURL, "paused-host");
	const east = await Player.open(browser, baseURL, "paused-east");
	const north = await Player.open(browser, baseURL, "paused-north");
	let thaw: (() => Promise<void>) | undefined;
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, east, north]) await player.installRelay(hub);
		const hostPage = await host.page("/");
		await routeBots(hostPage);
		await hostPage.locator('input[name="bot-S"]').check();
		const link = await createTableLink(hostPage);
		const eastPage = await east.page(link);
		await pick(eastPage, "E");
		const northPage = await north.page(link);
		await pick(northPage, "N");
		await expect(hostRows(eastPage)).toHaveAttribute("data-seat", "W", {
			timeout: CONNECT_MS,
		});
		await expect(hostRows(northPage)).toHaveAttribute("data-seat", "W", {
			timeout: CONNECT_MS,
		});
		await openDrawer(hostPage);
		await hostPage.getByRole("button", { name: "Pause bots" }).click();
		await expect(
			hostPage.getByRole("button", { name: "Resume bots" }),
		).toBeVisible();
		thaw = await freeze(hostPage);
		const become = eastPage.getByTestId("become-host");
		await expect(become).toBeEnabled({
			timeout: HOST_LOST_MS + BUTTON_MS + 10_000,
		});
		await become.click();
		await expect(hostRows(northPage)).toHaveAttribute("data-seat", "E", {
			timeout: CONNECT_MS,
		});
		await thaw();
		thaw = undefined;
		await expect(hostRows(hostPage)).toHaveAttribute("data-seat", "W", {
			timeout: CONNECT_MS,
		});
		await expect(hostRows(eastPage)).toHaveAttribute("data-seat", "W", {
			timeout: CONNECT_MS,
		});
		await hostPage.waitForTimeout(3_000);
		await expect(
			hostPage.getByRole("button", { name: "Resume bots" }),
		).toBeVisible();
	} finally {
		if (thaw) await thaw();
		await north.close();
		await east.close();
		await host.close();
	}
});

test("a host-assigned bot ends that player's call and starts its turn", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(180_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "host");
	const north = await Player.open(browser, baseURL, "north");
	const east = await Player.open(browser, baseURL, "east");
	const south = await Player.open(browser, baseURL, "south");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, north, east, south])
			await player.installRelay(hub);
		const hostPage = await host.page("./");
		await routeBots(hostPage);
		const link = await createTableLink(hostPage);
		const northPage = await north.page(link);
		await pick(northPage, "N");
		const southPage = await south.page(link);
		await pick(southPage, "S");
		// East is the last free seat, so its page takes it without a picker.
		const eastPage = await east.page(link);
		const pages = { W: hostPage, N: northPage, E: eastPage, S: southPage };
		for (const page of Object.values(pages))
			await expect(page.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{ timeout: CONNECT_MS },
			);
		// The first dealer is random. The players before East take their turns, so that East has the turn.
		const order = await turnOrder(pages);
		const before = order.indexOf("E");
		for (const [index, seat] of order.slice(0, before).entries())
			await takeTurn(pages[seat], index * 2);
		await expect(eastPage.getByTestId("action-draw")).toBeEnabled({
			timeout: CONNECT_MS,
		});

		await host.grantPermissions(["microphone"]);
		await north.grantPermissions(["microphone"]);
		await hostPage
			.getByTestId("call-panel")
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await northPage
			.getByTestId("call-panel")
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await expect(northPage.getByTestId("call-note")).toContainText(
			"Connected to West.",
			{ timeout: CONNECT_MS },
		);

		await openDrawer(hostPage);
		// The host assigns North to a bot, so North leaves the call and its microphone stops.
		await hostPage
			.getByTestId("tile-N")
			.getByRole("button", { name: /Switch to bot$/ })
			.click();
		await expect(northPage).toHaveTitle(/Open Canasta: bot \(N\)$/);
		await expect(
			northPage.getByRole("button", { name: "Join call", exact: true }),
		).toBeVisible();
		await expect(
			northPage.getByRole("button", { name: "Send mic audio", exact: true }),
		).toHaveAttribute("data-actual", "off");
		await northPage.reload();
		await expect(northPage).toHaveTitle(/Open Canasta: bot \(N\)$/, {
			timeout: CONNECT_MS,
		});
		await hostPage
			.getByTestId("tile-N")
			.getByRole("button", { name: /Switch to player$/ })
			.click();
		await expect(northPage).toHaveTitle(/Open Canasta: player1 \(N\)$/);
		await expect(
			northPage.getByRole("button", { name: "Join call", exact: true }),
		).toBeVisible();
		await northPage.reload();
		await expect(
			northPage.getByRole("button", { name: "Join call", exact: true }),
		).toBeVisible({ timeout: CONNECT_MS });
		await expect(hostPage.getByTestId("all-connected")).toBeVisible({
			timeout: CONNECT_MS,
		});

		// East has the turn: as a bot it draws and discards without a click, so the table moves past its turn.
		await hostPage
			.getByTestId("tile-E")
			.getByRole("button", { name: /Switch to bot$/ })
			.click();
		await expect
			.poll(
				async () =>
					Number(await hostPage.getByTestId("table").getAttribute("data-at")),
				{ timeout: 30_000 },
			)
			.toBeGreaterThanOrEqual(before * 2 + 2);
		expect(new URL(hostPage.url()).searchParams.get("b")).toBe("E");
		await expect(
			hostPage.getByTestId("tile-E").locator(".bot-overlay"),
		).toBeVisible();
		// South plays next, as a person.
		await expect(southPage.getByTestId("action-draw")).toBeEnabled({
			timeout: 30_000,
		});

		// The bot seat survives the host's reload: the seat list is in the host's URL.
		await hostPage.reload();
		await expect(
			hostPage.getByTestId("tile-E").locator(".bot-overlay"),
		).toBeVisible({ timeout: CONNECT_MS });
	} finally {
		for (const player of [host, north, east, south]) await player.close();
	}
});

test("local thinking time persists without API credentials or account controls", async ({
	page,
}) => {
	await routeBots(page);
	await page.goto(
		"/solo/?bot_model=openai%2Fgpt-6-luna&bot_fallback=inception%2Fmercury-3&bot_retries=2&bot_delay_ms=5000",
	);
	await expect(page.locator('input[name="openrouter-key"]')).toHaveCount(0);
	await page.getByLabel("Thinking time (seconds)").fill("0.5");
	await page.getByTestId("create-solo").click();
	await expect(page.getByTestId("table")).toBeVisible();
	expect([...new URL(page.url()).searchParams.keys()]).not.toEqual(
		expect.arrayContaining([expect.stringMatching(/^bot_/)]),
	);
	await openDrawer(page);
	await expect(
		page.getByRole("button", { name: "Set API key", exact: true }),
	).toHaveCount(0);
	await expect(page.getByTestId("bot-balance")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: /API|model|balance|credits/i }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Bot settings", exact: true }).click();
	const dialog = page.getByTestId("bot-settings-dialog");
	await expect(dialog.getByRole("combobox")).toHaveCount(0);
	await expect(dialog.getByLabel("Thinking time (seconds)")).toHaveValue("0.5");
	await dialog.getByLabel("Thinking time (seconds)").fill("1");
	await dialog.getByRole("button", { name: "Save", exact: true }).click();
	const legacyLink = new URL(page.url());
	legacyLink.searchParams.set("bot_model", "openai/gpt-6-luna");
	legacyLink.searchParams.set("bot_fallback", "inception/mercury-3");
	legacyLink.searchParams.set("bot_retries", "2");
	legacyLink.searchParams.set("bot_delay_ms", "5000");
	await page.goto(legacyLink.toString());
	await expect
		.poll(() =>
			[...new URL(page.url()).searchParams.keys()].filter((name) =>
				name.startsWith("bot_"),
			),
		)
		.toEqual([]);
	await openDrawer(page);
	await page.getByRole("button", { name: "Bot settings", exact: true }).click();
	await expect(dialog.getByLabel("Thinking time (seconds)")).toHaveValue("1");
});

test("on a phone, the host manages other players from Host controls", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "phone-host", {
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		const page = await host.page("./");
		await routeBots(page);
		for (const seat of ["N", "E", "S"])
			await page.locator(`input[name="bot-${seat}"]`).check();
		await createTableLink(page);
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-phase",
			"play",
			{ timeout: CONNECT_MS },
		);
		await page.setViewportSize({ width: 320, height: 568 });
		await expect(
			page.locator(".seat .tile-bot-control").filter({ visible: true }),
		).toHaveCount(0, { timeout: 3_000 });
		await openHostControls(page);
		const players = page.getByTestId("host-players");
		await expect(players).toBeVisible();
		await expect(players).toContainText("Connected:");
		for (const seat of ["N", "E", "S"]) {
			await expect(players.getByTestId(`host-player-${seat}`)).toContainText(
				"Switch to player",
			);
		}
		await players
			.getByTestId("host-player-N")
			.getByRole("button", { name: /Switch to player/ })
			.click();
		await expect(players.getByTestId("host-player-N")).toContainText(
			"Switch to bot",
		);
		await page
			.getByTestId("host-controls-dialog")
			.getByRole("button", { name: "Close" })
			.click();
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(
			page.locator(".seat .tile-bot-control").filter({ visible: true }),
		).toHaveCount(3);
		await page.setViewportSize({ width: 320, height: 568 });
		await expect(
			page.locator(".seat .tile-bot-control").filter({ visible: true }),
		).toHaveCount(0);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth,
			),
			"sideways page scroll",
		).toBeLessThanOrEqual(0);
	} finally {
		await host.close();
	}
});
