import { describe, expect, it } from "vitest";
import { sortHand } from "../../src/ui/hand-layout";

const card = (rank: string, suit: string | null) => ({ rank, suit });

describe("sortHand", () => {
	it("orders 3 low to A, then 2, then jokers, and suits within a rank", () => {
		const hand = [
			card("JK", null),
			card("2", "C"),
			card("A", "H"),
			card("3", "S"),
			card("10", "D"),
			card("3", "C"),
		];
		expect(sortHand(hand)).toEqual([
			card("3", "C"),
			card("3", "S"),
			card("10", "D"),
			card("A", "H"),
			card("2", "C"),
			card("JK", null),
		]);
	});

	it("does not change the input", () => {
		const hand = [card("K", "S"), card("4", "H")];
		const copy = [...hand];
		sortHand(hand);
		expect(hand).toEqual(copy);
	});

	it("keeps an empty hand empty", () => {
		expect(sortHand([])).toEqual([]);
	});
});
