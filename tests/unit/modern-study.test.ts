import { expect, it } from "vitest";
import { modernActionKey } from "../../src/bot/modern-actions";
import { observeModern } from "../../src/bot/modern-inference";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import { modernResearchAgent } from "../../src/bot/research/modern-arena";
import {
	modernStudyAgentConfig,
	modernStudyBudgets,
	modernStudyPlan,
	parseModernStudyConfig,
} from "../../src/bot/research/modern-study";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";

it("validates local paired studies and uses disjoint seed namespaces", () => {
	const input = {
		version: 1,
		seed: 123,
		split: 3,
		pairs: 50,
		maxHands: 100,
		maxActionsPerHand: 300,
		simulations: 2,
		timeMs: 5000,
		depth: 3,
		a: MODERN_PRIOR_WEIGHTS,
		b: null,
	};
	const result = parseModernStudyConfig(input);
	if (!result.ok) throw new Error(result.reason);
	expect(Object.hasOwn(result.config, "aPriorWeight")).toBe(false);
	expect(Object.hasOwn(result.config, "bPriorWeight")).toBe(false);
	expect(Object.hasOwn(result.config, "aSevenBlockedV1Weight")).toBe(false);
	expect(Object.hasOwn(result.config, "aKnownPairV1Weight")).toBe(false);
	expect(Object.hasOwn(result.config, "aDiscardRiskV1Weight")).toBe(false);
	expect(Object.hasOwn(result.config, "aPairThreatV1Weight")).toBe(false);
	const first = modernStudyPlan(result.config, 0, 0);
	const opposite = modernStudyPlan(result.config, 0, 1);
	expect(first.seed).toBe(opposite.seed);
	expect(first.policySeed).toBe(opposite.policySeed);
	expect(first.aTeam).toBe(0);
	expect(opposite.aTeam).toBe(1);
	expect(modernStudyPlan({ ...result.config, split: 4 }, 0, 0).seed).not.toBe(
		first.seed,
	);
	expect(parseModernStudyConfig({ ...input, simulations: 0 }).ok).toBe(false);
	expect(
		parseModernStudyConfig({
			...input,
			a: { ...MODERN_PRIOR_WEIGHTS, sevenComplete: Number.NaN },
		}).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, pairs: 0 }).ok).toBe(false);
	const strengths = parseModernStudyConfig({
		...input,
		aPriorWeight: 0,
		bPriorWeight: 10,
	});
	if (!strengths.ok) throw new Error(strengths.reason);
	expect(strengths.config.aPriorWeight).toBe(0);
	expect(strengths.config.bPriorWeight).toBe(10);
	expect(parseModernStudyConfig({ ...input, aPriorWeight: -1 }).ok).toBe(false);
	expect(
		parseModernStudyConfig({ ...input, bPriorWeight: Number.NaN }).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, aPriorWeight: undefined }).ok).toBe(
		false,
	);
	const sevenRisk = parseModernStudyConfig({
		...input,
		aSevenBlockedV1Weight: -75,
		bSevenBlockedV1Weight: 0,
	});
	if (!sevenRisk.ok) throw new Error(sevenRisk.reason);
	expect(sevenRisk.config.aSevenBlockedV1Weight).toBe(-75);
	expect(sevenRisk.config.bSevenBlockedV1Weight).toBe(0);
	expect(
		parseModernStudyConfig({ ...input, aSevenBlockedV1Weight: Number.NaN }).ok,
	).toBe(false);
	expect(
		parseModernStudyConfig({ ...input, aSevenBlockedV1Weight: 1000001 }).ok,
	).toBe(false);
	expect(
		parseModernStudyConfig({ ...input, bSevenBlockedV1Weight: 1 }).ok,
	).toBe(false);
	const knownPair = parseModernStudyConfig({
		...input,
		aKnownPairV1Weight: -30,
		bKnownPairV1Weight: 0,
	});
	if (!knownPair.ok) throw new Error(knownPair.reason);
	expect(knownPair.config.aKnownPairV1Weight).toBe(-30);
	expect(knownPair.config.bKnownPairV1Weight).toBe(0);
	expect(
		parseModernStudyConfig({ ...input, aKnownPairV1Weight: Number.NaN }).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, bKnownPairV1Weight: 1 }).ok).toBe(
		false,
	);
	const discardRisk = parseModernStudyConfig({
		...input,
		aDiscardRiskV1Weight: -30,
		bDiscardRiskV1Weight: 0,
	});
	if (!discardRisk.ok) throw new Error(discardRisk.reason);
	expect(discardRisk.config.aDiscardRiskV1Weight).toBe(-30);
	expect(discardRisk.config.bDiscardRiskV1Weight).toBe(0);
	expect(
		parseModernStudyConfig({ ...input, aDiscardRiskV1Weight: Number.NaN }).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, bDiscardRiskV1Weight: 1 }).ok).toBe(
		false,
	);
	const pairThreat = parseModernStudyConfig({
		...input,
		aPairThreatV1Weight: -30,
		bPairThreatV1Weight: 0,
	});
	if (!pairThreat.ok) throw new Error(pairThreat.reason);
	expect(pairThreat.config.aPairThreatV1Weight).toBe(-30);
	expect(pairThreat.config.bPairThreatV1Weight).toBe(0);
	expect(
		parseModernStudyConfig({ ...input, aPairThreatV1Weight: Number.NaN }).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, bPairThreatV1Weight: 1 }).ok).toBe(
		false,
	);
	const pairPile = parseModernStudyConfig({
		...input,
		aPairPileV1Weight: -30,
		bPairPileV1Weight: 0,
	});
	if (!pairPile.ok) throw new Error(pairPile.reason);
	expect(pairPile.config.aPairPileV1Weight).toBe(-30);
	expect(pairPile.config.bPairPileV1Weight).toBe(0);
	expect(
		parseModernStudyConfig({ ...input, aPairPileV1Weight: Number.NaN }).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, bPairPileV1Weight: 1 }).ok).toBe(
		false,
	);
	const mixedBudgets = parseModernStudyConfig({
		...input,
		aSimulations: 8,
		bSimulations: 2,
	});
	if (!mixedBudgets.ok) throw new Error(mixedBudgets.reason);
	expect(mixedBudgets.config.aSimulations).toBe(8);
	expect(mixedBudgets.config.bSimulations).toBe(2);
	expect(modernStudyBudgets(mixedBudgets.config)).toEqual({ a: 8, b: 2 });
	const oneOverride = parseModernStudyConfig({ ...input, aSimulations: 8 });
	if (!oneOverride.ok) throw new Error(oneOverride.reason);
	expect(modernStudyBudgets(oneOverride.config)).toEqual({
		a: 8,
		b: input.simulations,
	});
	expect(parseModernStudyConfig({ ...input, aSimulations: 0 }).ok).toBe(false);
	expect(parseModernStudyConfig({ ...input, bSimulations: 1.5 }).ok).toBe(
		false,
	);
	const scenario = parseModernStudyConfig({
		...input,
		maxHands: 1,
		initialTeamScore: 5000,
	});
	if (!scenario.ok) throw new Error(scenario.reason);
	expect(modernStudyPlan(scenario.config, 0, 0).initialTeamScore).toBe(5000);
	expect(parseModernStudyConfig({ ...input, initialTeamScore: 5000 }).ok).toBe(
		false,
	);
	expect(
		parseModernStudyConfig({ ...input, maxHands: 1, initialTeamScore: 8500 })
			.ok,
	).toBe(false);
	expect(
		parseModernStudyConfig({ ...input, maxHands: 1, initialTeamScore: -1 }).ok,
	).toBe(false);
	expect(parseModernStudyConfig({ ...input, llm: true }).ok).toBe(false);
});

