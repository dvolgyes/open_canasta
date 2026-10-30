/** Full classic matches. Only observations cross the agent boundary. */
import {
	type Action,
	applyAction,
	CLASSIC_RULES,
	mulberry32,
	nextHand,
	type Seat,
	settleHand,
	startMatch,
	teamOf,
} from "../../canasta";
import { type PublicHistory, recordTransfer } from "../../game/canasta-history";
import { type CanastaObservation, observeCanasta } from "../canasta-search";

export type Decision =
	| { readonly ok: true; readonly action: Action; readonly simulations: number }
	| { readonly ok: false; readonly reason: string };
export interface DecisionContext {
	readonly rng: () => number;
	readonly handNo: number;
	readonly signal?: AbortSignal;
}
export interface ResearchAgent {
	decide(
		observation: CanastaObservation,
		context: DecisionContext,
	): Promise<Decision>;
}
export interface MatchPlan {
	readonly seed: number;
	readonly policySeed: number;
	readonly dealer: Seat;
	readonly aTeam: 0 | 1;
	readonly maxActionsPerHand: number;
	readonly maxHands: number;
}
export interface MatchResult {
	readonly plan: MatchPlan;
	readonly status: "complete" | "incomplete";
	readonly reason?: string;
	readonly aWin: 0 | 1 | null;
	readonly scores: readonly [number, number];
	readonly hands: number;
	readonly actions: number;
	readonly simulations: number;
	readonly resets: number;
	readonly elapsedMs: number;
}
export type AgentFactory = (seat: Seat, side: "a" | "b") => ResearchAgent;

export function validSeed(seed: number): boolean {
	return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

/** Separate deterministic stream namespaces; never exposed with the true deal seed to a policy. */
export function streamSeed(seed: number, ...ids: number[]): number {
	let result = seed >>> 0;
	for (const id of ids) {
		result = Math.imul(result ^ id, 0x45d9f3b);
		result = (result ^ (result >>> 16)) >>> 0;
	}
	return result;
}

export async function playMatch(
	plan: MatchPlan,
	factory: AgentFactory,
	signal?: AbortSignal,
): Promise<MatchResult> {
	if (
		!validSeed(plan.seed) ||
		!validSeed(plan.policySeed) ||
		![0, 1, 2, 3].includes(plan.dealer) ||
		![0, 1].includes(plan.aTeam) ||
		!Number.isSafeInteger(plan.maxActionsPerHand) ||
		plan.maxActionsPerHand < 1 ||
		!Number.isSafeInteger(plan.maxHands) ||
		plan.maxHands < 1
	)
		throw new Error("invalid match plan");
	const started = performance.now();
	let match = startMatch(plan.seed, CLASSIC_RULES, plan.dealer);
	let history: PublicHistory | undefined;
	let actions = 0,
		handActions = 0,
		simulations = 0,
		resets = 0;
	const seats = [0, 1, 2, 3] as const;
	const agents = seats.map((seat) =>
		factory(seat, teamOf(seat) === plan.aTeam ? "a" : "b"),
	);
	const rngs = seats.map((seat) =>
		mulberry32(streamSeed(plan.policySeed, seat)),
	);
	const result = (reason?: string): MatchResult => ({
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
		elapsedMs: performance.now() - started,
	});
	while (match.winner === null) {
		if (signal?.aborted) return result("cancelled");
		if (match.hand.outcome !== null) {
			const settled = settleHand(match);
			if (!settled.ok) throw new Error(settled.reason);
			match = settled.match;
			if (match.winner !== null) break;
			if (match.handNo >= plan.maxHands) return result("hand cap");
			const next = nextHand(match);
			if (!next.ok) throw new Error(next.reason);
			match = next.match;
			history = undefined;
			handActions = 0;
		}
		if (handActions >= plan.maxActionsPerHand) return result("action cap");
		const seat = match.hand.turn;
		const agent = agents[seat],
			rng = rngs[seat];
		if (!agent || !rng) throw new Error("missing seat policy");
		const decision = await agent.decide(
			observeCanasta(match.hand, seat, history),
			{ rng, handNo: match.handNo, signal },
		);
		if (!decision.ok)
			return result(
				`agent ${teamOf(seat) === plan.aTeam ? "a" : "b"}: ${decision.reason}`,
			);
		if (!Number.isSafeInteger(decision.simulations) || decision.simulations < 0)
			return result("invalid simulation count");
		const step = applyAction(match.hand, seat, decision.action);
		if (!step.ok) return result(`illegal action: ${step.reason}`);
		history = recordTransfer(history, match.hand, step.hand, seat);
		match = { ...match, hand: step.hand };
		actions++;
		handActions++;
		simulations += decision.simulations;
		resets += Number(decision.action.type === "resetTurn");
	}
	return result();
}

export interface PairResult {
	readonly seed: number;
	readonly legs: readonly [MatchResult, MatchResult];
	/** One observation per paired block. Missing legs never become draws. */
	readonly score: number | null;
}
export type MatchExecutor = (plan: MatchPlan) => Promise<MatchResult>;

export async function playPair(
	plan: Omit<MatchPlan, "aTeam">,
	execute: MatchExecutor,
	parallel = false,
): Promise<PairResult> {
	const first = { ...plan, aTeam: 0 as const },
		second = { ...plan, aTeam: 1 as const };
	let legs: MatchResult[];
	if (parallel) {
		// A coordinator must keep its run lock until both workers have stopped writing.
		const outcomes = await Promise.allSettled([
			execute(first),
			execute(second),
		]);
		legs = outcomes.map((outcome) => {
			if (outcome.status === "rejected") throw outcome.reason;
			return outcome.value;
		});
	} else legs = [await execute(first), await execute(second)];
	const a = legs[0],
		b = legs[1];
	if (!a || !b) throw new Error("missing paired leg");
	return {
		seed: plan.seed,
		legs: [a, b],
		score: a.aWin === null || b.aWin === null ? null : (a.aWin + b.aWin) / 2,
	};
}
