import { expect, it } from "vitest";
import { inferCards } from "../../src/bot/card-knowledge";
import { inferModern } from "../../src/bot/modern-inference";
import { buildDecks } from "../../src/canasta/cards";
import { modernNewHand } from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { cardFace } from "../../src/game/canasta-history";
import { recordModernTransfer } from "../../src/game/modern-history";

it("remembers a pile pickup without identifying which identical copy was later discarded", () => {
	const result = modernNewHand({ seed: 0, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const ids: readonly [string, string, string, string] = [
		"0-4C",
		"0-KS",
		"1-KS",
		"0-5C",
	];
	const before = {
		...result.hand,
		hands: [[get(ids[0])], [get(ids[1]), get(ids[3])], [], []] as const,
		pile: [get(ids[2])],
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
		bonuses: [[], [], [], []] as const,
	};
	const pickup = {
		...before,
		hands: [
			before.hands[0],
			[...before.hands[1], get(ids[2])],
			[],
			[],
		] as const,
		pile: [],
	};
	const discard = {
		...pickup,
		hands: [
			pickup.hands[0],
			pickup.hands[1].filter((card) => card.id !== ids[1]),
			[],
			[],
		] as const,
		pile: [get(ids[1])],
	};
	const first = recordModernTransfer(undefined, before, pickup);
	const history = recordModernTransfer(first, pickup, discard);
	expect(history.events.filter((event) => event.player === 1)).toEqual([
		{ player: 1, gained: ["KS"], removed: [], drawn: 0 },
		{ player: 1, gained: [], removed: ["KS"], drawn: 0 },
	]);
	const belief = inferCards({
		deck: deck.map(cardFace),
		observer: 0,
		own: before.hands[0].map(cardFace),
		publicCards: discard.pile.map(cardFace),
		counts: [
			...discard.hands.map((hand) => hand.length),
			...discard.bonuses.map((bonus) => bonus.length),
		],
		history,
	});
	expect(belief.players[1]?.minimum.KS).toBe(0);
	expect(belief.players[1]?.maximum.KS).toBe(1);
	const modernBelief = inferModern(modernViewFor(discard, 0), 0, history);
	expect(modernBelief.players[1]?.minimum.KS).toBe(0);
	expect(modernBelief.players[1]?.maximum.KS).toBe(1);
});

it("moves a face-down bonus into a hand without revealing its face", () => {
	const result = modernNewHand({ seed: 0, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const card = result.hand.stock[0];
	if (!card) throw new Error("missing stock card");
	const before = {
		...result.hand,
		stock: result.hand.stock.slice(1),
		bonuses: [[], [card], [], []] as const,
	};
	const after = {
		...before,
		hands: [
			before.hands[0],
			[...before.hands[1], card],
			before.hands[2],
			before.hands[3],
		] as const,
		bonuses: [[], [], [], []] as const,
	};
	const history = recordModernTransfer(undefined, before, after);
	expect(history.events).toContainEqual({
		player: 1,
		gained: [],
		removed: [],
		drawn: 1,
	});
	expect(history.events).toContainEqual({
		player: 5,
		gained: [],
		removed: [],
		drawn: 0,
		unknownRemoved: 1,
	});
	expect(JSON.stringify(history)).not.toContain(card.id);
});
