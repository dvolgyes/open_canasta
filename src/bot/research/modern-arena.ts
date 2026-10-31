import { type Seat, teamOf } from "../../canasta/hand";
import {
	type ModernAction,
	modernApplyAction,
} from "../../canasta/modern-hand";
import {
	modernNextHand,
	modernSettleHand,
	modernStartMatch,
} from "../../canasta/modern-match";
import { mulberry32 } from "../../canasta/random";
import {
	type ModernPublicHistory,
	recordModernTransfer,
} from "../../game/modern-history";
import { type ModernObservation, observeModern } from "../modern-inference";
import type { ModernPriorWeights } from "../modern-prior";
import { chooseModernPosition } from "../modern-search";
import {
	type DecisionContext,
	type MatchPlan,
	type MatchResult,
	streamSeed,
	validSeed,
} from "./arena";

export type ModernDecision =
	| {
			readonly ok: true;
			readonly action: ModernAction;
			readonly simulations: number;
			readonly deadlineStopped: boolean;
	  }
	| { readonly ok: false; readonly reason: string };
export interface ModernResearchAgent {
	decide(
		observation: ModernObservation,
		context: DecisionContext,
	): Promise<ModernDecision>;
}
export type ModernAgentFactory = (
	seat: Seat,
	side: "a" | "b",
) => ModernResearchAgent;
export interface ModernMatchPlan extends MatchPlan {
	/** A symmetric hypothetical starting score, permitted only for one-hand trials. */
	readonly initialTeamScore?: number;
}
export interface ModernMatchResult extends MatchResult {
	readonly plan: ModernMatchPlan;
	readonly deadlineStops: number;
}

export interface ModernMatchProgress {
	readonly hand: number;
	readonly scores: readonly [number, number];
	readonly actions: number;
	readonly simulations: number;
	readonly deadlineStops: number;
}

