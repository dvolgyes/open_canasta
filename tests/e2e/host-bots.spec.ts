import { expect, type Page, type Request, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	openDrawer,
	pick,
	takeTurn,
	turnOrder,
} from "./pages";
import { Player } from "./player";

/**
 * The host page's bot seats. OpenRouter is replaced by a route on the host page that always answers option 0, the
 * best action of the heuristic ranking (src/bot/strategy.ts), so no request leaves the machine and no key is spent.
 * The live model is tested separately (docs/test-results-canasta.md, live runs).
 */
test.describe.configure({ mode: "serial" });

const RESPONSES = "https://openrouter.ai/api/v1/responses";

/** Answers every bot request on this page with `{"choice": 0}`. Returns the count of the requests so far. */
async function routeBots(page: Page): Promise<() => number> {
	let requests = 0;
	await page.route(RESPONSES, async (route) => {
		if (route.request().method() === "OPTIONS") {
			await route.fulfill({
				status: 204,
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "POST, OPTIONS",
					"access-control-allow-headers": "authorization,content-type",
				},
			});
			return;
		}
		requests++;
		const body = route.request().postDataJSON();
		expect(body.text.format.name).toBe("canasta_choice");
		await route.fulfill({
			status: 200,
			headers: { "access-control-allow-origin": "*" },
			contentType: "application/json",
			body: JSON.stringify({
				output: [
					{
						type: "message",
						role: "assistant",
						content: [
							{ type: "output_text", text: JSON.stringify({ choice: 0 }) },
						],
					},
				],
			}),
		});
	});
	return () => requests;
}

/** The request that tests a new key before the page saves it (`checkHostApiKey` in src/bot/browser-openrouter.ts). */
const isKeyTest = (request: Request): boolean =>
	(request.postData() ?? "").includes("tests an OpenRouter API key");

/**
 * Answers the key tests on this page with HTTP `status()`; a 200 goes on to the earlier `routeBots` route. Returns the
 * authorization headers of the key tests so far.
 */
async function routeKeyTests(
	page: Page,
	status: () => number | Promise<number>,
): Promise<string[]> {
	const keys: string[] = [];
	await page.route(RESPONSES, async (route) => {
		const request = route.request();
		if (request.method() !== "POST" || !isKeyTest(request)) {
			await route.fallback();
			return;
		}
		keys.push(request.headers().authorization ?? "");
		const code = await status();
		if (code === 200) await route.fallback();
		else
			await route.fulfill({
				status: code,
				headers: { "access-control-allow-origin": "*" },
			});
	});
	return keys;
}

const tableState = (page: Page) =>
	page.getByTestId("table").evaluate((element) => ({
		hand: element.getAttribute("data-hand"),
		phase: element.getAttribute("data-phase"),
	}));

