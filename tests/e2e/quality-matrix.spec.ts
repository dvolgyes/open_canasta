import { expect, test } from "@playwright/test";
import { CONNECT_MS, createTableLink, openHostControls, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

test("the host receives a directed quality row from each connected player", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL is missing");
	const players: Player[] = [];
	const hub = new RelayHub("tracker", buildTrackerUrls());
	try {
		for (const seat of ["W", "N", "S", "E"] as const) {
			const player = await Player.open(browser, baseURL, seat);
			players.push(player);
			await player.installRelay(hub);
		}
		const [host, north, south, east] = players;
		if (!host || !north || !south || !east) throw new Error("players missing");
		const hostPage = await host.page("/");
		const link = await createTableLink(hostPage);
		const guests = [];
		for (const [player, seat] of [
			[north, "N"],
			[south, "S"],
			[east, "E"],
		] as const) {
			const page = await player.page(link);
			await pick(page, seat);
			guests.push(page);
		}
		await expect(hostPage.getByTestId("table")).toHaveAttribute(
			"data-phase",
			"play",
			{ timeout: CONNECT_MS },
		);
		await openHostControls(hostPage);
		const matrix = hostPage.getByTestId("quality-matrix");
		await expect(matrix).toBeVisible();
		await expect(matrix.locator("td[data-quality]")).toHaveCount(12, {
			timeout: CONNECT_MS,
		});
		for (const guest of guests)
			await expect(guest.getByTestId("quality-matrix")).toBeHidden();
		for (const player of players) expect(player.errors).toEqual([]);
	} finally {
		await Promise.all(players.map((player) => player.close()));
	}
});
