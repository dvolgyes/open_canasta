import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { buildDecks } from "../../src/canasta/cards";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";

function startWith(ownIds: readonly string[]) {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const kings = deck.filter((card) => card.rank === "K").slice(0, 7);
	const queens = deck.filter((card) => card.rank === "Q").slice(0, 7);
	const excluded = [
		...ownIds,
		"0-2D",
		"0-4C",
		...kings.map((card) => card.id),
		...queens.map((card) => card.id),
	];
	const others = deck
		.filter((card) => !excluded.includes(card.id) && card.rank !== "3")
		.slice(0, 33);
	const occupied = [...excluded, ...others.map((card) => card.id)];
	const start = {
		...dealt.hand.turnStart,
		hands: [
			ownIds.map(get),
			others.slice(0, 11),
			others.slice(11, 22),
			others.slice(22),
		] as const,
		stock: [get("0-2D"), ...deck.filter((card) => !occupied.includes(card.id))],
		pile: [get("0-4C")],
		teams: [
			{
				opened: true,
				threes: [],
				melds: [
					{
						id: "kings",
						kind: "natural" as const,
						rank: "K" as const,
						cards: kings,
					},
					{
						id: "queens",
						kind: "natural" as const,
						rank: "Q" as const,
						cards: queens,
					},
				],
			},
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	return { ...start, turnStart: start, undo: [] };
}

it("returns a legal forced wild discard at zero thinking time", async () => {
	const hand = startWith(["0-2C"]);
	const drawn = modernApplyAction(hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const result = await chooseModernPosition(observeModern(drawn.hand, 0), {
		timeMs: 0,
	});
	if (!result.action) throw new Error("missing forced wild discard");
	expect(result.action.type).toBe("discard");
	expect(modernApplyAction(drawn.hand, 0, result.action).ok).toBe(true);
});

it("does not fall back to a wild discard made illegal by an earlier meld", async () => {
	const hand = startWith(["0-2C", "0-9C", "0-9D", "0-9H"]);
	const drawn = modernApplyAction(hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const melded = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-9C", "0-9D", "0-9H"],
	});
	if (!melded.ok) throw new Error(melded.reason);
	expect(
		modernApplyAction(melded.hand, 0, { type: "discard", card: "0-2C" }).ok,
	).toBe(false);
	const result = await chooseModernPosition(observeModern(melded.hand, 0), {
		timeMs: 0,
	});
	if (!result.action) throw new Error("missing legal fallback");
	expect(result.action.type).not.toBe("discard");
	expect(modernApplyAction(melded.hand, 0, result.action).ok).toBe(true);
});
