import { modernActionKey } from "../src/bot/modern-actions";
import { observeModern } from "../src/bot/modern-inference";
import { chooseModernPosition } from "../src/bot/modern-search";
import { modernApplyAction } from "../src/canasta/modern-hand";
import { modernStartMatch } from "../src/canasta/modern-match";
import { mulberry32 } from "../src/canasta/random";
import {
	type ModernPublicHistory,
	recordModernTransfer,
} from "../src/game/modern-history";

const started = modernStartMatch(9137, 0);
if (!started.ok) throw new Error(started.reason);
let hand = started.match.hand;
let history: ModernPublicHistory | undefined;
for (let decision = 0; decision < 20 && hand.outcome === null; decision++) {
	const observation = observeModern(hand, hand.turn, history);
	const run = (partitionObservations: boolean) =>
		chooseModernPosition(observation, {
			timeMs: 30000,
			maxIterations: 16,
			maxDepth: 8,
			partitionObservations,
			rng: mulberry32(1000 + decision),
		});
	const baseline = await run(false);
	const partitioned = await run(true);
	if (!baseline.action || !partitioned.action)
		throw new Error("missing probe action");
	if (baseline.iterations !== 16 || partitioned.iterations !== 16)
		throw new Error(`decision ${decision} missed its simulation budget`);
	process.stdout.write(
		`${JSON.stringify({
			decision,
			phase: hand.phase,
			baselineAction: modernActionKey(hand, baseline.action),
			partitionedAction: modernActionKey(hand, partitioned.action),
			baselineVisits: baseline.choices.map((choice) => choice.visits),
			partitionedVisits: partitioned.choices.map((choice) => choice.visits),
		})}\n`,
	);
	const applied = modernApplyAction(hand, hand.turn, baseline.action);
	if (!applied.ok) throw new Error(applied.reason);
	history = recordModernTransfer(history, hand, applied.hand);
	hand = applied.hand;
}
