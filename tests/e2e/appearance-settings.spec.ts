import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";

test("side panel paper can be disabled and stays off after reload", async ({
	page,
}) => {
	await page.goto("/");
	await createTableLink(page);
	const panel = page.locator(".screen-controls");
	await expect(panel).toHaveCSS("background-image", /panel-parchment/);
	expect(
		await panel.evaluate(async (node) => {
			const url = getComputedStyle(node).backgroundImage.match(
				/url\(["']?(.*?)["']?\)/,
			)?.[1];
			if (!url) return false;
			const image = new Image();
			image.src = url;
			await image.decode();
			return image.naturalWidth > 0;
		}),
	).toBe(true);
	await page.getByRole("button", { name: "Appearance settings" }).click();
	const dialog = page.getByRole("dialog", { name: "Appearance settings" });
	await dialog.getByLabel("Side panel texture").uncheck();
	await expect(panel).toHaveCSS("background-image", "none");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(panel).toHaveCSS("background-image", /panel-parchment/);
	await page.getByRole("button", { name: "Appearance settings" }).click();
	await dialog.getByLabel("Side panel texture").uncheck();
	await dialog.getByRole("button", { name: "Save" }).click();
	await page.reload();
	await expect(panel).toHaveCSS("background-image", "none");
});

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
	await expect(page.locator(".screen-controls")).toHaveCSS(
		"background-image",
		"none",
	);
});
