import { expect, type Page, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	pick,
	type SeatKey,
	takeTurn,
	turnOrder,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

function trackTurnSounds(): void {
	const state = { count: 0 };
	Object.defineProperty(window, "__turnSounds", { value: state });
	class FakeAudioContext {
		state = "running";
		currentTime = 0;
		destination = {};
		createOscillator() {
			return {
				frequency: { value: 0 },
				connect: () => {},
				start: () => {
					state.count++;
				},
				stop: () => {},
			};
		}
		createGain() {
			return {
				gain: {
					setValueAtTime: () => {},
					exponentialRampToValueAtTime: () => {},
				},
				connect: () => {},
			};
		}
		async resume() {}
		async close() {
			this.state = "closed";
		}
	}
	Object.defineProperty(window, "AudioContext", { value: FakeAudioContext });
}

const soundCount = (page: Page): Promise<number> =>
	page.evaluate(
		() =>
			(window as unknown as { __turnSounds: { count: number } }).__turnSounds
				.count,
	);

test("a hidden page sounds once per Canasta turn, not after each action", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const hub = new RelayHub("tracker", buildTrackerUrls());
	const players: Player[] = [];
	try {
		for (const seat of ["W", "N", "E", "S"] as const) {
			const player = await Player.open(browser, baseURL, `turn-alert-${seat}`);
			players.push(player);
			await player.installRelay(hub);
			await player.addInitScript(trackTurnSounds);
		}
		const [west, north, east, south] = players;
		if (!west || !north || !east || !south) throw new Error("missing player");
		const host = await west.page("/");
		const link = await createTableLink(host);
		const pages: Record<SeatKey, Page> = {
			W: host,
			N: await north.page(link),
			E: await east.page(link),
			S: await south.page(link),
		};
		for (const seat of ["N", "E", "S"] as const) await pick(pages[seat], seat);
		for (const page of Object.values(pages))
			await expect(page.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{ timeout: CONNECT_MS },
			);
		const order = await turnOrder(pages);
		const first = order[0];
		if (!first) throw new Error("missing first turn");
		const page = pages[first];
		const before = await soundCount(page);
		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				value: "hidden",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await expect.poll(() => soundCount(page)).toBe(before + 1);
		await page.getByTestId("action-draw").click();
		await expect(page.getByTestId("table")).toHaveAttribute("data-at", "1");
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-your-turn",
			"true",
		);
		await page.waitForTimeout(500);
		expect(await soundCount(page)).toBe(before + 1);
		await page.locator(".own-hand button.card").first().click();
		await page.getByTestId("action-discard").click();
		for (const [index, seat] of order.slice(1).entries())
			await takeTurn(pages[seat], 2 + index * 2);
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-your-turn",
			"true",
			{ timeout: CONNECT_MS },
		);
		await expect.poll(() => soundCount(page)).toBe(before + 2);
	} finally {
		for (const player of players) await player.close();
	}
});
