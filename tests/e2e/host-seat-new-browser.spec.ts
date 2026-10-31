import { errors, expect, type Page, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	ownLink,
	pick,
	takeTurn,
	turnOrder,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("a shared link asks before reopening a seat remembered by this browser", async ({
	page,
	context,
}) => {
	const hub = new RelayHub("tracker", buildTrackerUrls());
	await hub.install(context, "remembered-browser");
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto("/");
	await createTableLink(page);
	await page
		.getByRole("button", { name: "Send link to players", exact: true })
		.click();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(new URL(link).searchParams.get("pl")).toBe("none");
	await page.close();
	const reopened = await context.newPage();
	await reopened.goto(link);
	await expect(reopened.getByTestId("pick-W")).toBeVisible({
		timeout: CONNECT_MS,
	});
	await reopened.getByTestId("pick-W").click();
	await expect(reopened).toHaveTitle(/player4 \(W(?:, host)?\)$/, {
		timeout: CONNECT_MS,
	});
});

test("a shared link does not take a remembered seat held by another tab", async ({
	page,
	context,
}) => {
	const hub = new RelayHub("tracker", buildTrackerUrls());
	await hub.install(context, "same-browser");
	await page.goto("/");
	const link = await createTableLink(page);
	const other = await context.newPage();
	await other.goto(link);
	await expect(other.getByTestId("pick-N")).toBeVisible({
		timeout: CONNECT_MS,
	});
	await expect(other.getByTestId("network")).toHaveAttribute("open", "");
	await expect(page.getByTestId("network")).not.toHaveAttribute("open", "");
	await expect(page).toHaveTitle(/player4 \(W, host\)$/);
	await expect(other).not.toHaveTitle(/player4 \(W/);
});

test("a player's own link reopens its seat", async ({ page, context }) => {
	const hub = new RelayHub("tracker", buildTrackerUrls());
	await hub.install(context, "no-seat-browser");
	await page.goto("/");
	const link = ownLink(await createTableLink(page), "W");
	await page.close();
	const reopened = await context.newPage();
	await reopened.goto(link);
	await expect(reopened).toHaveTitle(/player4 \(W(?:, host)?\)$/, {
		timeout: CONNECT_MS,
	});
});

test("an explicit seat takes priority over the remembered seat", async ({
	page,
	context,
}) => {
	const hub = new RelayHub("tracker", buildTrackerUrls());
	await hub.install(context, "explicit-seat-browser");
	await page.goto("/");
	const link = await createTableLink(page);
	const other = await context.newPage();
	await other.goto(ownLink(link, "N"));
	await expect(other).toHaveTitle(/player1 \(N(?:, host)?\)$/, {
		timeout: CONNECT_MS,
	});
	await expect(page).toHaveTitle(/player4 \(W, host\)$/);
});

test("a non-host seat can start an abandoned shared setup", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await Player.open(browser, baseURL, "abandoned-creator");
	const newcomer = await Player.open(browser, baseURL, "abandoned-newcomer");
	try {
		const link = await createTableLink(await creator.page("/"));
		await creator.close();
		const page = await newcomer.page(ownLink(link, "N"));
		await expect(page).toHaveTitle(/Open Canasta: player1 \(N, host\)$/, {
			timeout: 90_000,
		});
		await expect(page.getByTestId("table")).toBeAttached();
	} finally {
		await newcomer.close();
		await creator.close();
	}
});

test("a player keeps their entered name when seeding an abandoned setup", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await Player.open(browser, baseURL, "named-seed-creator");
	const newcomer = await Player.open(browser, baseURL, "named-seed-newcomer");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await creator.installRelay(hub);
		await newcomer.installRelay(hub);
		const first = await creator.page("/");
		await first.locator('input[name="name-N"]').fill("");
		const link = await createTableLink(first);
		await creator.close();
		const page = await newcomer.page(link);
		await expect(page.getByTestId("pick-N")).toBeEnabled({
			timeout: CONNECT_MS,
		});
		await page.getByTestId("pick-N").click();
		await page.getByTestId("join-player-name").fill("Alice");
		await page.getByRole("button", { name: "Join game", exact: true }).click();
		await expect(page).toHaveTitle(/Alice \(N, host\)$/, { timeout: 90_000 });
		await page.reload();
		await expect(page).toHaveTitle(/Alice \(N(?:, host)?\)$/, {
			timeout: CONNECT_MS,
		});
	} finally {
		await newcomer.close();
		await creator.close();
	}
});

test("two new seats agree which one seeds an abandoned setup", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await Player.open(browser, baseURL, "seed-creator");
	const north = await Player.open(browser, baseURL, "seed-north");
	const east = await Player.open(browser, baseURL, "seed-east");
	try {
		const link = await createTableLink(await creator.page("/"));
		await creator.close();
		const northPage = await north.page(ownLink(link, "N"));
		const eastPage = await east.page(ownLink(link, "E"));
		for (const page of [northPage, eastPage])
			await expect(
				page
					.getByTestId("network")
					.locator("dt", { hasText: "Direct connections" })
					.locator("+ dd"),
			).toHaveText("1", { timeout: CONNECT_MS });
		await expect(northPage).toHaveTitle(/Open Canasta: player1 \(N, host\)$/, {
			timeout: 90_000,
		});
		for (const page of [northPage, eastPage])
			await expect(
				page
					.getByTestId("roster")
					.locator('li[data-seat="N"] .tag', { hasText: "Host" }),
			).toHaveCount(1, { timeout: CONNECT_MS });
	} finally {
		await east.close();
		await north.close();
		await creator.close();
	}
});

