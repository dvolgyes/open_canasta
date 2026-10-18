import { describe, expect, it } from "vitest";
import { actionLabel, rulesText } from "../../src/bot/canasta-text";
import {
	CLASSIC_RULES,
	DRAW_TWO_RULES,
	FROZEN_PILE_RULES,
	startMatch,
	TWO_CANASTAS_RULES,
	teamOf,
	VIENNESE_RULES,
	viewFor,
} from "../../src/canasta";

describe("rules text", () => {
	it("states the classic rules that a player needs to choose a move", () => {
		expect(rulesText(CLASSIC_RULES)).toEqual([
			"Draw 1 card from the stock, or take the whole discard pile; then discard one card, unless you go out.",
			"A meld holds at least 2 natural cards and at most 3 wild cards. 7 cards make a canasta: a natural one scores 500, a mixed one 300.",
			"The discard pile is frozen for a side before its first meld, and for everyone while it holds a wild card or a red three. A frozen pile can be taken only with a natural pair of its top card's rank from the hand.",
			"A side needs at least 1 canasta to go out.",
			"Going out scores 100. Going out concealed (no meld before, and a canasta of your own in the same turn) scores 200.",
			"Red threes score 100 each, 800 for all four, for a side that has made its first meld; otherwise they count against it.",
		]);
	});

	it.each([
		[
			"frozen pile",
			FROZEN_PILE_RULES,
			"The discard pile is always frozen: it can be taken only with a natural pair of its top card's rank from the hand.",
		],
		[
			"draw two",
			DRAW_TWO_RULES,
			"Draw 2 cards from the stock, or take the whole discard pile; then discard one card, unless you go out.",
		],
		[
			"two canastas",
			TWO_CANASTAS_RULES,
			"A side needs at least 2 canastas to go out.",
		],
	])("names what the %s rules change", (_name, rules, line) => {
		expect(rulesText(rules)).toContain(line);
	});

	it("states each Viennese change", () => {
		const lines = rulesText(VIENNESE_RULES);
		expect(lines).toEqual(
			expect.arrayContaining([
				"A meld holds at least 2 natural cards and at most 3 wild cards, and never more wild cards than natural cards. 7 cards make a canasta: a natural one scores 500, a mixed one 300.",
				"A side cannot take the pile while its top card is of a rank in which the side has a canasta.",
				"Going out scores 100. Going out concealed (no meld before, and a canasta of your own in the same turn) scores 1000. Going out concealed on the side's earlier canasta scores 200. Taking the pile in that turn loses the concealed bonus.",
				"Red threes score 100 each, 800 for all four, for a side that has a canasta; otherwise they count against it.",
			]),
		);
	});
});

describe("action labels", () => {
	const match = startMatch(7);
	const view = viewFor(match.hand, match.hand.turn);
	const top = view.pile.at(-1);
	const [first, second] = view.own;

	it("names the hand cards that take the pile", () => {
		if (!top || !first || !second)
			throw new Error("the deal has no pile top or too few cards");
		const label = actionLabel(
			{ type: "takePile", cards: [first.id, second.id] },
			view,
		);
		expect(label).toBe(
			`Take the pile (top ${top.rank}${top.suit ?? ""}) with ${first.rank}${first.suit ?? ""} ${second.rank}${second.suit ?? ""}, as a new meld`,
		);
	});

	it("names the draw at an exhausted stock as the end of the hand", () => {
		expect(actionLabel({ type: "draw" }, { ...view, stockCount: 0 })).toBe(
			"End the hand: the stock is empty",
		);
	});

	// The prompt lists melds by rank, not by id, so the label names the meld by its rank.
	const team = teamOf(match.hand.turn);
	const sevens = {
		id: "m3",
		rank: "7",
		team,
		cards: [
			{ id: "x-7C", rank: "7", suit: "C" },
			{ id: "x-7D", rank: "7", suit: "D" },
			{ id: "x-7S", rank: "7", suit: "S" },
		],
	} as const;
	const teams = view.teams.map((side, index) =>
		index === team ? { ...side, melds: [sevens] } : side,
	) as unknown as typeof view.teams;
	const withSevens = { ...view, teams };

	it("leaves out the hand cards when only the top card goes onto a meld", () => {
		if (!top) throw new Error("the deal has no pile top");
		const label = actionLabel(
			{ type: "takePile", cards: [], extend: "m3" },
			withSevens,
		);
		expect(label).toBe(
			`Take the pile (top ${top.rank}${top.suit ?? ""}), added to your side's meld of 7s`,
		);
	});

	it("names the meld that an extension adds to by its rank", () => {
		if (!first) throw new Error("the deal has no hand cards");
		const label = actionLabel(
			{ type: "extend", meldId: "m3", cards: [first.id] },
			withSevens,
		);
		expect(label).toBe(
			`Add ${first.rank}${first.suit ?? ""} to your side's meld of 7s`,
		);
	});
});
