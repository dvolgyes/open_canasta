import { expect, test } from "@playwright/test";

test("a touch player can share the link and copy it when sharing fails", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 664 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		await context.addInitScript(() => {
			const state = { mode: "success", shared: 0, copied: 0, valid: false };
			Object.assign(window, { shareTest: state });
			Object.defineProperty(navigator, "share", {
				value: async ({ url }: { url: string }) => {
					state.shared++;
					const link = new URL(url);
					state.valid =
						link.hash.startsWith("#k=") && !link.searchParams.has("pl");
					if (state.mode === "fail") throw new Error("share unavailable");
					if (state.mode === "cancel")
						throw new DOMException("cancelled", "AbortError");
				},
			});
			Object.defineProperty(navigator, "clipboard", {
				value: {
					writeText: async (url: string) => {
						state.copied++;
						const link = new URL(url);
						state.valid =
							link.hash.startsWith("#k=") && !link.searchParams.has("pl");
					},
				},
			});
		});
		const page = await context.newPage();
		await page.goto("/");
		await page.getByTestId("create").click();
		await expect(page.getByTestId("table")).toBeVisible();
		const callRow = page.getByTestId("call-row");
		await expect(callRow).toBeVisible({ timeout: 3_000 });
		await expect(
			callRow.getByRole("button", { name: "Share URL" }),
		).toBeVisible();
		await expect(
			callRow.getByRole("button", { name: "New table" }),
		).toBeVisible();
		await expect(callRow.getByRole("button", { name: "Reload" })).toBeVisible({
			timeout: 3_000,
		});
		for (const name of ["Share URL", "Reload", "New table"])
			await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
				1,
			);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(390);
		await page.evaluate(() => {
			const state = (window as unknown as { shareTest: { copied: number } })
				.shareTest;
			state.copied = 0;
		});
		await callRow.getByRole("button", { name: "Share URL" }).click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { shareTest: { shared: number } }).shareTest
							.shared,
				),
			)
			.toBe(1);
		const share = callRow.getByRole("button", { name: "Share URL" });
		await share.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								shareTest: { shared: number; valid: boolean };
							}
						).shareTest,
				),
			)
			.toMatchObject({ shared: 2, valid: true });
		await page.evaluate(() => {
			(window as unknown as { shareTest: { mode: string } }).shareTest.mode =
				"fail";
		});
		await share.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								shareTest: { copied: number; valid: boolean };
							}
						).shareTest,
				),
			)
			.toMatchObject({ copied: 1, valid: true });
		await page.evaluate(() => {
			(window as unknown as { shareTest: { mode: string } }).shareTest.mode =
				"cancel";
		});
		await share.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								shareTest: { shared: number; copied: number };
							}
						).shareTest,
				),
			)
			.toMatchObject({ shared: 4, copied: 1 });
	} finally {
		await context.close();
	}
});

test("a touch player without native sharing can copy the table link", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 664 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		await context.addInitScript(() => {
			Object.defineProperty(navigator, "share", { value: undefined });
			Object.defineProperty(navigator, "clipboard", {
				value: {
					writeText: async (url: string) => {
						const link = new URL(url);
						Object.assign(window, {
							copiedSharedLink:
								link.hash.startsWith("#k=") && !link.searchParams.has("pl"),
						});
					},
				},
			});
		});
		const page = await context.newPage();
		await page.goto("/");
		await page.getByTestId("create").click();
		await expect(page.getByTestId("table")).toBeVisible();
		await page.evaluate(() => {
			Object.assign(window, { copiedSharedLink: false });
		});
		const copy = page.getByTestId("call-row").getByRole("button", {
			name: "Share URL",
		});
		await copy.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { copiedSharedLink: boolean })
							.copiedSharedLink,
				),
			)
			.toBe(true);
	} finally {
		await context.close();
	}
});

test("phone call and game actions fit on one row in every language", async ({
	browser,
}) => {
	test.setTimeout(120_000);
	const context = await browser.newContext({
		viewport: { width: 320, height: 568 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		const page = await context.newPage();
		await page.goto("/");
		await page.getByTestId("create").click();
		await expect(page.getByTestId("table")).toBeVisible();
		for (const locale of [
			"en",
			"de",
			"hu",
			"no",
			"es",
			"pt",
			"fr",
			"it",
			"nl",
		]) {
			await page.evaluate(
				(value) => localStorage.setItem("dvolgyes-open_canasta.locale", value),
				locale,
			);
			await page.reload();
			const row = page.getByTestId("call-row");
			await expect(row).toBeVisible();
			const call = await row.locator(".icon-group").first().boundingBox();
			const game = await row.locator(".game-group").boundingBox();
			if (!call || !game) throw new Error("phone actions are missing");
			expect(game.y, locale).toBeLessThan(call.y + call.height);
			expect(game.y + game.height, locale).toBeGreaterThan(call.y);
			await expect(row.locator(".game-group button")).toHaveCount(3);
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth),
				locale,
			).toBeLessThanOrEqual(320);
		}
	} finally {
		await context.close();
	}
});
