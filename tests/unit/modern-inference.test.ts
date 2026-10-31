import { expect, it } from "vitest";
import { knownCards, sampleCards } from "../../src/bot/card-knowledge";
import {
	inferModern,
	sampleModernAtTurnStart,
} from "../../src/bot/modern-inference";
import { modernNewHand } from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { mulberry32 } from "../../src/canasta/random";

it("infers and samples a complete modern deal from only the observing seat's view", () => {
	const result = modernNewHand({ seed: 42, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const view = modernViewFor(result.hand, 0);
	const belief = inferModern(view, 0);
	const own = belief.players[0];
	if (!own) throw new Error("missing observer row");
	expect(knownCards(own).unknown).toBe(0);
	expect(belief.players.map((row) => row.count)).toEqual([
		...view.handCounts,
		...view.bonusCounts,
		view.stockCount,
	]);
	for (let seed = 0; seed < 8; seed++) {
		const sample = sampleCards(belief, mulberry32(seed));
		expect(sample[0]?.toSorted()).toEqual(
			view.hand.map((card) => `${card.rank}${card.suit ?? ""}`).toSorted(),
		);
		for (const hand of sample.slice(0, 4))
			expect(hand.some((face) => face.startsWith("3"))).toBe(false);
		expect(
			sample.flat().length + view.teams.flatMap((team) => team.threes).length,
		).toBe(108);
	}
	const sampled = sampleModernAtTurnStart(view, 0, belief, mulberry32(7));
	const all = [
		...sampled.hands.flat(),
		...sampled.bonuses.flat(),
		...sampled.stock,
		...sampled.pile,
		...sampled.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((meld) => meld.cards),
		]),
	];
	expect(all).toHaveLength(108);
	expect(new Set(all.map((card) => card.id)).size).toBe(108);
	expect(sampled.hands[0]).toEqual(view.hand);
	expect(modernViewFor(sampled, 0)).toEqual(view);
	const a = result.hand.hands[1][0];
	const b = result.hand.hands[2][0];
	if (!a || !b) throw new Error("missing hidden cards");
	const swapped = {
		...result.hand,
		hands: [
			result.hand.hands[0],
			[b, ...result.hand.hands[1].slice(1)],
			[a, ...result.hand.hands[2].slice(1)],
			result.hand.hands[3],
		] as const,
	};
	const otherView = modernViewFor(swapped, 0);
	const otherBelief = inferModern(otherView, 0);
	expect(
		sampleModernAtTurnStart(otherView, 0, otherBelief, mulberry32(7)),
	).toEqual(sampled);
});
