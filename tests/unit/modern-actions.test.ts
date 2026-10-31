import { expect, it } from "vitest";
import {
	modernPlayableActions,
	modernSearchActions,
} from "../../src/bot/modern-actions";
import { buildDecks } from "../../src/canasta/cards";
import {
	type ModernAction,
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";

it("covers legal meld subsets on a small hand and returns only legal actions", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-8H", "0-8S", "0-2C", "0-5C"];
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const generated = modernSearchActions(hand);
	for (const action of generated)
		expect(modernApplyAction(hand, 0, action).ok).toBe(true);
	const keys = new Set(
		generated
			.filter((action) => action.type === "meld")
			.map((action) => action.cards.toSorted().join(",")),
	);
	for (let mask = 1; mask < 1 << ids.length; mask++) {
		const selected = ids.filter((_, i) => mask & (1 << i));
		const action: ModernAction = { type: "meld", cards: selected };
		if (modernApplyAction(hand, 0, action).ok)
			expect(keys.has(selected.toSorted().join(","))).toBe(true);
	}
	const playable = modernPlayableActions(hand);
	expect(playable.some((action) => action.type === "meld")).toBe(false);
	expect(playable.some((action) => action.type === "discard")).toBe(true);
});

it("retains a meld when a complete 125-point opening and discard are possible", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = [
		"0-AC",
		"0-AD",
		"0-AH",
		"0-AS",
		"1-AC",
		"0-7C",
		"0-7D",
		"0-7H",
		"0-7S",
		"1-7C",
		"0-4C",
		"0-4D",
	];
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const action = modernPlayableActions(hand).find(
		(candidate) =>
			candidate.type === "meld" &&
			candidate.cards.length === 5 &&
			candidate.cards.every((id) => id.includes("-A")),
	);
	expect(action).toBeDefined();
});
