import { expect, it } from "vitest";
import { buildDecks, type Card } from "../../src/canasta";
import {
	modernCardPoints,
	modernHandThresholdPenalty,
	modernSpecialMeldScore,
	modernTeamScore,
	modernThreesScore,
} from "../../src/canasta/modern-special-scoring";

const deck = buildDecks();
const cards = (ids: readonly string[]): Card[] =>
	ids.map((id) => {
		const card = deck.find((candidate) => candidate.id === id);
		if (!card) throw new Error(`missing card ${id}`);
		return card;
	});

it("scores incomplete and complete natural sevens and aces", () => {
	for (const rank of ["7", "A"]) {
		const group = cards([
			`0-${rank}C`,
			`0-${rank}D`,
			`0-${rank}H`,
			`0-${rank}S`,
			`1-${rank}C`,
			`1-${rank}D`,
			`1-${rank}H`,
		]);
		expect(modernSpecialMeldScore(group.slice(0, 6))).toBe(-2500);
		expect(modernSpecialMeldScore(group)).toBe(2500);
	}
	// Mixed aces follow ordinary mixed-canasta scoring.
	expect(modernSpecialMeldScore(cards(["0-AC", "0-AD", "0-2C"]))).toBeNull();
});

it("combines modern card values, canasta bonuses, and per-player penalties", () => {
	const sevens = cards([
		"0-7C",
		"0-7D",
		"0-7H",
		"0-7S",
		"1-7C",
		"1-7D",
		"1-7H",
	]);
	const kings = cards(["0-KC", "0-KD", "0-KH", "0-KS", "1-KC", "1-KD", "1-KH"]);
	const threes = cards(["0-3H", "1-3H", "0-3C", "1-3C"]);
	const unmelded = cards(["0-AC", "0-AD", "0-AH"]);
	expect(
		modernTeamScore({
			melds: [sevens, kings],
			threes,
			hands: [unmelded, []],
			wentOut: false,
		}),
	).toEqual({
		melds: 105,
		canastas: 3000,
		threes: 600,
		specialPenalties: -1500,
		specialHand: 0,
		handPenalty: -60,
		outBonus: 0,
		total: 2145,
	});
});

it("deducts melded cards and exposed threes when no canasta is complete", () => {
	const sevens = cards(["0-7C", "0-7D", "0-7H"]);
	expect(
		modernTeamScore({
			melds: [sevens],
			threes: cards(["0-3H"]),
			hands: [[], []],
			wentOut: false,
		}),
	).toEqual({
		melds: -15,
		canastas: -2500,
		threes: -100,
		specialPenalties: 0,
		specialHand: 0,
		handPenalty: 0,
		outBonus: 0,
		total: -2615,
	});
});

it("uses the declared special-hand score without ordinary team scoring", () => {
	expect(
		modernTeamScore({
			melds: [],
			threes: cards(["0-3H"]),
			hands: [cards(["0-AC"]), []],
			wentOut: true,
			specialHandScore: 2500,
		}),
	).toEqual({
		melds: 0,
		canastas: 0,
		threes: 0,
		specialPenalties: 0,
		specialHand: 2500,
		handPenalty: 0,
		outBonus: 0,
		total: 2500,
	});
});

it("rejects a physical card appearing in two team locations", () => {
	const ace = cards(["0-AC"]);
	expect(
		modernTeamScore({
			melds: [],
			threes: [],
			hands: [ace, ace],
			wentOut: false,
		}),
	).toBeUndefined();
});

it("does not score a meld that violates modern card restrictions", () => {
	expect(
		modernTeamScore({
			melds: [cards(["0-7C", "0-7D", "0-2C"])],
			threes: [],
			hands: [[], []],
			wentOut: false,
		}),
	).toBeUndefined();
});

it("scores exposed threes by color and completed canastas", () => {
	const threes = cards(["0-3H", "1-3H", "0-3C", "1-3C", "0-3S", "1-3S"]);
	expect(modernThreesScore(threes, 0)).toBe(-1300);
	expect(modernThreesScore(threes, 1)).toBe(0);
	expect(modernThreesScore(threes, 2)).toBe(1300);
	expect(modernThreesScore(cards(["0-3H", "0-3C"]), 2)).toBe(200);
	expect(modernCardPoints(cards(["0-3H"])[0] as Card)).toBe(5);
	expect(modernThreesScore(cards(["0-3H", "0-4C"]), 2)).toBeUndefined();
	expect(modernThreesScore(threes, -1)).toBeUndefined();
});

it("scores the three wild-canasta categories and incomplete wild melds", () => {
	const twos = cards(["0-2C", "0-2D", "0-2H", "0-2S", "1-2C", "1-2D", "1-2H"]);
	const jokers = cards(["0-JK0", "0-JK1", "1-JK0", "1-JK1"]);
	expect(modernSpecialMeldScore(twos.slice(0, 6))).toBe(-2000);
	expect(modernSpecialMeldScore(twos)).toBe(3000);
	expect(modernSpecialMeldScore([...jokers, ...twos.slice(0, 3)])).toBe(2500);
	expect(
		modernSpecialMeldScore([...cards(["0-JK0"]), ...twos.slice(0, 6)]),
	).toBe(2000);
});

it("applies the held-card threshold per player and per rank", () => {
	const sevens = cards(["0-7C", "0-7D", "0-7H"]);
	const aces = cards(["0-AC", "0-AD", "0-AH"]);
	expect(
		modernHandThresholdPenalty([sevens.slice(0, 2), sevens.slice(2)]),
	).toBe(0);
	expect(modernHandThresholdPenalty([sevens, []])).toBe(-1500);
	expect(modernHandThresholdPenalty([[...sevens, ...aces], []])).toBe(-3000);
	expect(modernHandThresholdPenalty([sevens, aces])).toBe(-3000);
});
