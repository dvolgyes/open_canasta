import { expect, type Page, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	ownLink,
	pick,
	takeTurn,
	turnOrder,
} from "./pages";
import { Player } from "./player";

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
	const others: Player[] = [];
	try {
		const host = await creator.page("/");
		const link = await createTableLink(host);
		const pages = {} as Record<"N" | "E" | "S" | "W", Page>;
		pages.W = host;
		for (const seat of ["N", "E", "S"] as const) {
			const player = await Player.open(browser, baseURL, `player-${seat}`);
			others.push(player);
			const page = await player.page(link);
			await pick(page, seat);
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
		const page = await newcomer.page(ownLink(link, "W"));
		const retry = page.getByTestId("pick-W");
		await expect
			.poll(
				async () => {
					const table = page.getByTestId("table");
					if (
						(await table.count()) > 0 &&
						(await table.getAttribute("data-at")) === "2"
					)
						return "ready";
					if (
						(await retry.isVisible()) &&
						(await page.locator('[data-testid^="pick-"]').count()) === 1
					)
						return "retry";
					return "waiting";
				},
				{ timeout: 90_000 },
			)
			.not.toBe("waiting");
		if (await retry.isVisible()) await retry.click({ timeout: 5_000 });
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