/** Play a full match; unfinished legs are returned as incomplete rather than counted as draws. */
export async function playModernMatch(
	plan: ModernMatchPlan,
	factory: ModernAgentFactory,
	signal?: AbortSignal,
	onHandSettled?: (progress: ModernMatchProgress) => void,
): Promise<ModernMatchResult> {
	if (
		!validSeed(plan.seed) ||
		!validSeed(plan.policySeed) ||
		![0, 1, 2, 3].includes(plan.dealer) ||
		![0, 1].includes(plan.aTeam) ||
		!Number.isSafeInteger(plan.maxActionsPerHand) ||
		plan.maxActionsPerHand < 1 ||
		!Number.isSafeInteger(plan.maxHands) ||
		plan.maxHands < 1 ||
		(plan.initialTeamScore !== undefined &&
			(!Number.isSafeInteger(plan.initialTeamScore) ||
				plan.initialTeamScore < 0 ||
				plan.initialTeamScore >= 8500 ||
				plan.maxHands !== 1))
	)
		throw new Error("invalid modern match plan");
	const started = performance.now();
	const start = modernStartMatch(plan.seed, plan.dealer);
	if (!start.ok) throw new Error(start.reason);
	let match = start.match;
	if (plan.initialTeamScore !== undefined) {
		const scores = [plan.initialTeamScore, plan.initialTeamScore] as const;
		match = {
			...match,
			scores,
			hand: {
				...match.hand,
				teamScores: scores,
				turnStart: { ...match.hand.turnStart, teamScores: scores },
			},
		};
	}
	let history: ModernPublicHistory | undefined;
	let actions = 0,
		handActions = 0,
		simulations = 0,
		resets = 0,
		deadlineStops = 0;
	const seats = [0, 1, 2, 3] as const;
	const agents = seats.map((seat) =>
		factory(seat, teamOf(seat) === plan.aTeam ? "a" : "b"),
	);
	const rngs = seats.map((seat) =>
		mulberry32(streamSeed(plan.policySeed, seat)),
	);
	const result = (reason?: string): ModernMatchResult => ({
		plan,
		status: reason === undefined ? "complete" : "incomplete",
		...(reason === undefined ? {} : { reason }),
		aWin:
			reason === undefined && match.winner !== null
				? (Number(match.winner === plan.aTeam) as 0 | 1)
				: null,
		scores: match.scores,
		hands: match.handNo,
		actions,
		simulations,
		resets,
		deadlineStops,
		elapsedMs: performance.now() - started,
	});
	while (match.winner === null) {
		if (signal?.aborted) return result("cancelled");
		if (match.hand.outcome !== null) {
			const settled = modernSettleHand(match);
			if (!settled.ok) return result(`settlement: ${settled.reason}`);
			match = settled.match;
			onHandSettled?.({
				hand: match.handNo,
				scores: match.scores,
				actions,
				simulations,
				deadlineStops,
			});
			if (match.winner !== null) break;
			if (match.handNo >= plan.maxHands) return result("hand cap");
			const next = modernNextHand(match);
			if (!next.ok) return result(`deal: ${next.reason}`);
			match = next.match;
			history = undefined;
			handActions = 0;
		}
		if (handActions >= plan.maxActionsPerHand) return result("action cap");
		const seat = match.hand.turn;
		const agent = agents[seat];
		const rng = rngs[seat];
		if (!agent || !rng) throw new Error("missing modern seat policy");
		const decision = await agent.decide(
			observeModern(match.hand, seat, history),
			{ rng, handNo: match.handNo, signal },
		);
		if (!decision.ok)
			return result(
				`agent ${teamOf(seat) === plan.aTeam ? "a" : "b"}: ${decision.reason}`,
			);
		if (
			!Number.isSafeInteger(decision.simulations) ||
			decision.simulations < 0 ||
			typeof decision.deadlineStopped !== "boolean"
		)
			return result("invalid simulation count");
		const step = modernApplyAction(match.hand, seat, decision.action);
		if (!step.ok) return result(`illegal action: ${step.reason}`);
		history = recordModernTransfer(history, match.hand, step.hand);
		match = { ...match, hand: step.hand };
		actions++;
		handActions++;
		simulations += decision.simulations;
		resets += Number(
			decision.action.type === "undo" || decision.action.type === "retract",
		);
		deadlineStops += Number(decision.deadlineStopped);
	}
	return result(
		plan.initialTeamScore === undefined ? undefined : "scenario hand",
	);
}

export interface ModernAgentConfig {
	readonly priorWeights: ModernPriorWeights | null;
	readonly priorWeight?: number;
	readonly simulations: number;
	readonly timeMs: number;
	readonly depth: number;
}

/** All policies share the rollout and cutoff evaluator; only tree priors vary. */
export function modernResearchAgent(
	config: ModernAgentConfig,
): ModernResearchAgent {
	if (
		!Number.isSafeInteger(config.simulations) ||
		config.simulations < 1 ||
		!Number.isFinite(config.timeMs) ||
		config.timeMs <= 0 ||
		(config.priorWeight !== undefined &&
			(!Number.isFinite(config.priorWeight) ||
				config.priorWeight < 0 ||
				config.priorWeight > 1e6)) ||
		!Number.isSafeInteger(config.depth) ||
		config.depth < 1
	)
		throw new Error("invalid modern research budget");
	return {
		async decide(observation, context) {
			const result = await chooseModernPosition(observation, {
				timeMs: config.timeMs,
				maxIterations: config.simulations,
				maxDepth: config.depth,
				priorWeights: config.priorWeights,
				...(config.priorWeight === undefined
					? {}
					: { priorWeight: config.priorWeight }),
				rng: context.rng,
				signal: context.signal,
			});
			if (!result.action)
				return { ok: false, reason: "no legal action before the deadline" };
			return {
				ok: true,
				action: result.action,
				simulations: result.iterations,
				deadlineStopped: result.iterations < config.simulations,
			};
		},
	};
}
