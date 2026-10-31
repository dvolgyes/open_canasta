import type { MatchPlan } from "./arena";
import { validSeed } from "./arena";
import type { ModernMatchResult } from "./modern-arena";

export interface ModernEvidenceSummary {
	readonly eligible: boolean;
	readonly plannedPairs: number;
	readonly recordedPairs: number;
	readonly incompleteLegs: number;
	readonly deadlineStops: number;
	readonly wins: number;
	readonly losses: number;
	/** Null unless every planned match completed its fixed simulation budget. */
	readonly winRate: number | null;
}

function validLeg(leg: ModernMatchResult): boolean {
	if (
		!leg?.plan ||
		![0, 1].includes(leg.plan.aTeam) ||
		![0, 1, 2, 3].includes(leg.plan.dealer) ||
		!validSeed(leg.plan.seed) ||
		!validSeed(leg.plan.policySeed) ||
		!Number.isSafeInteger(leg.plan.maxHands) ||
		leg.plan.maxHands < 1 ||
		!Number.isSafeInteger(leg.plan.maxActionsPerHand) ||
		leg.plan.maxActionsPerHand < 1 ||
		!Array.isArray(leg.scores) ||
		leg.scores.length !== 2 ||
		!leg.scores.every(Number.isSafeInteger)
	)
		return false;
	if (
		![
			leg.hands,
			leg.actions,
			leg.simulations,
			leg.resets,
			leg.deadlineStops,
		].every((n) => Number.isSafeInteger(n) && n >= 0) ||
		leg.hands < 1 ||
		leg.hands > leg.plan.maxHands ||
		leg.actions > leg.hands * leg.plan.maxActionsPerHand ||
		leg.resets > leg.actions ||
		leg.deadlineStops > leg.actions ||
		!Number.isFinite(leg.elapsedMs) ||
		leg.elapsedMs < 0
	)
		return false;
	if (leg.status === "incomplete")
		return (
			leg.aWin === null &&
			typeof leg.reason === "string" &&
			leg.reason.length > 0
		);
	if (
		leg.status !== "complete" ||
		(leg.aWin !== 0 && leg.aWin !== 1) ||
		Math.max(...leg.scores) < 8500 ||
		leg.scores[0] === leg.scores[1]
	)
		return false;
	const winner = leg.scores[0] > leg.scores[1] ? 0 : 1;
	return leg.aWin === Number(winner === leg.plan.aTeam);
}

/** Check retained data against the exact scheduled leg before using it as evidence. */
export function validModernResult(
	value: unknown,
	plan: MatchPlan,
	simulationsPerDecision: number,
): value is ModernMatchResult {
	if (typeof value !== "object" || value === null) return false;
	const result = value as ModernMatchResult;
	if (!validLeg(result)) return false;
	if (
		!Number.isSafeInteger(simulationsPerDecision) ||
		simulationsPerDecision < 1
	)
		return false;
	const maximum = result.actions * simulationsPerDecision;
	if (
		!Number.isSafeInteger(maximum) ||
		result.simulations <
			(result.actions - result.deadlineStops) * simulationsPerDecision ||
		result.simulations > maximum - result.deadlineStops
	)
		return false;
	const actual = result.plan;
	return (
		actual.seed === plan.seed &&
		actual.policySeed === plan.policySeed &&
		actual.dealer === plan.dealer &&
		actual.aTeam === plan.aTeam &&
		actual.maxHands === plan.maxHands &&
		actual.maxActionsPerHand === plan.maxActionsPerHand
	);
}

/** Keep paired legs together and reject a fixed-iteration verdict if any budget was missed. */
export function summarizeModernPairs(
	pairs: readonly (readonly [ModernMatchResult, ModernMatchResult])[],
	plannedPairs: number,
	simulationsPerDecision: number,
): ModernEvidenceSummary {
	if (
		!Number.isSafeInteger(plannedPairs) ||
		plannedPairs < 1 ||
		pairs.length > plannedPairs
	)
		throw new Error("invalid planned pair count");
	let wins = 0,
		losses = 0,
		incompleteLegs = 0,
		deadlineStops = 0;
	const seeds = new Set<number>();
	for (const [first, second] of pairs) {
		if (
			!validModernResult(first, first.plan, simulationsPerDecision) ||
			!validModernResult(second, second.plan, simulationsPerDecision)
		)
			throw new Error("invalid modern match result");
		const a = first.plan;
		const b = second.plan;
		if (
			a.aTeam !== 0 ||
			b.aTeam !== 1 ||
			a.seed !== b.seed ||
			a.policySeed !== b.policySeed ||
			a.dealer !== b.dealer ||
			a.maxHands !== b.maxHands ||
			a.maxActionsPerHand !== b.maxActionsPerHand ||
			seeds.has(a.seed)
		)
			throw new Error("invalid paired match plans");
		seeds.add(a.seed);
		deadlineStops += first.deadlineStops + second.deadlineStops;
		incompleteLegs +=
			Number(first.status === "incomplete") +
			Number(second.status === "incomplete");
		if (first.status === "complete" && second.status === "complete") {
			wins += Number(first.aWin === 1) + Number(second.aWin === 1);
			losses += Number(first.aWin === 0) + Number(second.aWin === 0);
		}
	}
	const eligible =
		pairs.length === plannedPairs &&
		incompleteLegs === 0 &&
		deadlineStops === 0;
	return {
		eligible,
		plannedPairs,
		recordedPairs: pairs.length,
		incompleteLegs,
		deadlineStops,
		wins,
		losses,
		winRate: eligible ? wins / (wins + losses) : null,
	};
}
