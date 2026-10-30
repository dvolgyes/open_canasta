import { expect, type Page, test } from "@playwright/test";
import {
	type CallProbe,
	caption,
	counts,
	installCallProbe,
	joinWith,
	leaveButton,
} from "./call-probe";
import {
	CONNECT_MS,
	createTableLink,
	expectSeat,
	hostRows,
	pick,
} from "./pages";
import { buildTrackerUrls, Player } from "./player";
import { RelayHub } from "./relay-hub";

/** Samples the receiver's frames from North and the identity of its video track. */
function northFrames(
	page: Page,
	samples: number,
): Promise<{ track: string | null; frames: number[] }> {
	return page.evaluate(async (count) => {
		const probe = (window as unknown as { __callProbe: CallProbe }).__callProbe;
		const node = document.querySelector('[data-testid="video-N"]');
		const source = node instanceof HTMLVideoElement ? node.srcObject : null;
		const track =
			source instanceof MediaStream
				? (source.getVideoTracks()[0]?.id ?? null)
				: null;
		const frames: number[] = [];
		for (let index = 0; index < count; index++) {
			let total = 0;
			for (const peer of probe.peers) {
				if (peer.connectionState === "closed") continue;
				(await peer.getStats()).forEach(
					(entry: {
						type: string;
						trackIdentifier?: string;
						framesReceived?: number;
					}) => {
						if (entry.type === "inbound-rtp" && entry.trackIdentifier === track)
							total += entry.framesReceived ?? 0;
					},
				);
			}
			frames.push(total);
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		return { track, frames };
	}, samples);
}

test("a guest video stream continues while the host reloads", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	test.setTimeout(180_000);
	const hub = new RelayHub("tracker", buildTrackerUrls());
	const players: Player[] = [];
	try {
		for (const [seat, permissions] of [
			["W", ["microphone"]],
			["N", ["microphone", "camera"]],
			["E", ["microphone"]],
			["S", ["microphone"]],
		] as const) {
			const player = await Player.open(
				browser,
				baseURL,
				`video-reload-${seat}`,
				{
					permissions: [...permissions],
				},
			);
			players.push(player);
			await player.installRelay(hub);
			await player.addInitScript(installCallProbe);
		}
		const [west, north, east, south] = players;
		if (!west || !north || !east || !south) throw new Error("missing player");
		const host = await west.page("./");
		const link = await createTableLink(host);
		const sender = await north.page(link);
		await pick(sender, "N");
		const receiver = await east.page(link);
		await pick(receiver, "E");
		const fourth = await south.page(link);
		await pick(fourth, "S");
		for (const page of [host, sender, receiver, fourth])
			await expect(page.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{ timeout: CONNECT_MS },
			);

		await joinWith(host, "Audio only");
		await joinWith(sender, "Send camera; hear others");
		await joinWith(receiver, "See cameras; send voice");
		await expect(receiver.getByTestId("tile-N")).toHaveAttribute(
			"data-video",
			"on",
			{ timeout: CONNECT_MS },
		);
		await expect(receiver.getByTestId("video-N")).toHaveAttribute(
			"data-play",
			"playing",
		);
		await expect(caption(receiver, "W")).toHaveText(
			"W - player4 · Audio only",
			{
				timeout: CONNECT_MS,
			},
		);

		const peersBefore = (await counts(receiver)).peers;
		const [during] = await Promise.all([
			northFrames(receiver, 16),
			host.waitForTimeout(500).then(() => host.reload()),
		]);
		expect(during.track).not.toBeNull();
		for (const [index, count] of during.frames.entries()) {
			if (index === 0) continue;
			expect(count, `frames at sample ${index}`).toBeGreaterThan(
				during.frames[index - 1] ?? 0,
			);
		}
		await expectSeat(host, "W", { timeout: CONNECT_MS });
		await expect(hostRows(receiver)).toHaveAttribute("data-seat", "W", {
			timeout: CONNECT_MS,
		});
		await expect(leaveButton(host)).toBeVisible({ timeout: CONNECT_MS });
		await expect(caption(receiver, "W")).toHaveText(
			"W - player4 · Audio only",
			{
				timeout: CONNECT_MS,
			},
		);
		expect((await counts(receiver)).peers).toBeGreaterThan(peersBefore);
		const after = await northFrames(receiver, 3);
		expect(after.track).toBe(during.track);
		expect(after.frames[2]).toBeGreaterThan(after.frames[0] ?? 0);
		for (const player of players) expect(player.errors).toEqual([]);
	} finally {
		for (const player of players) await player.close();
	}
});