it("uses each policy's configured depth and preserves the shared-depth fallback", async () => {
	const weights = { ...MODERN_PRIOR_WEIGHTS, discardPair: 25 };
	const input = {
		version: 1,
		seed: 123,
		split: 3,
		pairs: 1,
		maxHands: 1,
		maxActionsPerHand: 300,
		simulations: 8,
		timeMs: 30000,
		depth: 3,
		aDepth: 8,
		bDepth: 3,
		a: weights,
		b: weights,
	};
	const parsed = parseModernStudyConfig(input);
	if (!parsed.ok) throw new Error(parsed.reason);
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const observation = observeModern(drawn.hand, 0);
	const decide = (policy: "a" | "b") =>
		modernResearchAgent(modernStudyAgentConfig(parsed.config, policy)).decide(
			observation,
			{ handNo: 1, rng: mulberry32(91) },
		);
	const deeper = await decide("a");
	const shallower = await decide("b");
	if (!deeper.ok || !shallower.ok) throw new Error("search did not finish");
	expect(deeper.simulations).toBe(8);
	expect(shallower.simulations).toBe(8);
	expect(deeper.deadlineStopped).toBe(false);
	expect(shallower.deadlineStopped).toBe(false);
	expect(modernActionKey(drawn.hand, deeper.action)).toBe("discard:6H");
	expect(modernActionKey(drawn.hand, shallower.action)).toBe("discard:8H");
	const fallback = parseModernStudyConfig({ ...input, bDepth: undefined });
	expect(fallback.ok).toBe(false);
	const { bDepth: _omitted, ...withFallback } = input;
	const validFallback = parseModernStudyConfig(withFallback);
	if (!validFallback.ok) throw new Error(validFallback.reason);
	expect(modernStudyAgentConfig(validFallback.config, "b").depth).toBe(3);
	expect(parseModernStudyConfig({ ...input, aDepth: 0 }).ok).toBe(false);
	expect(parseModernStudyConfig({ ...input, bDepth: 1.5 }).ok).toBe(false);
	expect(parseModernStudyConfig({ ...input, aDepth: 10001 }).ok).toBe(false);
}, 30000);
