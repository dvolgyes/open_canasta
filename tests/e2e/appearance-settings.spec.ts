import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";

test("desktop table sheets follow the selected theme", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto("/");
	await createTableLink(page);
	for (const theme of ["selenized", "normal", "solarized", "gruvbox"]) {
		for (const scheme of ["light", "dark"]) {
			const result = await page.evaluate(
				({ theme, scheme }) => {
					document.documentElement.dataset.theme = theme;
					document.documentElement.dataset.scheme = scheme;
					const probe = document.createElement("div");
					probe.style.backgroundColor = "var(--sheet-bg)";
					probe.style.color = "var(--sheet-fg)";
					document.body.append(probe);
					const expected = getComputedStyle(probe);
					const colors = [expected.backgroundColor, expected.color];
					probe.remove();
					return [".call-panel", ".screen-controls", ".score-strip"].every(
						(selector) => {
							const panel = document.querySelector(selector);
							if (!panel) return false;
							const style = getComputedStyle(panel);
							return (
								style.backgroundColor === colors[0] && style.color === colors[1]
							);
						},
					);
				},
				{ theme, scheme },
			);
			expect(result, `${theme} ${scheme}`).toBe(true);
		}
	}
});

test("settings actions remain visible while the phone settings scroll", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto("/");
	await createTableLink(page);
	await page.getByRole("button", { name: "Appearance settings" }).click();
	const dialog = page.getByRole("dialog", { name: "Appearance settings" });
	const save = dialog.getByRole("button", { name: "Save" });
	const cancel = dialog.getByRole("button", { name: "Cancel" });
	const before = await save.boundingBox();
	if (!before) throw new Error("save action is not visible");
	expect(before.y + before.height).toBeLessThanOrEqual(568);
	const content = dialog.locator(".appearance-content");
	await content.evaluate((node) => {
		node.scrollTop = node.scrollHeight;
	});
	expect(await content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
	const after = await save.boundingBox();
	if (!after) throw new Error("save action disappeared");
	expect(after.y).toBeCloseTo(before.y, 0);
	await expect(cancel).toBeVisible();
});

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
