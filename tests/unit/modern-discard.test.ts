import { expect, it } from "vitest";
import { buildDecks, type Card } from "../../src/canasta";
import { modernDiscardCheck } from "../../src/canasta/modern-discard";

const deck = buildDecks();
const cards = (ids: readonly string[]): Card[] =>
	ids.map((id) => {
		const card = deck.find((candidate) => candidate.id === id);
		if (!card) throw new Error(`missing card ${id}`);
		return card;
	});
const check = (
	hand: readonly string[],
	card: string,
	options: {
		pileEmpty?: boolean;
		closedRanks?: readonly "K"[];
		mayGoOut?: boolean;
		wildOnlyForced?: boolean;
	} = {},
) =>
	modernDiscardCheck({
		hand: cards(hand),
		card,
		pileEmpty: options.pileEmpty ?? false,
		closedRanks: options.closedRanks ?? [],
		mayGoOut: options.mayGoOut ?? false,
		wildOnlyForced: options.wildOnlyForced ?? false,
	});

it("blocks sevens, aces, wilds, and dead cards on an empty pile", () => {
	for (const card of ["0-7C", "0-AC", "0-2C", "0-KC"])
		expect(
			check([card, "0-4C"], card, { pileEmpty: true, closedRanks: ["K"] }).ok,
		).toBe(false);
	expect(check(["0-7C", "0-4C"], "0-7C").ok).toBe(true);
	expect(check(["0-KC", "0-4C"], "0-KC", { closedRanks: ["K"] }).ok).toBe(true);
});

it("forbids discarding a three and enforces the conditions for wild discards", () => {
	expect(check(["0-3C", "0-4C"], "0-3C").ok).toBe(false);
	expect(check(["0-2C", "0-4C"], "0-2C", { wildOnlyForced: true }).ok).toBe(
		false,
	);
	expect(check(["0-2C", "0-2D"], "0-2C").ok).toBe(false);
	expect(check(["0-2C", "0-2D"], "0-2C", { wildOnlyForced: true }).ok).toBe(
		true,
	);
	expect(check(["0-2C"], "0-2C", { mayGoOut: true }).ok).toBe(true);
});

it("requires going-out permission and a legal discard even for the last card", () => {
	expect(check(["0-4C"], "0-4C").ok).toBe(false);
	expect(check(["0-4C"], "0-4C", { mayGoOut: true }).ok).toBe(true);
	expect(check(["0-7C"], "0-7C", { mayGoOut: true, pileEmpty: true }).ok).toBe(
		false,
	);
	expect(check(["0-4C"], "0-5C", { mayGoOut: true }).ok).toBe(false);
});
