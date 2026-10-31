import { expect, it } from "vitest";
import { modernActionKey } from "../../src/bot/modern-actions";
import { observeModern } from "../../src/bot/modern-inference";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import { playPair } from "../../src/bot/research/arena";
import {
	modernResearchAgent,
	playModernMatch,
} from "../../src/bot/research/modern-arena";
import { modernDiscardCheck } from "../../src/canasta/modern-discard";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";

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
			priorWeights: MODERN_PRIOR_WEIGHTS,
			priorWeight: -1,
			simulations: 2,
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

it("uses each research policy's configured prior strength", async () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const observation = observeModern(drawn.hand, 0);
	const choose = (priorWeight: number) =>
		modernResearchAgent({
			priorWeights: MODERN_PRIOR_WEIGHTS,
			priorWeight,
			simulations: 8,
			timeMs: 30000,
			depth: 3,
		}).decide(observation, { handNo: 1, rng: mulberry32(91) });
	const low = await choose(0);
	const high = await choose(100);
	const defaultAgent = modernResearchAgent({
		priorWeights: MODERN_PRIOR_WEIGHTS,
		simulations: 8,
		timeMs: 30000,
		depth: 3,
	});
	const defaultResult = await defaultAgent.decide(observation, {
		handNo: 1,
		rng: mulberry32(91),
	});
	const explicitDefault = await choose(1);
	if (!low.ok || !high.ok) throw new Error("search did not finish");
	if (!defaultResult.ok || !explicitDefault.ok)
		throw new Error("default search did not finish");
	expect(low.simulations).toBe(8);
	expect(high.simulations).toBe(8);
	expect(modernActionKey(drawn.hand, defaultResult.action)).toBe(
		modernActionKey(drawn.hand, explicitDefault.action),
	);
	expect(modernActionKey(drawn.hand, low.action)).not.toBe(
		modernActionKey(drawn.hand, high.action),
	);
}, 30000);
