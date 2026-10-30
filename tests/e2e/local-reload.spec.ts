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
