import type { MatchState } from "../../canasta";
import type { PriorWeights } from "../canasta-prior";
import { chooseCanasta, inferCanasta, sampleCanasta } from "../canasta-search";
import { knownCards } from "../card-knowledge";
import { botActions } from "../heuristic";
import {
	decisionState,
	offeredChoices,
	type PromptTemplates,
	renderTurnPrompt,
} from "../strategy";
import type { TurnChooser } from "../turn";
import type { ResearchAgent } from "./arena";

export type ResearchBudget =
	| {
			readonly kind: "iterations";
			readonly iterations: number;
			readonly emergencyTimeMs: number;
			readonly depth: number;
	  }
	| { readonly kind: "time"; readonly timeMs: number; readonly depth: number };
export type LocalPolicy =
	| { readonly kind: "heuristic" }
	| {
			readonly kind: "mcts";
			readonly weights: PriorWeights | null;
			readonly budget: ResearchBudget;
	  };

export function localAgent(policy: LocalPolicy): ResearchAgent {
	return {
		decide: async (observation, context) => {
			if (policy.kind === "heuristic") {
				const hand = sampleCanasta(
					observation,
					inferCanasta(observation),
					context.rng,
				);
				const action = botActions(hand, observation.seat)[0];
				return action
					? { ok: true, action, simulations: 0 }
					: { ok: false, reason: "no legal action" };
			}
			const budget = policy.budget;
			const result = await chooseCanasta(observation, {
				priorWeights: policy.weights,
				rng: context.rng,
				signal: context.signal,
				maxDepth: budget.depth,
				timeMs: budget.kind === "time" ? budget.timeMs : budget.emergencyTimeMs,
				...(budget.kind === "iterations"
					? { maxIterations: budget.iterations }
					: {}),
			});
			if (
				budget.kind === "iterations" &&
				result.iterations !== budget.iterations
			)
				return {
					ok: false,
					reason: `incomplete search: ${result.iterations}/${budget.iterations} simulations`,
				};
			return result.action
				? { ok: true, action: result.action, simulations: result.iterations }
				: { ok: false, reason: "no search action" };
		},
	};
}

/** Research comparison: no automatic heuristic fallback after an invalid or failed model response. */
export function llmAgent(
	chooser: TurnChooser,
	templates: PromptTemplates,
): ResearchAgent {
	return {
		decide: async (observation, context) => {
			const belief = inferCanasta(observation);
			// The real hidden deal never enters this adapter, including prompt construction helpers.
			const hand = sampleCanasta(observation, belief, context.rng);
			const match: MatchState = {
				rules: hand.rules,
				seed: 0,
				handNo: context.handNo,
				dealer: hand.dealer,
				scores: hand.teamScores,
				hand,
				settled: false,
				winner: null,
			};
			const choices = offeredChoices(hand, observation.seat);
			if (choices.length === 0) return { ok: false, reason: "no LLM choices" };
			const memory = belief.players.slice(0, 4).map(knownCards);
			const prompt = `${renderTurnPrompt(match, observation.seat, choices, templates)}\nPublic-memory bounds (known card faces and unknown slots by N,E,S,W; unknown slots may include more of a known face):\n${JSON.stringify(memory)}\nEntire visible discard pile, bottom to top:\n${JSON.stringify(observation.view.pile.map((c) => ({ rank: c.rank, suit: c.suit })))}`;
			let index: number;
			if (context.signal?.aborted)
				return { ok: false, reason: "cancelled before LLM request" };
			try {
				index = await chooser.choose(
					prompt,
					choices.map((c) => c.label),
					{ ...decisionState(match, observation.seat), public_memory: memory },
				);
			} catch {
				return { ok: false, reason: "LLM request failed; no fallback used" };
			}
			if (!Number.isSafeInteger(index) || index < 0 || index >= choices.length)
				return { ok: false, reason: "LLM returned an invalid choice" };
			const action = choices[index]?.action;
			return action
				? { ok: true, action, simulations: 0 }
				: { ok: false, reason: "missing LLM choice" };
		},
	};
}
