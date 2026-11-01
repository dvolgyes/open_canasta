import { expect, it } from "vitest";
import type { ModernMatchResult } from "../../src/bot/research/modern-arena";
import {
	summarizeModernHandPairs,
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

it("scores completed hands as a separate training proxy without claiming match wins", () => {
	const hand = (team: 0 | 1, scores: readonly [number, number]) => ({
		...leg(1, team, 1),
		plan: { ...leg(1, team, 1).plan, maxHands: 1 },
		status: "incomplete" as const,
		reason: "hand cap",
		aWin: null,
		scores,
		hands: 1,
	});
	const legs = [hand(0, [1000, 500]), hand(1, [300, 900])] as const;
	const proxy = summarizeModernHandPairs([legs], 1, 2);
	expect(proxy).toMatchObject({
		eligible: true,
		objective: "hand-score",
		handWins: 2,
		handLosses: 0,
		meanPairScore: 1,
	});
	expect(summarizeModernPairs([legs], 1, 2)).toMatchObject({
		eligible: false,
		winRate: null,
	});
	const capped = { ...legs[0], reason: "action cap" };
	expect(summarizeModernHandPairs([[capped, legs[1]]], 1, 2).eligible).toBe(
		false,
	);
});

it("never counts a hypothetical score scenario as a full match win", () => {
	const scenario = (team: 0 | 1) => ({
		...leg(1, team, 1),
		plan: { ...leg(1, team, 1).plan, maxHands: 1, initialTeamScore: 5000 },
		status: "incomplete" as const,
		reason: "scenario hand",
		aWin: null,
		hands: 1,
	});
	const legs = [scenario(0), scenario(1)] as const;
	expect(validModernResult(legs[0], legs[0].plan, 2)).toBe(true);
	expect(
		validModernResult({ ...legs[0], scores: [6000, 5000] }, legs[0].plan, 2),
	).toBe(false);
	expect(
		validModernResult(
			{ ...legs[0], status: "complete", aWin: 1 },
			legs[0].plan,
			2,
		),
	).toBe(false);
	expect(
		validModernResult(legs[0], { ...legs[0].plan, initialTeamScore: 3000 }, 2),
	).toBe(false);
	expect(summarizeModernPairs([legs], 1, 2)).toMatchObject({
		eligible: false,
		scenarioLegs: 2,
		winRate: null,
	});
	expect(summarizeModernHandPairs([legs], 1, 2)).toMatchObject({
		eligible: true,
		handWins: 2,
		meanPairScore: 1,
	});
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

it("validates separate policy budgets without trusting the aggregate alone", () => {
	const original = leg(1, 0, 1);
	const budgets = { a: 8, b: 2 };
	const result = {
		...original,
		simulations: 500,
		policyStats: {
			a: { decisions: 50, simulations: 400, deadlineStops: 0 },
			b: { decisions: 50, simulations: 100, deadlineStops: 0 },
		},
	};
	expect(validModernResult(result, result.plan, budgets)).toBe(true);
	expect(validModernResult(original, original.plan, budgets)).toBe(false);
	const swapped = {
		...result,
		plan: { ...result.plan, aTeam: 1 as const },
		aWin: 0 as const,
	};
	expect(summarizeModernPairs([[result, swapped]], 1, budgets)).toMatchObject({
		eligible: true,
		wins: 1,
		losses: 1,
	});
	expect(
		validModernResult(
			{
				...result,
				policyStats: {
					...result.policyStats,
					a: { ...result.policyStats.a, simulations: 399 },
					b: { ...result.policyStats.b, simulations: 101 },
				},
			},
			result.plan,
			budgets,
		),
	).toBe(false);
	const missed = {
		...result,
		simulations: 499,
		deadlineStops: 1,
		policyStats: {
			...result.policyStats,
			a: { decisions: 50, simulations: 399, deadlineStops: 1 },
		},
	};
	expect(validModernResult(missed, result.plan, budgets)).toBe(true);
	expect(
		summarizeModernPairs(
			[[result, { ...missed, plan: { ...missed.plan, aTeam: 1 }, aWin: 0 }]],
			1,
			budgets,
		).eligible,
	).toBe(false);
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
