import { expect, test } from "@playwright/test";
import { CONNECT_MS, createTableLink, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("a player waiting for a host sees connection progress in the picker and table", async ({
	browser,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("baseURL is not configured");
	const creator = await Player.open(browser, baseURL, "summary-creator");
	const guest = await Player.open(browser, baseURL, "summary-guest");
	try {
		const hub = new RelayHub("tracker", buildTrackerUrls());
		await creator.installRelay(hub);
		await guest.installRelay(hub);
		const link = await createTableLink(await creator.page("/"));
		await creator.close();
		const page = await guest.page(link);
		const network = page.getByTestId("network");
		await expect(network).toHaveAttribute("open", "");
		const line = (label: string) =>
			network
				.locator("dt", { hasText: new RegExp(`^${label}$`) })
				.locator("xpath=following-sibling::dd[1]");
		await expect(line("WebRTC")).toHaveText("yes", { timeout: CONNECT_MS });
		await expect(line("Local candidates")).toHaveText(
			/^(host|srflx|prflx|relay) (IPv4|IPv6|mDNS)( TCP)?(, (host|srflx|prflx|relay) (IPv4|IPv6|mDNS)( TCP)?)*$/,
		);
		const summary = page.getByTestId("connection-summary");
		await expect(summary).toBeVisible({ timeout: CONNECT_MS });
		await expect(summary).toContainText("Trackers reachable:");
		await expect(summary).toContainText("MQTT brokers reachable:");
		await expect(summary).toContainText("Direct connections:");
		await expect(summary).not.toContainText("wss://");
		await pick(page, "N");
		const detail = page.getByTestId("banner-detail");
		await expect(detail).toBeVisible({ timeout: CONNECT_MS });
		await expect(detail).toContainText("Public address found:");
	} finally {
		await guest.close();
		await creator.close();
	}
});
