import { expect, test } from "@playwright/test";

test("applies the saved theme before the application module loads", async ({
	page,
}) => {
	await page.addInitScript(() => {
		localStorage.setItem("dvolgyes-open_canasta.settings.theme", "gruvbox");
		localStorage.setItem("dvolgyes-open_canasta.settings.scheme", "dark");
	});
	await page.route("**/assets/*.js", (route) => route.abort());
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.locator("html")).toHaveAttribute("data-theme", "gruvbox");
	await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
});

test("ignores invalid stored theme choices before the application loads", async ({
	page,
}) => {
	await page.addInitScript(() => {
		localStorage.setItem("dvolgyes-open_canasta.settings.theme", "invalid");
		localStorage.setItem("dvolgyes-open_canasta.settings.scheme", "invalid");
	});
	await page.emulateMedia({ colorScheme: "light" });
	await page.route("**/assets/*.js", (route) => route.abort());
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.locator("html")).toHaveAttribute("data-theme", "selenized");
	await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
});
