import { expect, test } from "@playwright/test";
import {
	counts,
	expectAudioArrives,
	installCallProbe,
	joinWith,
} from "./call-probe";
import { CONNECT_MS, createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("phone landscape view can be previewed, canceled, and saved without starting media", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL missing");
	const player = await Player.open(browser, baseURL, "orientation-phone", {
		viewport: { width: 844, height: 390 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		await player.addInitScript(installCallProbe);
		const page = await player.page("/");
		await createTableLink(page);
		const table = page.getByTestId("table");
		await expect(table).toHaveAttribute("data-form", "compact");
		await expect(table).toHaveAttribute("data-layout", "sideways");
		const board = await table.locator(".felt").boundingBox();
		const controls = await page.getByTestId("screen-controls").boundingBox();
		const dock = await page.locator(".dock").boundingBox();
		if (!board || !controls || !dock)
			throw new Error("landscape board or controls missing");
		expect(board.x + board.width).toBeLessThanOrEqual(controls.x);
		expect(dock.x).toBeGreaterThanOrEqual(board.x + board.width);
		const button = page.getByRole("button", { name: "Appearance settings" });
		const dialog = page.getByRole("dialog", { name: "Appearance settings" });
		const choice = dialog.getByLabel(
			"On a phone or tablet in landscape, show the desktop view",
		);
		await button.click();
		await choice.check();
		await expect(table).toHaveAttribute("data-form", "desktop");
		await expect(table).toHaveAttribute("data-layout", "desktop");
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(844);
		expect((await counts(page)).captures).toBe(0);
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await expect(table).toHaveAttribute("data-form", "compact");
		await expect(table).toHaveAttribute("data-layout", "sideways");
		await button.click();
		await choice.check();
		await dialog.getByRole("button", { name: "Save" }).click();
		expect((await counts(page)).captures).toBe(0);
		await page.reload();
		await expect(table).toHaveAttribute("data-form", "desktop");
		expect((await counts(page)).captures).toBe(0);
		expect(player.errors).toEqual([]);
	} finally {
		await player.close();
	}
});

test("a wide landscape tablet keeps the compact call and sidebar controls", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL missing");
	const player = await Player.open(browser, baseURL, "orientation-tablet", {
		viewport: { width: 1180, height: 820 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		const page = await player.page("/");
		await createTableLink(page);
		const table = page.getByTestId("table");
		await expect(table).toHaveAttribute("data-layout", "sideways");
		await expect(table).toHaveAttribute("data-form", "compact");
		const board = await table.locator(".felt").boundingBox();
		const dock = await page.locator(".dock").boundingBox();
		if (!board || !dock)
			throw new Error("landscape board or call controls missing");
		expect(dock.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(1180);
	} finally {
		await player.close();
	}
});

test("rotating an active phone call moves controls without recapturing media", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL missing");
	const hub = new RelayHub("tracker", buildTrackerUrls());
	const host = await Player.open(browser, baseURL, "orientation-host");
	const phone = await Player.open(browser, baseURL, "orientation-call-phone", {
		viewport: { width: 390, height: 720 },
		isMobile: true,
		hasTouch: true,
	});
	try {
		await Promise.all([host.installRelay(hub), phone.installRelay(hub)]);
		await Promise.all([
			host.grantPermissions(["microphone"]),
			phone.grantPermissions(["microphone"]),
		]);
		await Promise.all([
			host.addInitScript(installCallProbe),
			phone.addInitScript(installCallProbe),
		]);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const page = await phone.page(link);
		await pick(page, "N");
		await joinWith(hostPage, "Audio only");
		await joinWith(page, "Audio only");
		await expectAudioArrives(hostPage);
		const before = await counts(page);
		expect(before.captures).toBe(1);
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-layout",
			"sideways",
			{ timeout: CONNECT_MS },
		);
		await expect(
			page.getByRole("button", { name: "Leave call", exact: true }),
		).toBeVisible();
		expect((await counts(page)).captures).toBe(before.captures);
		await expectAudioArrives(hostPage);
		await page.setViewportSize({ width: 390, height: 720 });
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-layout",
			"compact",
		);
		expect((await counts(page)).captures).toBe(before.captures);
	} finally {
		await Promise.all([host.close(), phone.close()]);
	}
});
