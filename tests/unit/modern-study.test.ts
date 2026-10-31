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
	expect(parseModernStudyConfig({ ...input, llm: true }).ok).toBe(false);
});
