import { expect, it } from "vitest";
import { inferCards, sampleCards } from "../../src/bot/card-knowledge";
import { mulberry32 } from "../../src/canasta";

it("forgets the guaranteed copy after an indistinguishable copy is played", () => {
	const belief = inferCards({
		deck: ["KS", "KS", "10C", "4H", "5H", "6H"],
		observer: 0,
		own: ["10C"],
		publicCards: ["KS"],
		counts: [1, 2],
		history: {
			initialCounts: [1, 1],
			events: [
				{ player: 1, gained: ["KS"], removed: [], drawn: 0 },
				{ player: 1, gained: [], removed: [], drawn: 1 },
				{ player: 1, gained: [], removed: ["KS"], drawn: 0 },
			],
		},
	});
	expect(belief.players[1]?.minimum.KS).toBe(0);
	expect(belief.players[1]?.maximum.KS).toBe(1);
	const outcomes = new Set<number>();
	for (let seed = 0; seed < 40; seed++) {
		const sample = sampleCards(belief, mulberry32(seed));
		outcomes.add(sample[1]?.filter((face) => face === "KS").length ?? 0);
		expect(sample.map((cards) => cards.length)).toEqual([1, 2, 2]);
	}
	expect(outcomes).toEqual(new Set([0, 1]));
});

it("keeps one guaranteed copy when two copies were taken and one was played", () => {
	const belief = inferCards({
		deck: ["KS", "KS", "4C", "5C"],
		observer: 0,
		own: ["4C"],
		publicCards: ["KS"],
		counts: [1, 1],
		history: {
			initialCounts: [1, 0],
			events: [
				{ player: 1, gained: ["KS", "KS"], removed: [], drawn: 0 },
				{ player: 1, gained: [], removed: ["KS"], drawn: 0 },
			],
		},
	});
	expect(belief.players[1]?.minimum.KS).toBe(1);
	expect(sampleCards(belief, mulberry32(1))[1]).toEqual(["KS"]);
});

it("rejects impossible observations instead of inventing a deal", () => {
	expect(() =>
		inferCards({
			deck: ["A", "A"],
			observer: 0,
			own: ["A"],
			publicCards: ["A", "A"],
			counts: [1, 0],
		}),
	).toThrow(/cards|deck/i);
});
