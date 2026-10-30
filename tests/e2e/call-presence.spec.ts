import { expect, test } from "@playwright/test";
import { counts, installCallProbe } from "./call-probe";
import { CONNECT_MS, createTableLink, pick } from "./pages";
import { Player } from "./player";

test("the call needs another connected seat and ends after it leaves", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "call-presence-host", {
		permissions: ["microphone"],
	});
	const guest = await Player.open(browser, baseURL, "call-presence-guest");
	const returning = await Player.open(browser, baseURL, "call-presence-return");
	try {
		await host.addInitScript(installCallProbe);
		const page = await host.page("/");
		const link = await createTableLink(page);
		const join = page.getByRole("button", { name: "Join call", exact: true });
		const controls = page.getByTestId("call-panel");
		await expect(join).toBeDisabled({ timeout: 2_000 });
		await expect(controls).toHaveCSS("filter", "grayscale(1) brightness(0.6)");
		const other = await guest.page(link);
		await pick(other, "N");
		await expect(join).toBeEnabled({ timeout: CONNECT_MS });
		await expect(controls).toHaveCSS("filter", "none");
		await join.click();
		await expect(
			page.getByRole("button", { name: "Leave call", exact: true }),
		).toBeVisible();
		await expect.poll(async () => (await counts(page)).liveTracks).toBe(1);
		await guest.close();
		await expect(
			page.getByRole("button", { name: "Join call", exact: true }),
		).toBeDisabled({ timeout: 45_000 });
		await expect(
			page.getByRole("button", { name: "Send mic audio", exact: true }),
		).toHaveAttribute("data-actual", "off");
		await expect(controls).toHaveCSS("filter", "grayscale(1) brightness(0.6)");
		expect((await counts(page)).liveTracks).toBe(0);
		const next = await returning.page(link);
		await pick(next, "E");
		await expect(join).toBeEnabled({ timeout: CONNECT_MS });
		await page.waitForTimeout(1_000);
		expect((await counts(page)).liveTracks).toBe(0);
		await expect(join).toBeVisible();
		await join.click();
		await expect.poll(async () => (await counts(page)).liveTracks).toBe(1);
	} finally {
		await returning.close();
		await guest.close();
		await host.close();
	}
});