test("host bots play a whole hand, and the host deals the next one", async ({
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
	await page.locator('input[name="openrouter-key"]').fill("test-key");
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	const tableUrl = new URL(page.url());
	expect(tableUrl.searchParams.get("bot_seats")).toBe("N,E,S,W");
	expect(tableUrl.searchParams.get("bot_model")).toBe("inception/mercury-3");
	expect(tableUrl.searchParams.get("bot_fallback")).toBe("openai/gpt-6-luna");
	expect(tableUrl.searchParams.get("bot_retries")).toBe("5");
	expect(tableUrl.searchParams.get("bot_delay_ms")).toBe("3000");
	// The key stays in this browser: never in the URL that the players share.
	expect(tableUrl.href).not.toMatch(/api.?key|test-key/i);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBe("test-key");
	await openDrawer(page);
	await page.getByRole("button", { name: "Pause bots" }).click();
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect(page.getByRole("button", { name: "Pause bots" })).toBeVisible();

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
	await page.locator('input[name="openrouter-key"]').fill("test-key");
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
	// A started bot asks OpenRouter within a second; a paused one never does.
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

test("switching the player whose turn it is to a bot starts it at once; the call goes on", async ({
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
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await northPage
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await expect(northPage.getByTestId("call-note")).toContainText(
			"Connected to West.",
			{ timeout: CONNECT_MS },
		);

		await openDrawer(hostPage);
		await hostPage.getByRole("button", { name: "Set API key" }).click();
		await hostPage
			.getByTestId("api-key-dialog")
			.getByRole("textbox", { name: "OpenRouter API key" })
			.fill("test-key");
		await hostPage.getByRole("button", { name: "Save key" }).click();

		// A bot seat keeps the person's call: North still sends audio while its seat plays as a bot.
		await hostPage
			.getByTestId("tile-N")
			.getByRole("button", { name: /Switch to bot$/ })
			.click();
		await expect(
			northPage.getByRole("button", { name: "Leave call", exact: true }),
		).toBeVisible();
		await expect(
			northPage.getByRole("button", { name: "Send mic audio", exact: true }),
		).toHaveAttribute("data-actual", "on");
		await hostPage
			.getByTestId("tile-N")
			.getByRole("button", { name: /Switch to player$/ })
			.click();

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
		expect(new URL(hostPage.url()).searchParams.get("bot_seats")).toBe("E");
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

test("a key entered without bot seats is kept for the table and for the next table; an empty field removes it", async ({
	page,
	context,
}) => {
	await routeBots(page);
	await page.goto("/");
	await page.locator('input[name="me"][value="W"]').check();
	await page.locator('input[name="openrouter-key"]').fill("test-key");
	await createTableLink(page);

	// The table's key dialog shows the stored key, so autoplay and bot seats can use it.
	await openDrawer(page);
	await page.getByRole("button", { name: "Set API key", exact: true }).click();
	const keyDialog = page.getByTestId("api-key-dialog");
	await expect(keyDialog.getByLabel("OpenRouter API key")).toHaveValue(
		"test-key",
	);
	await keyDialog.getByRole("button", { name: "Cancel" }).click();
	await expect(keyDialog).toBeHidden();

	const next = await context.newPage();
	await next.goto("/");
	const nextKey = next.locator('input[name="openrouter-key"]');
	await expect(nextKey).toHaveValue("test-key");

	// An empty field removes the stored key.
	await nextKey.fill("");
	await createTableLink(next);
	const last = await context.newPage();
	await last.goto("/");
	await expect(last.locator('input[name="openrouter-key"]')).toHaveValue("");
});

test("a key changed in the table's key dialog is used by the running bots and kept for the next table", async ({
	page,
	context,
}) => {
	test.setTimeout(120_000);
	await routeBots(page);
	const keys: (string | undefined)[] = [];
	// The bots' requests only: the key test of the new key is sent before the save.
	page.on("request", (request) => {
		if (
			request.url() === RESPONSES &&
			request.method() === "POST" &&
			!isKeyTest(request)
		)
			keys.push(request.headers().authorization);
	});
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.locator('input[name="openrouter-key"]').fill("first-key");
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	await expect
		.poll(() => keys.includes("Bearer first-key"), { timeout: CONNECT_MS })
		.toBe(true);

	await openDrawer(page);
	await page.getByRole("button", { name: "Set API key", exact: true }).click();
	const keyDialog = page.getByTestId("api-key-dialog");
	await expect(keyDialog.getByLabel("OpenRouter API key")).toHaveValue(
		"first-key",
	);
	await keyDialog.getByLabel("OpenRouter API key").fill("second-key");
	await keyDialog.getByRole("button", { name: "Save key" }).click();
	await expect(keyDialog).toBeHidden();

	await expect
		.poll(() => keys.includes("Bearer second-key"), { timeout: 30_000 })
		.toBe(true);
	// A request that started before the save can still finish; no request starts with the old key after the first new one.
	const firstNew = keys.indexOf("Bearer second-key");
	await expect
		.poll(() => keys.length, { timeout: 30_000 })
		.toBeGreaterThan(firstNew + 2);
	expect(keys.slice(firstNew)).not.toContain("Bearer first-key");

	const next = await context.newPage();
	await next.goto("/");
	await expect(next.locator('input[name="openrouter-key"]')).toHaveValue(
		"second-key",
	);
});

test("the create screen tests a new key with one model request and refuses a key that OpenRouter rejects", async ({
	page,
}) => {
	await routeBots(page);
	let status = 401;
	const tested = await routeKeyTests(page, () => status);
	await page.goto("/");
	const field = page.locator('input[name="openrouter-key"]');
	await field.fill("wrong-key");
	await page.getByTestId("create").click();
	await expect(page.getByTestId("errors")).toHaveText(
		"OpenRouter rejected this API key (401). The key was not saved.",
	);
	await expect(page.getByTestId("table")).toBeHidden();
	expect(tested).toEqual(["Bearer wrong-key"]);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBeNull();

	// A key that the test cannot confirm is saved, and the page says so; the next Create goes on without a test.
	status = 503;
	await field.fill("unsure-key");
	await page.getByTestId("create").click();
	await expect(page.getByTestId("errors")).toContainText(
		"The key is saved, but the test request to OpenRouter got no usable answer: HTTP 503.",
	);
	await expect(page.getByTestId("table")).toBeHidden();
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	expect(tested).toEqual(["Bearer wrong-key", "Bearer unsure-key"]);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBe("unsure-key");
});

test("the table's key dialog tests a new key, refuses a rejected one, and an empty key pauses the bots", async ({
	page,
}) => {
	test.setTimeout(120_000);
	const requests = await routeBots(page);
	let status = 200;
	let hold = Promise.resolve();
	const tested = await routeKeyTests(page, async () => {
		await hold;
		return status;
	});
	await page.goto("/");
	for (const seat of ["N", "E", "S", "W"])
		await page.locator(`input[name="bot-${seat}"]`).check();
	await page.locator('input[name="openrouter-key"]').fill("first-key");
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	expect(tested).toEqual(["Bearer first-key"]);
	await expect
		.poll(() => requests(), { timeout: CONNECT_MS })
		.toBeGreaterThan(1);

	await openDrawer(page);
	const keyDialog = page.getByTestId("api-key-dialog");
	const field = keyDialog.getByLabel("OpenRouter API key");
	await page.getByRole("button", { name: "Set API key", exact: true }).click();
	status = 401;
	await field.fill("wrong-key");
	await keyDialog.getByRole("button", { name: "Save key" }).click();
	await expect(keyDialog.getByTestId("api-key-note")).toHaveText(
		"OpenRouter rejected this API key (401). The key was not saved.",
	);
	await expect(keyDialog).toBeVisible();
	expect(tested).toEqual(["Bearer first-key", "Bearer wrong-key"]);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBe("first-key");

	// Whitespace only: no test, the key is removed, and the bots pause until a key is set.
	await field.fill("   ");
	await keyDialog.getByRole("button", { name: "Save key" }).click();
	await expect(keyDialog).toBeHidden();
	expect(tested).toHaveLength(2);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBeNull();
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();
	const pausedAt = requests();
	await page.waitForTimeout(3_000);
	expect(requests()).toBe(pausedAt);

	// Resume without a key asks for one; Cancel during the test discards the key, although the test passes later.
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect(keyDialog).toBeVisible();
	status = 200;
	let release = (): void => {};
	hold = new Promise((resolve) => {
		release = resolve;
	});
	await field.fill("cancelled-key");
	await keyDialog.getByRole("button", { name: "Save key" }).click();
	await expect(keyDialog.getByTestId("api-key-note")).toHaveText(
		"Testing the OpenRouter API key…",
	);
	await keyDialog.getByRole("button", { name: "Cancel" }).click();
	await expect(keyDialog).toBeHidden();
	release();
	await expect.poll(() => tested.length).toBe(3);
	await page.waitForTimeout(1_000);
	expect(
		await page.evaluate(() =>
			localStorage.getItem("dvolgyes-open_canasta.openrouter-api-key"),
		),
	).toBeNull();
	// The one new request is the cancelled key's test: routeBots answers it, so it counts it too.
	expect(requests()).toBe(pausedAt + 1);
	await expect(page.getByRole("button", { name: "Resume bots" })).toBeVisible();

	// A key that passes the test resumes the bots.
	await page.getByRole("button", { name: "Resume bots" }).click();
	await expect(keyDialog).toBeVisible();
	await field.fill("second-key");
	await keyDialog.getByRole("button", { name: "Save key" }).click();
	await expect(keyDialog).toBeHidden();
	expect(tested).toEqual([
		"Bearer first-key",
		"Bearer wrong-key",
		"Bearer cancelled-key",
		"Bearer second-key",
	]);
	await expect
		.poll(() => requests(), { timeout: 30_000 })
		.toBeGreaterThan(pausedAt + 2);
	await expect(page.getByRole("button", { name: "Pause bots" })).toBeVisible();
});
