import { expect, test } from "@playwright/test";
import { CONNECT_MS, createTableLink, openHostControls, pick } from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

/** Delay or drop this page's pings while leaving its replies and reports unchanged. */
function delayPings(): void {
	const probe = { dropped: 0, drop: false };
	Object.defineProperty(window, "__qualityProbe", { value: probe });
	const decoder = new TextDecoder();
	const send = RTCDataChannel.prototype.send as (
		this: RTCDataChannel,
		data: unknown,
	) => void;
	(RTCDataChannel.prototype as { send: (data: unknown) => void }).send =
		function (this: RTCDataChannel, data: unknown) {
			const bytes =
				data instanceof ArrayBuffer
					? new Uint8Array(data)
					: ArrayBuffer.isView(data)
						? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
						: undefined;
			const start =
				bytes && bytes[0] === 1
					? 3 + (((bytes[1] ?? 0) << 8) | (bytes[2] ?? 0))
					: -1;
			if (
				bytes &&
				start >= 0 &&
				bytes.length >= start + 36 &&
				bytes[start] === 2 &&
				bytes[start + 1] === 16 &&
				decoder
					.decode(bytes.subarray(start + 2, start + 34))
					.replaceAll("\0", "") === "oc-ctl"
			) {
				const metadata =
					((bytes[start + 34] ?? 0) << 8) | (bytes[start + 35] ?? 0);
				const message = JSON.parse(
					decoder.decode(bytes.subarray(start + 36 + metadata)),
				) as { k?: string };
				if (message.k === "ping") {
					if (probe.drop) {
						probe.dropped++;
						return;
					}
					setTimeout(() => {
						if (this.readyState === "open") send.call(this, data);
					}, 900);
					return;
				}
			}
			send.call(this, data);
		};
}

test("the host receives a directed quality row from each connected player", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("base URL is missing");
	test.setTimeout(180_000);
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
		await east.addInitScript(delayPings);
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
		const eastPage = guests[2];
		if (!eastPage) throw new Error("East is missing");
		for (const seat of ["N", "S", "W"] as const) {
			await expect(matrix.getByTestId(`quality-E-${seat}`)).toHaveAttribute(
				"data-quality",
				"poor",
				{ timeout: CONNECT_MS },
			);
			await expect(matrix.getByTestId(`quality-${seat}-E`)).toHaveAttribute(
				"data-quality",
				/^(excellent|good|average)$/,
			);
		}
		await eastPage.evaluate(() => {
			(
				window as unknown as { __qualityProbe: { drop: boolean } }
			).__qualityProbe.drop = true;
		});
		await expect(matrix.getByTestId("quality-E-N")).toHaveAttribute(
			"data-quality",
			"breaking-up",
			{ timeout: 25_000 },
		);
		await expect(matrix.getByTestId("quality-E-N")).toHaveText(">5.00");
		await expect(matrix.getByTestId("quality-N-E")).toHaveAttribute(
			"data-quality",
			/^(excellent|good|average)$/,
		);
		expect(
			await eastPage.evaluate(
				() =>
					(window as unknown as { __qualityProbe: { dropped: number } })
						.__qualityProbe.dropped,
			),
		).toBeGreaterThan(0);
		await eastPage.reload();
		await expect(matrix.getByTestId("quality-E-N")).toHaveAttribute(
			"data-quality",
			"poor",
			{ timeout: CONNECT_MS },
		);
		await expect(matrix.locator("td[data-quality]")).toHaveCount(12);
		for (const guest of guests)
			await expect(guest.getByTestId("quality-matrix")).toBeHidden();
		for (const player of players) expect(player.errors).toEqual([]);
	} finally {
		await Promise.all(players.map((player) => player.close()));
	}
});
