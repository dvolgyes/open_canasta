import { type Seat, teamOf } from "../canasta/hand";
import {
	type ModernAction,
	type ModernHandState,
	modernApplyAction,
} from "../canasta/modern-hand";
import { modernScoreHand } from "../canasta/modern-special-scoring";
import type { ModernHandView } from "../canasta/modern-view";
import type { ModernPublicHistory } from "../game/modern-history";
import { type SearchOptions, type SearchResult, search } from "./mcts";
import {
	modernActionKey,
	modernPlayableActions,
	modernSearchActions,
} from "./modern-actions";
import {
	inferModern,
	type ModernObservation,
	sampleModernPosition,
} from "./modern-inference";
import {
	MODERN_PRIOR_WEIGHTS,
	type ModernPriorWeights,
	modernPriorFeatures,
	modernPriorValue,
} from "./modern-prior";

export interface ModernSearchOptions extends SearchOptions<ModernAction> {
	/** Null removes tree priors, including their unvisited-action ordering. */
	readonly priorWeights?: ModernPriorWeights | null;
	readonly history?: ModernPublicHistory;
}

/** Match-score utility for a sampled deal; this cutoff is a provisional research baseline. */
export function evaluateModern(hand: ModernHandState): readonly number[] {
	const score = modernScoreHand(hand);
	if (!score) throw new Error("cannot evaluate an invalid modern hand");
	const a = hand.teamScores[0] + score[0].total;
	const b = hand.teamScores[1] + score[1].total;
	if (hand.outcome && Math.max(a, b) >= 8500 && a !== b)
		return a > b ? [1, 0] : [0, 1];
	const value = 0.5 + 0.5 * Math.tanh((a - b) / 2500);
	return [value, 1 - value];
}

/** Search from a turn-start observation; opponents' cards are sampled from public evidence. */
export async function chooseModern(
	view: ModernHandView,
	seat: Seat,
	options: ModernSearchOptions,
): Promise<SearchResult<ModernAction>> {
	if (view.phase !== "draw")
		return { action: undefined, iterations: 0, elapsedMs: 0, choices: [] };
	return chooseModernPosition(
		{ seat, view, turnStart: view, canUndo: false, history: options.history },
		options,
	);
}

/** Search an observed position within the actor's turn. */
export async function chooseModernPosition(
	observation: ModernObservation,
	options: ModernSearchOptions,
): Promise<SearchResult<ModernAction>> {
	const { view, seat } = observation;
	if (!Number.isFinite(options.timeMs) || options.timeMs < 0)
		throw new Error("invalid modern thinking time");
	const weights =
		options.priorWeights === undefined
			? MODERN_PRIOR_WEIGHTS
			: options.priorWeights;
	if (
		weights &&
		(Object.keys(MODERN_PRIOR_WEIGHTS) as (keyof ModernPriorWeights)[]).some(
			(key) => !Number.isFinite(weights[key]),
		)
	)
		throw new Error("invalid modern prior weights");
	const now = options.now ?? (() => performance.now());
	const started = now();
	if (view.turn !== seat || view.outcome !== null)
		return {
			action: undefined,
			iterations: 0,
			elapsedMs: now() - started,
			choices: [],
		};
	let fallback: ModernAction | undefined =
		view.phase === "draw"
			? { type: "draw" }
			: observation.canUndo
				? { type: "undo" }
				: undefined;
	if (options.timeMs === 0)
		return {
			action: fallback,
			iterations: 0,
			elapsedMs: now() - started,
			choices: [],
		};
	const rng = options.rng ?? Math.random;
	const belief = inferModern(
		view,
		seat,
		options.history ?? observation.history,
	);
	const initial = sampleModernPosition(observation, belief, rng);
	if (view.phase !== "draw") {
		const safe = modernSearchActions(initial, () => true).find(
			(action) => action.type === "discard" || action.type === "special",
		);
		if (safe) fallback = safe;
	}
	const result = await search(
		{
			sample: () => sampleModernPosition(observation, belief, rng),
			player: (hand) => teamOf(hand.turn),
			key: modernActionKey,
			actions: modernPlayableActions,
			apply: (hand, action) => {
				const step = modernApplyAction(hand, hand.turn, action);
				if (!step.ok)
					throw new Error(
						`search generated an illegal modern action: ${step.reason}`,
					);
				return step.hand;
			},
			terminal: (hand) => hand.outcome !== null,
			evaluate: evaluateModern,
			...(weights === null
				? {}
				: {
						prior: (hand: ModernHandState, action: ModernAction) =>
							modernPriorValue(modernPriorFeatures(hand, action), weights),
					}),
			rollout: (hand, actions, random, expired) => {
				let best = -Infinity;
				let choices: ModernAction[] = [];
				for (const action of actions) {
					if (expired()) break;
					const value = modernPriorValue(
						modernPriorFeatures(hand, action),
						MODERN_PRIOR_WEIGHTS,
					);
					if (value > best) {
						best = value;
						choices = [];
					}
					if (value === best) choices.push(action);
				}
				const choice =
					choices[Math.floor(random() * choices.length)] ?? actions[0];
				if (!choice) throw new Error("rollout has no modern action");
				return choice;
			},
		},
		{
			...options,
			rng,
			fallback,
			widening: options.widening ?? 1,
			timeMs: Math.max(0, options.timeMs - (now() - started)),
		},
	);
	return { ...result, elapsedMs: now() - started };
}
