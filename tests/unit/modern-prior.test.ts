import { expect, it } from "vitest";
import {
	MODERN_PRIOR_WEIGHTS,
	modernPriorFeatures,
	modernPriorValue,
} from "../../src/bot/modern-prior";
import { buildDecks } from "../../src/canasta/cards";
import { modernNewHand } from "../../src/canasta/modern-hand";

it("scores incomplete sevens as exposure and completion as a special canasta", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = [
		"0-7C",
		"0-7D",
		"0-7H",
		"0-7S",
		"1-7C",
		"1-7D",
		"1-7H",
		"0-4C",
		"0-4D",
	];
	const cards = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [cards, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: true },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const incomplete = modernPriorFeatures(hand, {
		type: "meld",
		cards: ids.slice(0, 3),
	});
	const complete = modernPriorFeatures(hand, {
		type: "meld",
		cards: ids.slice(0, 7),
	});
	expect(incomplete.specialExposure).toBe(-1);
	expect(complete.specialExposure).toBe(0);
	expect(complete.sevenComplete).toBe(1);
	expect(modernPriorValue(complete, MODERN_PRIOR_WEIGHTS)).toBeGreaterThan(
		modernPriorValue(incomplete, MODERN_PRIOR_WEIGHTS),
	);
});

it("recognizes the hand-penalty relief from discarding a third seven", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const own = deck.filter((card) =>
		["0-7C", "0-7D", "0-7H", "0-4C"].includes(card.id),
	);
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		pile: deck.filter((card) => card.id === "0-5C"),
		stock: deck.filter(
			(card) => !own.some((item) => item.id === card.id) && card.id !== "0-5C",
		),
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const features = modernPriorFeatures(hand, { type: "discard", card: "0-7C" });
	expect(features.sevenHeldRelief).toBe(1);
	expect(features.discardPair).toBe(-2);
});

it("applies a finite optional prior adjustment while preserving the default", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const features = modernPriorFeatures(dealt.hand, { type: "draw" });
	const baseline = modernPriorValue(features, MODERN_PRIOR_WEIGHTS);
	expect(modernPriorValue(features, MODERN_PRIOR_WEIGHTS, 0)).toBe(baseline);
	expect(modernPriorValue(features, MODERN_PRIOR_WEIGHTS, -75)).toBeLessThan(
		baseline,
	);
	expect(() =>
		modernPriorValue(features, MODERN_PRIOR_WEIGHTS, Number.NaN),
	).toThrow();
});
