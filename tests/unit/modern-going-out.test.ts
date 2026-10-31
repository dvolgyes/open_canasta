import { expect, it } from "vitest";
import { buildDecks, type Card } from "../../src/canasta";
import { modernGoingOutCheck } from "../../src/canasta/modern-going-out";

const deck = buildDecks();
const cards = (ids: readonly string[]): Card[] =>
	ids.map((id) => {
		const card = deck.find((candidate) => candidate.id === id);
		if (!card) throw new Error(`missing card ${id}`);
		return card;
	});
const kings = cards(["0-KC", "0-KD", "0-KH", "0-KS", "1-KC", "1-KD", "1-KH"]);
const queens = cards(["0-QC", "0-QD", "0-QH", "0-QS", "1-QC", "1-QD", "1-QH"]);

it("requires an opening and two completed canastas", () => {
	expect(
		modernGoingOutCheck({ melds: [kings], openingSatisfied: true }).ok,
	).toBe(false);
	expect(
		modernGoingOutCheck({ melds: [kings, queens], openingSatisfied: false }).ok,
	).toBe(false);
	expect(
		modernGoingOutCheck({ melds: [kings, queens], openingSatisfied: true }).ok,
	).toBe(true);
});

it("blocks incomplete pure ace, seven, and wild melds", () => {
	for (const extra of [
		cards(["0-AC", "0-AD", "0-AH"]),
		cards(["0-7C", "0-7D", "0-7H"]),
		cards(["0-2C", "0-2D", "0-JK0"]),
	])
		expect(
			modernGoingOutCheck({
				melds: [kings, queens, extra],
				openingSatisfied: true,
			}).ok,
		).toBe(false);
	const mixedAces = cards(["0-AC", "0-AD", "0-2C"]);
	expect(
		modernGoingOutCheck({
			melds: [kings, queens, mixedAces],
			openingSatisfied: true,
		}).ok,
	).toBe(true);
});
