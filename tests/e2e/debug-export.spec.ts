import { expect, test } from "@playwright/test";
import { createTableLink, openDrawer, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("the host can copy a network report without table contents or credentials", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async (text: string) => {
					Object.assign(window, { copiedDiagnostic: text });
				},
			},
		});
	});
	await page.goto("/");
	await page.getByLabel("North name").fill("secret-canary");
	await page.getByTestId("create").click();
	await expect(page.getByTestId("table")).toBeVisible();
	await page.evaluate(() =>
		localStorage.setItem(
			"dvolgyes-open_canasta.openrouter-api-key",
			"credential-canary",
		),
	);
	await openDrawer(page);
	await page.getByTestId("network").locator("summary").click();
	await page
		.getByRole("button", { name: "Copy network diagnostics" })
		.click({ timeout: 3_000 });
	await expect(page.getByTestId("diagnostic-status")).toHaveText(
		"Network diagnostics copied.",
	);
	const safe = await page.evaluate(() => {
		const text = (window as unknown as { copiedDiagnostic: string })
			.copiedDiagnostic;
		const data = JSON.parse(text) as { kind?: string };
		return (
			data.kind === "open-canasta-network-diagnostics" &&
			!text.includes("secret-canary") &&
			!text.includes("credential-canary") &&
			!text.includes(location.hash.slice(3))
		);
	});
	expect(safe).toBe(true);
	await page.evaluate(() => {
		navigator.clipboard.writeText = async () => {
			throw new Error("clipboard unavailable");
		};
	});
	await page.getByRole("button", { name: "Copy network diagnostics" }).click();
	await expect(page.getByTestId("diagnostic-status")).toHaveText(
		"Could not copy network diagnostics.",
	);
});

test("the report is offered only to the current host", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const host = await Player.open(browser, baseURL, "diagnostic-host");
	const guest = await Player.open(browser, baseURL, "diagnostic-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await Promise.all([host.installRelay(hub), guest.installRelay(hub)]);
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const page = await guest.page(link);
		await pick(page, "N");
		await openDrawer(page);
		await page.getByTestId("network").locator("summary").click();
		await expect(
			page.getByRole("button", { name: "Copy network diagnostics" }),
		).toHaveCount(0);
	} finally {
		await guest.close();
		await host.close();
	}
});
