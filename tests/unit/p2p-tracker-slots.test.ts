import { expect, it } from "vitest";
import { REJOIN_MAX_MS, REJOIN_MS } from "../../src/p2p/limits";
import { nextSlotMs } from "../../src/p2p/torrent";

it("spreads tracker announcements and avoids the rejoin window for up to four trackers", () => {
	const rejoins: number[] = [];
	for (let at = 0, wait = REJOIN_MS; at + wait <= 600_000; ) {
		at += wait;
		rejoins.push(at);
		wait = Math.min(REJOIN_MAX_MS, wait * 2);
	}
	for (const count of [1, 2, 3, 4]) {
		const slots: number[] = [];
		for (let index = 0; index < count; index++) {
			const slot = { index, count, originMs: 0 };
			for (let at = 2_100; at <= 600_000; ) {
				at += nextSlotMs(slot, at);
				slots.push(at);
			}
		}
		for (const rejoin of rejoins)
			expect(
				slots.filter((at) => at > rejoin - 2_000 && at <= rejoin),
				`${count} trackers at ${rejoin}`,
			).toEqual([]);
	}
});