test("a new browser taking the departed host seat joins the existing game", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(300_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await Player.open(browser, baseURL, "creator");
	const hub = new RelayHub("tracker", buildTrackerUrls());
	const others: Player[] = [];
	try {
		await creator.installRelay(hub);
		const host = await creator.page("/");
		const link = await createTableLink(host);
		const pages = {} as Record<"N" | "E" | "S" | "W", Page>;
		pages.W = host;
		for (const seat of ["N", "E", "S"] as const) {
			const player = await Player.open(browser, baseURL, `player-${seat}`);
			others.push(player);
			await player.installRelay(hub);
			const page = await player.page(link);
			try {
				await pick(page, seat);
			} catch (error) {
				const observed = await Promise.all(
					[...Object.values(pages), page].map(async (current) => ({
						title: await current.title(),
						table: await current.getByTestId("table").evaluateAll((tables) =>
							tables.map((table) => ({
								phase: table.getAttribute("data-phase"),
								at: table.getAttribute("data-at"),
							})),
						),
						picks: await current
							.locator('[data-testid^="pick-"]')
							.evaluateAll((buttons) =>
								buttons.map((button) => ({
									seat: button.getAttribute("data-testid"),
									text: button.textContent,
									disabled: (button as HTMLButtonElement).disabled,
								})),
							),
					})),
				);
				await test.info().attach("seat-setup-state", {
					body: JSON.stringify({ requestedSeat: seat, observed }),
					contentType: "application/json",
				});
				throw error;
			}
			pages[seat] = page;
		}
		for (const page of Object.values(pages))
			await expect(page.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{ timeout: CONNECT_MS },
			);
		const [first] = await turnOrder(pages);
		if (!first) throw new Error("no player can act");
		await takeTurn(pages[first], 0);
		await creator.close();
		const newcomer = await Player.open(browser, baseURL, "newcomer");
		others.push(newcomer);
		await newcomer.installRelay(hub);
		const page = await newcomer.page(ownLink(link, "W"));
		const retry = page.getByTestId("pick-W");
		const recoveryState = () =>
			page.evaluate(() => {
				const tables = document.querySelectorAll('[data-testid="table"]');
				if (tables.length > 1) throw new Error("multiple table views");
				if (tables[0]?.getAttribute("data-at") === "2") return "ready";
				const choices = document.querySelectorAll(
					'[data-testid^="pick-"]:enabled',
				);
				return choices.length === 1 &&
					choices[0]?.getAttribute("data-testid") === "pick-W"
					? "retry"
					: "waiting";
			});
		try {
			await expect.poll(recoveryState, { timeout: 90_000 }).not.toBe("waiting");
			let clicked = false;
			await expect
				.poll(
					async () => {
						const state = await recoveryState();
						if (state === "ready") return true;
						if (state !== "retry" || clicked) return false;
						try {
							await retry.click({ timeout: 1_000 });
							clicked = true;
						} catch (error) {
							if (!(error instanceof errors.TimeoutError)) throw error;
						}
						return false;
					},
					{ timeout: 90_000 },
				)
				.toBe(true);
		} catch (error) {
			const newcomerState = {
				title: await page.title(),
				tables: await page.getByTestId("table").evaluateAll((tables) =>
					tables.map((table) => ({
						phase: table.getAttribute("data-phase"),
						at: table.getAttribute("data-at"),
					})),
				),
			};
			const picker = await page
				.locator('[data-testid^="pick-"]')
				.evaluateAll((buttons) =>
					buttons.map((button) => ({
						seat: button.getAttribute("data-testid"),
						text: button.textContent,
						disabled: (button as HTMLButtonElement).disabled,
					})),
				);
			const players = await Promise.all(
				(["N", "E", "S"] as const).map(async (seat) => ({
					seat,
					title: await pages[seat].title(),
					at: await pages[seat].evaluate(() =>
						document
							.querySelector('[data-testid="table"]')
							?.getAttribute("data-at"),
					),
				})),
			);
			await test.info().attach("seat-recovery-state", {
				body: JSON.stringify({ newcomer: newcomerState, picker, players }),
				contentType: "application/json",
			});
			throw error;
		}
		await expect(page.getByTestId("table")).toHaveAttribute("data-at", "2", {
			timeout: 90_000,
		});
		for (const seat of ["N", "E", "S"] as const)
			await expect(pages[seat].getByTestId("table")).toHaveAttribute(
				"data-at",
				"2",
			);
	} finally {
		for (const player of others) await player.close();
		await creator.close();
	}
});
