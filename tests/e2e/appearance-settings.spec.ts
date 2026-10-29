import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";

test("appearance settings can be saved and restored on reload", async ({
	page,
}) => {
	await page.goto("/");
	await createTableLink(page);
	await page.getByRole("button", { name: "Appearance settings" }).click();
	const dialog = page.getByRole("dialog", { name: "Appearance settings" });
	await dialog.getByLabel("Board texture").selectOption("strong");
	await dialog.getByLabel("Appearance", { exact: true }).selectOption("dark");
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-baize-strength",
		"strong",
	);
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute(
		"data-baize-strength",
		"strong",
	);
	await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
});
