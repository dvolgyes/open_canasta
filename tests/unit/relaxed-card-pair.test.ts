import { expect, it } from "vitest";
import { type CardBelief, inferCards } from "../../src/bot/card-knowledge";
import { relaxedPairChance } from "../../src/bot/relaxed-card-pair";

it("matches exhaustive hypergeometric counts in unconstrained small populations", () => {
	const choose = (n: number, k: number): number => {
		if (k < 0 || k > n) return 0;
		let value = 1;
		for (let i = 1; i <= k; i++) value = (value * (n - i + 1)) / i;
		return value;
	};
	for (let total = 2; total <= 10; total++) {
		for (let matching = 0; matching <= total; matching++) {
			for (let drawn = 0; drawn <= total; drawn++) {
				const row = (count: number) => ({
					count,
					minimum: { A: 0, B: 0 },
					maximum: {
						A: Math.min(matching, count),
						B: Math.min(total - matching, count),
					},
				});
				const belief: CardBelief = {
					faces: ["A", "B"],
					remaining: { A: matching, B: total - matching },
					players: [row(drawn), row(total - drawn)],
				};
				let expected = 0;
				for (let n = 2; n <= drawn; n++)
					expected +=
						(choose(matching, n) * choose(total - matching, drawn - n)) /
						choose(total, drawn);
				expect(relaxedPairChance(belief, [0], ["A"])).toBeCloseTo(expected, 12);
			}
		}
	}
});

it("counts indistinguishable copies under the stated relaxed allocation model", () => {
	const base = {
		deck: ["KC", "KC", "4C", "5C", "9C"],
		observer: 0,
		own: ["9C"],
		publicCards: [],
	};
	const unknown = inferCards({ ...base, counts: [1, 2, 2] });
	expect(relaxedPairChance(unknown, [1], ["KC"])).toBeCloseTo(1 / 6);
	const split = inferCards({ ...base, counts: [1, 1, 1, 2] });
	expect(relaxedPairChance(split, [1, 2], ["KC"])).toBeCloseTo(1 / 6);
	const known = inferCards({
		...base,
		counts: [1, 2, 2],
		history: {
			initialCounts: [1, 1, 2],
			events: [{ player: 1, gained: ["KC"], removed: [], drawn: 0 }],
		},
	});
	expect(relaxedPairChance(known, [1], ["KC"])).toBeCloseTo(1 / 3);
	const forced = inferCards({
		...base,
		counts: [1, 2, 2],
		history: {
			initialCounts: [1, 0, 2],
			events: [{ player: 1, gained: ["KC", "KC"], removed: [], drawn: 0 }],
		},
	});
	expect(relaxedPairChance(forced, [1], ["KC"])).toBe(1);
	const impossible = inferCards({ ...base, counts: [1, 1, 3] });
	expect(relaxedPairChance(impossible, [1], ["KC"])).toBe(0);
});

it("rejects ambiguous or invalid target rows and face groups", () => {
	const belief = inferCards({
		deck: ["KC", "KC", "4C", "5C", "9C"],
		observer: 0,
		own: ["9C"],
		publicCards: [],
		counts: [1, 2, 2],
	});
	expect(() => relaxedPairChance(belief, [], ["KC"])).toThrow();
	expect(() => relaxedPairChance(belief, [1, 1], ["KC"])).toThrow();
	expect(() => relaxedPairChance(belief, [9], ["KC"])).toThrow();
	expect(() => relaxedPairChance(belief, [1], [])).toThrow();
	expect(() => relaxedPairChance(belief, [1], ["missing"])).toThrow();
	expect(() => relaxedPairChance(belief, [1], ["KC", "KC"])).toThrow();
});

it("returns exact zero when separate target rows share only one remaining matching card", () => {
	const row = {
		count: 1,
		minimum: { A: 0, B: 0 },
		maximum: { A: 1, B: 1 },
	};
	const belief: CardBelief = {
		faces: ["A", "B"],
		remaining: { A: 1, B: 2 },
		players: [row, row, row],
	};
	expect(relaxedPairChance(belief, [0, 1], ["A"])).toBe(0);
	const forced = { ...belief, remaining: { A: 2, B: 1 } };
	expect(relaxedPairChance(forced, [0, 1, 2], ["A"])).toBe(1);
});
