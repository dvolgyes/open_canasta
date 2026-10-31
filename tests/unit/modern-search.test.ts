import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import {
	chooseModern,
	chooseModernPosition,
} from "../../src/bot/modern-search";
import { buildDecks } from "../../src/canasta/cards";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { mulberry32 } from "../../src/canasta/random";

it("compares drawing and taking the pile with UCB simulations", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const used = ["0-8C", "0-8D", "0-4C", "0-5C", "1-8C", "0-KC", "0-KD", "0-KH"];
	const base = {
		...dealt.hand.turnStart,
		hands: [[get("0-8C"), get("0-8D"), get("0-4C")], [], [], []] as const,
		pile: [get("0-5C"), get("1-8C")],
		stock: deck.filter((card) => !used.includes(card.id)),
		teams: [
			{
				opened: true,
				threes: [],
				melds: [
					{
						id: "m1",
						kind: "natural" as const,
						rank: "K" as const,
						cards: [get("0-KC"), get("0-KD"), get("0-KH")],
					},
				],
			},
			{ opened: false, threes: [], melds: [] },
		] as const,
		nextMeldNo: 2,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const result = await chooseModern(modernViewFor(hand, 0), 0, {
		timeMs: 20000,
		maxIterations: 2,
		maxDepth: 2,
		rng: mulberry32(7),
		priorWeights: null,
	});
	expect(result.iterations).toBe(2);
	expect(result.choices.map((choice) => choice.action.type).toSorted()).toEqual(
		["draw", "take-pile"],
	);
	if (!result.action) throw new Error("missing search action");
	expect(modernApplyAction(hand, 0, result.action).ok).toBe(true);
}, 30000);

it("returns a legal fallback when no thinking time is available", async () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const result = await chooseModern(modernViewFor(dealt.hand, 0), 0, {
		timeMs: 0,
	});
	expect(result.iterations).toBe(0);
	expect(result.action).toEqual({ type: "draw" });
});

it("chooses a legal action after the player has drawn", async () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const immediate = await chooseModernPosition(observeModern(drawn.hand, 0), {
		timeMs: 0,
	});
	if (!immediate.action)
		throw new Error("missing zero-budget action after draw");
	expect(modernApplyAction(drawn.hand, 0, immediate.action).ok).toBe(true);
	const result = await chooseModernPosition(observeModern(drawn.hand, 0), {
		timeMs: 1000,
		maxIterations: 1,
		maxDepth: 1,
		rng: mulberry32(11),
	});
	if (!result.action) throw new Error("missing action after draw");
	expect(modernApplyAction(drawn.hand, 0, result.action).ok).toBe(true);
}, 10000);

it("uses a one-card retraction as the fallback when the tray is empty", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-8H", "0-8S", "0-7C", "0-AC"];
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
			{ opened: true, threes: [], melds: [] },
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const meld = modernApplyAction(hand, 0, {
		type: "meld",
		cards: ids.slice(0, 4),
	});
	if (!meld.ok) throw new Error(meld.reason);
	const result = await chooseModernPosition(observeModern(meld.hand, 0), {
		timeMs: 0,
	});
	expect(result.action).toEqual({ type: "retract" });
	const applied = modernApplyAction(meld.hand, 0, { type: "retract" });
	if (!applied.ok) throw new Error(applied.reason);
	expect(applied.hand.teams[0].melds[0]?.cards).toHaveLength(3);
});
