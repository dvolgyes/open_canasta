import { expect, test } from "@playwright/test";
import { CONNECT_MS, createTableLink, pick } from "./pages";
import { Player } from "./player";

test("modern setup fits a narrow phone", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 780 });
	await page.goto("/solo/");
	await page.getByTestId("rules").selectOption("modern");
	await expect(page.getByText(/sevens must be natural/i)).toBeVisible();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(320);
});

test("modern solo setup explains sevens and local bots play", async ({
	page,
}) => {
	await page.goto("/solo/");
	const rules = page.getByTestId("rules");
	await expect(
		page.getByRole("group", { name: "Game settings" }).getByTestId("rules"),
	).toBeVisible();
	await expect(rules.locator("option")).toHaveCount(2);
	await rules.selectOption("modern");
	await expect(page.getByText(/sevens must be natural/i)).toBeVisible();
	await page.getByLabel("Your name").fill("Alice");
	await page.getByTestId("create-solo").click();
	const table = page.getByTestId("table");
	await expect(table).toHaveAttribute("data-phase", "play", {
		timeout: CONNECT_MS,
	});
	await expect(page.getByTestId("table-rules")).toHaveText("Modern rules");
	await expect(page.locator(".seat .tile-bot-control")).toHaveCount(3);
	await expect(page.getByTestId("action-draw")).toBeVisible({
		timeout: CONNECT_MS,
	});
	const beforeDraw = Number(await table.getAttribute("data-at"));
	await page.getByTestId("action-draw").click();
	await expect(table).toHaveAttribute("data-at", String(beforeDraw + 1));
	const cards = page.locator(".own-hand button.card");
	let discarded = false;
	for (let i = 0; i < (await cards.count()); i++) {
		await cards.nth(i).click();
		if (await page.getByTestId("action-discard").isVisible()) {
			await page.getByTestId("action-discard").click();
			discarded = true;
			break;
		}
		await cards.nth(i).click();
	}
	expect(discarded).toBe(true);
	await expect
		.poll(async () => Number(await table.getAttribute("data-at")), {
			timeout: CONNECT_MS,
		})
		.toBeGreaterThan(beforeDraw + 1);
	await page.reload();
	await expect(table).toHaveAttribute("data-phase", "play", {
		timeout: CONNECT_MS,
	});
	await expect(page.getByTestId("table-rules")).toHaveText("Modern rules");
});

test("modern multiplayer tables share a human draw", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("missing base URL");
	const player = await Player.open(browser, baseURL, "modern");
	try {
		const host = await player.page("./");
		await host.getByTestId("rules").selectOption("modern");
		const link = await createTableLink(host);
		expect(new URL(link).searchParams.get("rules")).toBe("modern");
		const pages = [host];
		for (const seat of ["N", "E", "S"] as const) {
			const page = await player.page(link);
			if (seat !== "S") await pick(page, seat);
			pages.push(page);
		}
		for (const page of pages)
			await expect(page.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{ timeout: CONNECT_MS },
			);
		const actor = (
			await Promise.all(
				pages.map(async (page) =>
					(await page.getByTestId("action-draw").isVisible())
						? page
						: undefined,
				),
			)
		).find((page) => page !== undefined);
		if (!actor) throw new Error("no player can draw");
		await actor.getByTestId("action-draw").click();
		for (const page of pages)
			await expect(page.getByTestId("table")).toHaveAttribute("data-at", "1", {
				timeout: CONNECT_MS,
			});
	} finally {
		await player.close();
	}
});
