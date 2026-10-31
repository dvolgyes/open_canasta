import { expect, it } from "vitest";
import { buildDecks, type Card } from "../../src/canasta";
import { modernOpeningCheck } from "../../src/canasta/modern-opening";

const deck = buildDecks();
const cards = (ids: readonly string[]): Card[] =>
	ids.map((id) => {
		const card = deck.find((candidate) => candidate.id === id);
		if (!card) throw new Error(`missing card ${id}`);
		return card;
	});
const aces = cards(["0-AC", "0-AD", "0-AH"]);
const kings = cards(["0-KC", "0-KD", "0-KH", "0-KS"]);
const sevens = cards(["0-7C", "0-7D", "0-7H", "0-7S", "1-7C"]);

it("uses the score-dependent opening thresholds", () => {
	const melds = [aces, kings, sevens]; // 60 + 40 + 25 = 125.
	expect(
		modernOpeningCheck({ teamScore: 2999, melds, ineligible: [] }),
	).toMatchObject({ ok: true, points: 125, minimum: 125 });
	expect(
		modernOpeningCheck({ teamScore: 3000, melds, ineligible: [] }),
	).toMatchObject({ ok: false, points: 125, minimum: 155 });
	expect(
		modernOpeningCheck({ teamScore: 5000, melds, ineligible: [] }),
	).toMatchObject({ ok: false, points: 125, minimum: 180 });
});

it("accepts the higher opening thresholds exactly", () => {
	const sevenThree = cards(["0-7C", "0-7D", "0-7H"]);
	const kingsWithTwoWilds = cards([
		"0-KC",
		"0-KD",
		"0-KH",
		"0-KS",
		"0-2C",
		"0-2D",
	]);
	const kingsWithJoker = cards(["0-KC", "0-KD", "0-KH", "0-KS", "0-JK0"]);
	const sixSevens = cards(["0-7C", "0-7D", "0-7H", "0-7S", "1-7C", "1-7D"]);
	expect(
		modernOpeningCheck({
			teamScore: 3000,
			melds: [aces, kingsWithTwoWilds, sevenThree],
			ineligible: [],
		}),
	).toMatchObject({ ok: true, points: 155, minimum: 155 });
	expect(
		modernOpeningCheck({
			teamScore: 5000,
			melds: [aces, kingsWithJoker, sixSevens],
			ineligible: [],
		}),
	).toMatchObject({ ok: true, points: 180, minimum: 180 });
});

it("does not count pile cards toward opening points or the clean triple", () => {
	const acesWithTop = cards(["0-AC", "0-AD", "0-AH"]);
	const mixedKings = cards(["0-KC", "0-KD", "0-2C"]);
	const queens = cards(["0-QC", "0-QD", "0-2D", "0-2H"]);
	const melds = [acesWithTop, mixedKings, queens];
	// The top ace cannot complete the only clean triple, even when points are sufficient.
	expect(
		modernOpeningCheck({ teamScore: 0, melds, ineligible: ["0-AH"] }),
	).toMatchObject({ ok: false, reason: "opening needs a clean triple" });
	// A pile card cannot supply the last points toward 125.
	expect(
		modernOpeningCheck({
			teamScore: 0,
			melds: [aces, kings, sevens],
			ineligible: ["1-7C"],
		}),
	).toMatchObject({ ok: false, points: 120, minimum: 125 });
});

it("rejects duplicate physical cards while allowing both copies of a face", () => {
	expect(
		modernOpeningCheck({
			teamScore: 0,
			melds: [aces, kings, [...sevens, sevens[0] as Card]],
			ineligible: [],
		}).ok,
	).toBe(false);
	expect(
		modernOpeningCheck({
			teamScore: 0,
			melds: [aces, kings, sevens],
			ineligible: [],
		}).ok,
	).toBe(true);
});

it("permits a mixed meld laid before starting an unfinished wild meld", () => {
	const mixedKings = cards(["0-KC", "0-KD", "0-2C"]);
	const wilds = cards(["0-2D", "0-2H", "0-JK0"]);
	expect(
		modernOpeningCheck({
			teamScore: 0,
			melds: [aces, mixedKings, wilds],
			ineligible: [],
		}),
	).toMatchObject({ ok: true, points: 190 });
});

it("does not allow a mixed canasta in the initial meld", () => {
	const mixedKings = cards([
		"0-KC",
		"0-KD",
		"0-KH",
		"0-KS",
		"1-KC",
		"0-2C",
		"0-2D",
	]);
	expect(
		modernOpeningCheck({
			teamScore: 0,
			melds: [aces, mixedKings],
			ineligible: [],
		}).ok,
	).toBe(false);
});
