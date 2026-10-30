import { expect, test } from "@playwright/test";
import { counts, installCallProbe } from "./call-probe";
import { CONNECT_MS, createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("a guest can decline or join the host's call without automatic capture", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "invite-host", {
		permissions: ["microphone"],
	});
	const guest = await Player.open(
		browser,
		baseURL,
		"invite-guest",
		{
			permissions: ["microphone"],
		},
		{ keepCallInvite: true },
	);
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, guest]) {
			await player.installRelay(hub);
			await player.addInitScript(installCallProbe);
		}
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const guestPage = await guest.page(link);
		await pick(guestPage, "N");
		await hostPage
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		const invite = guestPage.getByTestId("call-invite");
		await expect(invite).toBeVisible({ timeout: 8_000 });
		expect((await counts(guestPage)).captures).toBe(0);
		await invite.getByRole("button", { name: "Don't join" }).click();
		await expect(invite).toBeHidden();
		expect((await counts(guestPage)).captures).toBe(0);
		await hostPage
			.getByRole("button", { name: "Leave call", exact: true })
			.click();
		await expect(
			hostPage.getByRole("button", { name: "Join call", exact: true }),
		).toBeVisible();
		await hostPage
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await expect(invite).toBeVisible({ timeout: CONNECT_MS });
		await invite
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await expect(invite).toBeHidden();
		await expect
			.poll(async () => (await counts(guestPage)).captures)
			.toBeGreaterThan(0);
	} finally {
		await guest.close();
		await host.close();
	}
});

test("a phone joining while the host is in a call can choose its media", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "invite-phone-host", {
		permissions: ["microphone"],
	});
	const phone = await Player.open(
		browser,
		baseURL,
		"invite-phone",
		{
			permissions: ["microphone"],
			viewport: { width: 390, height: 664 },
			isMobile: true,
			hasTouch: true,
		},
		{ keepCallInvite: true },
	);
	const guest = await Player.open(browser, baseURL, "invite-phone-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		for (const player of [host, guest, phone]) await player.installRelay(hub);
		await phone.addInitScript(installCallProbe);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		await pick(await guest.page(link), "E");
		await hostPage
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		const page = await phone.page(link);
		await pick(page, "S");
		const invite = page.getByTestId("call-invite");
		await expect(invite).toBeVisible({ timeout: CONNECT_MS });
		await expect(
			invite.getByRole("button", { name: "See cameras: receive video" }),
		).toBeHidden();
		await invite.getByRole("button", { name: "Send mic audio" }).click();
		await expect(
			invite.getByRole("button", { name: "Send mic audio" }),
		).toHaveAttribute("aria-pressed", "false");
		expect((await counts(page)).captures).toBe(0);
		await invite
			.getByRole("button", { name: "Join call", exact: true })
			.click();
		await expect(invite).toBeHidden();
		expect((await counts(page)).captures).toBe(0);
	} finally {
		await phone.close();
		await guest.close();
		await host.close();
	}
});
