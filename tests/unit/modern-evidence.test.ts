import { expect, it } from "vitest";
import type { ModernMatchResult } from "../../src/bot/research/modern-arena";
import {
	summarizeModernPairs,
	validModernResult,
} from "../../src/bot/research/modern-evidence";

function leg(seed: number, aTeam: 0 | 1, aWin: 0 | 1): ModernMatchResult {
	const winner = aWin ? aTeam : 1 - aTeam;
	return {
		plan: {
			seed,
			policySeed: seed + 100,
			dealer: 0,
			aTeam,
			maxHands: 100,
			maxActionsPerHand: 300,
		},
		status: "complete",
		aWin,
		scores: winner === 0 ? [8500, 8000] : [8000, 8500],
		hands: 4,
		actions: 100,
		simulations: 200,
		resets: 0,
		deadlineStops: 0,
		elapsedMs: 1000,
	};
}

it("counts wins only for complete paired legs with matching plans", () => {
	const result = summarizeModernPairs(
		[
			[leg(1, 0, 1), leg(1, 1, 0)],
			[leg(2, 0, 1), leg(2, 1, 1)],
		],
		2,
		2,
	);
	expect(result).toMatchObject({
		eligible: true,
		wins: 3,
		losses: 1,
		winRate: 0.75,
		incompleteLegs: 0,
	});
	expect(result.confidence95?.lower).toBeLessThan(result.winRate ?? 0);
	expect(result.confidence95?.upper).toBeGreaterThan(result.winRate ?? 1);
	expect(() =>
		summarizeModernPairs([[leg(1, 0, 1), leg(2, 1, 1)]], 1, 2),
	).toThrow(/paired/);
});

it("rejects corrupted cached legs and plans", () => {
	const result = leg(1, 0, 1);
	expect(validModernResult(result, result.plan, 2)).toBe(true);
	expect(validModernResult({ ...result, aWin: 0 }, result.plan, 2)).toBe(false);
	expect(
		validModernResult({ ...result, deadlineStops: 101 }, result.plan, 2),
	).toBe(false);
	expect(
		validModernResult({ ...result, simulations: 199 }, result.plan, 2),
	).toBe(false);
	expect(validModernResult({ ...result, hands: 0 }, result.plan, 2)).toBe(
		false,
	);
	expect(validModernResult(result, { ...result.plan, seed: 2 }, 2)).toBe(false);
	expect(validModernResult(null, result.plan, 2)).toBe(false);
});

it("does not make a promotion claim with incomplete games or missed simulation budgets", () => {
	const incomplete = {
		...leg(1, 1, 1),
		status: "incomplete" as const,
		reason: "hand cap",
		aWin: null,
	};
	const one = summarizeModernPairs([[leg(1, 0, 1), incomplete]], 1, 2);
	expect(one.eligible).toBe(false);
	expect(one.winRate).toBeNull();
	expect(one.confidence95).toBeNull();
	expect(one.incompleteLegs).toBe(1);
	const stopped = { ...leg(1, 1, 1), deadlineStops: 1, simulations: 199 };
	const two = summarizeModernPairs([[leg(1, 0, 1), stopped]], 1, 2);
	expect(two.eligible).toBe(false);
	expect(two.winRate).toBeNull();
});
