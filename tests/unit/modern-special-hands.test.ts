import { expect, it } from "vitest";
import { buildDecks, type Rank } from "../../src/canasta/cards";
import {
	type ModernAction,
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { modernSpecialHands } from "../../src/canasta/modern-special-hands";
import { modernScoreHand } from "../../src/canasta/modern-special-scoring";

const deck = buildDecks();
function cards(shape: readonly (readonly [Rank, number])[]) {
	return shape.flatMap(([rank, count]) =>
		deck.filter((card) => card.rank === rank).slice(0, count),
	);
}

it("recognizes the five provisional modern special hands at their specified values", () => {
	const examples = [
		{
			kind: "natural-pairs",
			score: 2500,
			hand: cards([
				["4", 2],
				["5", 2],
				["6", 2],
				["7", 2],
				["8", 2],
				["9", 2],
				["K", 2],
			]),
		},
		{
			kind: "wild-pairs",
			score: 2000,
			hand: cards([
				["A", 2],
				["7", 2],
				["4", 2],
				["5", 2],
				["6", 2],
				["8", 2],
				["2", 2],
			]),
		},
		{
			kind: "miami-pairs",
			score: 2500,
			hand: cards([
				["A", 2],
				["7", 2],
				["4", 2],
				["5", 2],
				["6", 2],
				["2", 2],
				["JK", 2],
			]),
		},
		{
			kind: "garbage",
			score: 3000,
			hand: cards([
				["4", 4],
				["5", 4],
				["6", 3],
				["7", 3],
			]),
		},
		{
			kind: "zip-code",
			score: 2500,
			hand: cards([
				["4", 4],
				["5", 3],
				["6", 3],
				["7", 2],
				["2", 2],
			]),
		},
	] as const;
	for (const { kind, score, hand } of examples) {
		expect(modernSpecialHands(hand)).toContainEqual({ kind, score });
	}
});

it("rejects duplicate physical cards, threes and invalid wild-pair composition", () => {
	const valid = cards([
		["A", 2],
		["7", 2],
		["4", 2],
		["5", 2],
		["6", 2],
		["8", 2],
		["2", 2],
	]);
	const first = valid[0];
	const three = cards([["3", 1]])[0];
	if (!first || !three) throw new Error("missing fixture cards");
	expect(modernSpecialHands([...valid.slice(0, 13), first])).toEqual([]);
	expect(modernSpecialHands([...valid.slice(0, 13), three])).toEqual([]);
	const missingSeven = cards([
		["A", 2],
		["9", 2],
		["4", 2],
		["5", 2],
		["6", 2],
		["8", 2],
		["2", 2],
	]);
	expect(
		modernSpecialHands(missingSeven).some(
			(result) => result.kind === "wild-pairs",
		),
	).toBe(false);
	const fake = { ...first, rank: "K" as const };
	expect(modernSpecialHands([fake, ...valid.slice(1)])).toEqual([]);
});

it("declares a valid special hand only after a stock draw and computes its score", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const winning = cards([
		["4", 2],
		["5", 2],
		["6", 2],
		["7", 2],
		["8", 2],
		["9", 2],
		["K", 2],
	]);
	const last = winning[13];
	if (!last) throw new Error("missing draw card");
	const ids = new Set(winning.map((card) => card.id));
	const base = {
		...dealt.hand.turnStart,
		hands: [winning.slice(0, 13), [], [], []] as const,
		stock: [last, ...deck.filter((card) => !ids.has(card.id))],
		pile: [],
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const declaration: ModernAction = { type: "special", kind: "natural-pairs" };
	expect(modernApplyAction(hand, 0, declaration).ok).toBe(false);
	const drawn = modernApplyAction(hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	expect(
		modernApplyAction(drawn.hand, 0, { type: "special", kind: "garbage" }).ok,
	).toBe(false);
	const declared = modernApplyAction(drawn.hand, 0, declaration);
	if (!declared.ok) throw new Error(declared.reason);
	expect(declared.hand.outcome).toEqual({
		kind: "special",
		seat: 0,
		score: 2500,
	});
	expect(modernScoreHand(declared.hand)?.[0].total).toBe(2500);
});
