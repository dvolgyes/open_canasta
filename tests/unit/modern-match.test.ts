import { expect, it } from "vitest";
import {
	modernNextHand,
	modernSettleHand,
	modernStartMatch,
} from "../../src/canasta/modern-match";
import { modernScoreHand } from "../../src/canasta/modern-special-scoring";

it("settles a completed hand once and rotates the dealer for a new hand", () => {
	const result = modernStartMatch(123, 2);
	if (!result.ok) throw new Error(result.reason);
	const initial = result.match;
	expect(modernStartMatch(123, 2)).toEqual(result);
	expect(modernSettleHand(initial).ok).toBe(false);
	expect(modernNextHand(initial).ok).toBe(false);
	const ended = {
		...initial,
		hand: { ...initial.hand, outcome: { kind: "stock" as const } },
	};
	const score = modernScoreHand(ended.hand);
	if (!score) throw new Error("fixture cannot be scored");
	const settled = modernSettleHand(ended);
	if (!settled.ok) throw new Error(settled.reason);
	expect(settled.match.scores).toEqual([score[0].total, score[1].total]);
	expect(modernSettleHand(settled.match).ok).toBe(false);
	const next = modernNextHand(settled.match);
	if (!next.ok) throw new Error(next.reason);
	expect(next.match.handNo).toBe(2);
	expect(next.match.dealer).toBe(3);
	expect(next.match.hand.teamScores).toEqual(settled.match.scores);
	expect(next.match.hand.outcome).toBeNull();
	expect(next.match.settled).toBe(false);
});

it("ends at 8500 for the higher score and continues a tied match", () => {
	const result = modernStartMatch(9, 0);
	if (!result.ok) throw new Error(result.reason);
	const hand = { ...result.match.hand, outcome: { kind: "stock" as const } };
	const score = modernScoreHand(hand);
	if (!score) throw new Error("fixture cannot be scored");
	const make = (a: number, b: number) => ({
		...result.match,
		hand,
		scores: [a - score[0].total, b - score[1].total] as const,
	});
	const won = modernSettleHand(make(8500, 8495));
	if (!won.ok) throw new Error(won.reason);
	expect(won.match.winner).toBe(0);
	expect(modernNextHand(won.match).ok).toBe(false);
	const tie = modernSettleHand(make(8500, 8500));
	if (!tie.ok) throw new Error(tie.reason);
	expect(tie.match.winner).toBeNull();
	expect(modernNextHand(tie.match).ok).toBe(true);
	expect(modernStartMatch(-1, 0).ok).toBe(false);
});
