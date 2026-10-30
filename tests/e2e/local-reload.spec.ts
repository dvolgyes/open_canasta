import { expect, test } from "@playwright/test";
import { createTableLink, lines, openDrawer, sendDraft } from "./pages";

test("the table Reload button restores the seat and saved messages", async ({
	page,
}) => {
	await page.goto("/");
	await createTableLink(page);
	await sendDraft(page);
	const before = await lines(page).count();
	const reload = page.getByRole("button", { name: "Reload", exact: true });
	await expect(reload).toBeVisible({ timeout: 3_000 });
	const loaded = page.waitForEvent("load");
	await reload.click();
	await loaded;
	await expect(page).toHaveTitle(/player4 \(W, host\)$/);
	await openDrawer(page);
	await expect(lines(page)).toHaveCount(before);
});

test("the phone Reload icon restores the seat and saved messages", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 664 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		const page = await context.newPage();
		await page.goto("/");
		await createTableLink(page);
		await sendDraft(page);
		const before = await lines(page).count();
		const reload = page.getByTestId("call-row").getByRole("button", {
			name: "Reload",
		});
		const loaded = page.waitForEvent("load");
		await reload.click();
		await loaded;
		await expect(page).toHaveTitle(/player4 \(W, host\)$/);
		await openDrawer(page);
		await expect(lines(page)).toHaveCount(before);
	} finally {
		await context.close();
	}
});
