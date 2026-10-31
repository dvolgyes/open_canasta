import { expect, it } from "vitest";
import {
	modernActionKey,
	modernPlayableActions,
	modernSearchActions,
} from "../../src/bot/modern-actions";
import { buildDecks } from "../../src/canasta/cards";
import {
	type ModernAction,
	type ModernHandState,
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

it("matches exhaustive turn completion for small initial meld choices", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = [
		"0-AC",
		"0-AD",
		"0-AH",
		"0-JK0",
		"0-JK1",
		"1-JK0",
		"0-4C",
		"0-5C",
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
	const memo = new Map<string, boolean>();
	const brute = (position: ModernHandState): boolean => {
		if (position.outcome || position.turn !== 0) return true;
		const key = JSON.stringify({
			hand: position.hands[0].map((card) => card.id).toSorted(),
			opened: position.teams[0].opened,
			melds: position.teams[0].melds
				.map((meld) => meld.cards.map((card) => card.id).toSorted())
				.toSorted((a, b) => a.join(",").localeCompare(b.join(","))),
		});
		const cached = memo.get(key);
		if (cached !== undefined) return cached;
		for (const card of position.hands[0])
			if (
				modernApplyAction(position, 0, { type: "discard", card: card.id }).ok
			) {
				memo.set(key, true);
				return true;
			}
		const actions: ModernAction[] = [{ type: "commit-opening" }];
		const cards = position.hands[0];
		for (let mask = 1; mask < 1 << cards.length; mask++) {
			const selected = cards
				.filter((_, i) => mask & (1 << i))
				.map((card) => card.id);
			actions.push({ type: "meld", cards: selected });
			for (const meld of position.teams[0].melds)
				actions.push({ type: "extend", meldId: meld.id, cards: selected });
		}
		for (const action of actions) {
			const step = modernApplyAction(position, 0, action);
			if (step.ok && brute(step.hand)) {
				memo.set(key, true);
				return true;
			}
		}
		memo.set(key, false);
		return false;
	};
	const candidates: ModernAction[] = [
		{ type: "meld", cards: ids.slice(0, 3) },
		{ type: "meld", cards: ids.slice(3, 6) },
		{ type: "meld", cards: ["0-AC", "0-AD", "0-JK0"] },
	];
	const keys = new Set(
		modernPlayableActions(hand).map((action) => modernActionKey(hand, action)),
	);
	const expected: boolean[] = [];
	for (const action of candidates) {
		const step = modernApplyAction(hand, 0, action);
		if (!step.ok) throw new Error(step.reason);
		const possible = brute(step.hand);
		expected.push(possible);
		expect(keys.has(modernActionKey(hand, action))).toBe(possible);
	}
	expect(expected).toEqual([true, true, false]);
	for (const action of modernSearchActions(hand)) {
		if (action.type !== "meld") continue;
		const step = modernApplyAction(hand, 0, action);
		if (!step.ok) throw new Error(step.reason);
		expect(keys.has(modernActionKey(hand, action))).toBe(brute(step.hand));
	}
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

it("finds a valid opening after taking a pile with an identical top-card face", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = [
		"0-8C",
		"0-8D",
		"0-AC",
		"0-AD",
		"0-AH",
		"0-JK0",
		"0-JK1",
		"1-JK0",
		"0-4C",
	];
	const pile = ["0-5C", "1-8C"];
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const base = {
		...dealt.hand.turnStart,
		hands: [ids.map(get), [], [], []] as const,
		pile: pile.map(get),
		stock: deck.filter((card) => ![...ids, ...pile].includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const pickup = modernApplyAction(hand, 0, {
		type: "take-pile",
		cards: ids.slice(0, 2),
	});
	if (!pickup.ok) throw new Error(pickup.reason);
	const choices = modernPlayableActions(pickup.hand);
	expect(
		choices.some(
			(action) =>
				action.type === "meld" &&
				action.cards.length === 3 &&
				action.cards.every((id) => id.includes("-A")),
		),
	).toBe(true);
});
