import { expect, it } from "vitest";
import { playPair } from "../../src/bot/research/arena";
import {
	modernResearchAgent,
	playModernMatch,
} from "../../src/bot/research/modern-arena";
import { modernDiscardCheck } from "../../src/canasta/modern-discard";

it("plays paired headless hands and retains unfinished matches without counting wins", async () => {
	const plan = {
		seed: 111,
		policySeed: 222,
		dealer: 3 as const,
		maxHands: 1,
		maxActionsPerHand: 300,
	};
	const execute: Parameters<typeof playPair>[1] = (leg) =>
		playModernMatch(leg, () => ({
			async decide(observation) {
				const { view } = observation;
				if (view.phase === "draw")
					return {
						ok: true,
						action: { type: "draw" },
						simulations: 0,
						deadlineStopped: false,
					};
				const card = view.hand.find(
					(item) =>
						modernDiscardCheck({
							hand: view.hand,
							card: item.id,
							pileEmpty: view.pile.length === 0,
							closedRanks: [],
							mayGoOut: false,
							wildOnlyForced: false,
						}).ok,
				);
				return card
					? {
							ok: true,
							action: { type: "discard", card: card.id },
							simulations: 0,
							deadlineStopped: false,
						}
					: { ok: false, reason: "no discard" };
			},
		}));
	const paired = await playPair(plan, execute);
	expect(paired.score).toBeNull();
	expect(paired.legs.map((leg) => leg.plan.aTeam)).toEqual([0, 1]);
	for (const leg of paired.legs) {
		expect(leg.status).toBe("incomplete");
		expect(leg.reason).toBe("hand cap");
		expect(leg.aWin).toBeNull();
		expect(leg.actions).toBeGreaterThan(10);
	}
	expect(paired.legs[0].scores).toEqual(paired.legs[1].scores);
}, 15000);

it("rejects invalid research search budgets", () => {
	expect(() =>
		modernResearchAgent({
			priorWeights: null,
			simulations: 0,
			timeMs: 1000,
			depth: 3,
		}),
	).toThrow(/budget/);
	expect(() =>
		modernResearchAgent({
			priorWeights: null,
			simulations: 2,
			timeMs: Number.NaN,
			depth: 3,
		}),
	).toThrow(/budget/);
});
