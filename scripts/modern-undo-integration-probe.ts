import { MODERN_PRIOR_WEIGHTS } from "../src/bot/modern-prior";
import {
	type ModernAgentFactory,
	modernResearchAgent,
	playModernMatch,
} from "../src/bot/research/modern-arena";

for (const seed of [13, 29, 71, 9137]) {
	let undoDecisions = 0;
	let maxUndoSnapshots = 0;
	const factory: ModernAgentFactory = () => {
		const agent = modernResearchAgent({
			priorWeights: MODERN_PRIOR_WEIGHTS,
			simulations: 2,
			depth: 3,
			timeMs: 30000,
		});
		return {
			decide(observation, context) {
				if (observation.canUndo) undoDecisions++;
				maxUndoSnapshots = Math.max(
					maxUndoSnapshots,
					observation.undoViews?.length ?? 0,
				);
				return agent.decide(observation, context);
			},
		};
	};
	const result = await playModernMatch(
		{
			seed,
			policySeed: 51017,
			dealer: 0,
			aTeam: 0,
			maxHands: 1,
			maxActionsPerHand: 300,
		},
		factory,
	);
	if (
		result.status !== "incomplete" ||
		result.reason !== "hand cap" ||
		result.hands !== 1 ||
		result.deadlineStops !== 0 ||
		result.simulations !== result.actions * 2
	)
		throw new Error(`hand ${seed} did not meet its fixed budget`);
	process.stdout.write(
		`${JSON.stringify({
			seed,
			actions: result.actions,
			simulations: result.simulations,
			undoDecisions,
			maxUndoSnapshots,
		})}\n`,
	);
}
