import { expect, it } from "vitest";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../../src/bot/research/modern-study";

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
