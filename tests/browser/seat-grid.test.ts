import "../../src/ui/style.css";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SEATS, type Seat } from "../../src/protocol";
import { seatGrid } from "../../src/ui/seat-grid";

afterEach(async () => {
	document.body.replaceChildren();
	await page.viewport(414, 896);
});

for (const [width, height] of [
	[1280, 800],
	[320, 700],
] as const) {
	it(`places each viewer below their partner and clockwise neighbors at ${width}px`, async () => {
		await page.viewport(width, height);
		for (const viewer of SEATS) {
			const grid = seatGrid(
				SEATS.map((seat) => ({
					seat,
					element: Object.assign(document.createElement("section"), {
						textContent: seat,
					}),
				})),
				viewer,
			);
			document.body.replaceChildren(grid);
			const centre = (seat: Seat) => {
				const card = grid.querySelector(`[data-seat="${seat}"]`);
				if (!card) throw new Error(`missing ${seat} card`);
				const box = card.getBoundingClientRect();
				return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			};
			const index = SEATS.indexOf(viewer);
			const at = (offset: number) => {
				const seat = SEATS[(index + offset) % SEATS.length];
				if (!seat) throw new Error("missing compass seat");
				return centre(seat);
			};
			const own = at(0);
			const left = at(1);
			const partner = at(2);
			const right = at(3);
			expect(own.y).toBeGreaterThan(left.y);
			expect(own.y).toBeGreaterThan(right.y);
			expect(partner.y).toBeLessThan(left.y);
			expect(partner.y).toBeLessThan(right.y);
			expect(left.x).toBeLessThan(right.x);
		}
	});
}
