import { expect, test } from "@playwright/test";
import { createTableLink, pick } from "./pages";

for (const [label, options] of [
	["desktop", {}],
	[
		"phone",
		{ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
	],
] as const) {
	test(`first play opens appearance settings on ${label} until saved`, async ({
		browser,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("missing base URL");
		const context = await browser.newContext({
			...options,
			baseURL,
			storageState: { cookies: [], origins: [] },
		});
		try {
			const page = await context.newPage();
			await page.goto("/solo/");
			await page.getByLabel("Your name").fill("Alice");
			await page.getByTestId("create-solo").click();
			const dialog = page.getByRole("dialog", { name: "Appearance settings" });
			await expect(dialog).toBeVisible();
			await dialog.getByRole("button", { name: "Cancel" }).click();
			await page.reload();
			await expect(dialog).toBeVisible();
			await dialog.getByRole("button", { name: "Save", exact: true }).click();
			await page.reload();
			await expect(page.getByTestId("table")).toBeVisible();
			await expect(dialog).toBeHidden();
		} finally {
			await context.close();
		}
	});
}

test("a joining player gets their own first-play settings", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("missing base URL");
	const empty = { cookies: [], origins: [] };
	const host = await browser.newContext({ baseURL, storageState: empty });
	const guest = await browser.newContext({ baseURL, storageState: empty });
	try {
		const hostPage = await host.newPage();
		await hostPage.goto("/");
		const link = await createTableLink(hostPage);
		await hostPage
			.getByRole("dialog", { name: "Appearance settings" })
			.getByRole("button", { name: "Save", exact: true })
			.click();
		const guestPage = await guest.newPage();
		await guestPage.goto(link);
		await pick(guestPage, "N");
		const dialog = guestPage.getByRole("dialog", {
			name: "Appearance settings",
		});
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Save", exact: true }).click();
		await guestPage.reload();
		await expect(guestPage.getByTestId("table")).toBeVisible();
		await expect(dialog).toBeHidden();
	} finally {
		await guest.close();
		await host.close();
	}
});
