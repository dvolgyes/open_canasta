import { expect, type Page, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	expectSeat,
	pick,
	type SeatKey,
	takeTurn,
	turnOrder,
} from "./pages";
import { buildMqttUrls, buildNostrUrls, buildTrackerUrls } from "./player";
import { RelayHub } from "./relay-hub";

test("four players deal and play a turn with Nostr as the only discovery transport", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const urls = buildNostrUrls();
	if (urls.length === 0)
		throw new Error("Nostr discovery must be configured for this test");
	const relay = new RelayHub("nostr", urls, true);
	const blocked = new Set(
		[...buildTrackerUrls(), ...buildMqttUrls()].map((url) => new URL(url).host),
	);
	const pages = {} as Record<SeatKey, Page>;
	const contexts = [];
	try {
		for (const seat of ["W", "N", "E", "S"] as const) {
			const context = await browser.newContext({ baseURL });
			contexts.push(context);
			await context.routeWebSocket(
				(url) => blocked.has(url.host),
				(socket) => {
					void socket.close();
				},
			);
			await relay.install(context, seat);
			pages[seat] = await context.newPage();
		}
		await pages.W.goto("/");
		const link = await createTableLink(pages.W);
		for (const seat of ["N", "E"] as const) {
			await pages[seat].goto(link);
			await pick(pages[seat], seat);
		}
		await pages.S.goto(link);
		await expectSeat(pages.S, "S", { timeout: CONNECT_MS });
		for (const seat of ["W", "N", "E", "S"] as const)
			await expect(pages[seat].getByTestId("table")).toHaveAttribute(
				"data-hand",
				"1",
				{ timeout: CONNECT_MS },
			);
		const [first] = await turnOrder(pages);
		if (!first) throw new Error("No player has the first turn");
		await takeTurn(pages[first], 0);
		for (const seat of ["W", "N", "E", "S"] as const)
			await expect(pages[seat].getByTestId("table")).toHaveAttribute(
				"data-at",
				"2",
				{ timeout: CONNECT_MS },
			);
		expect(relay.invalidEvents()).toBe(0);
	} finally {
		for (const context of contexts) await context.close();
	}
});
