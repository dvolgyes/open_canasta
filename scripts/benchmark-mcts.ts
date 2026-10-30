/** Paired-seat, seeded comparison against the existing heuristic; emits every result as JSON. */
import { chooseCanasta, observeCanasta } from "../src/bot/canasta-search";
import { botActions } from "../src/bot/heuristic";
import {
	applyAction,
	mulberry32,
	newHand,
	scoreHand,
	teamOf,
} from "../src/canasta";
import {
	type PublicHistory,
	recordTransfer,
} from "../src/game/canasta-history";

const args = process.argv.slice(2);
const timeMs = Number(args[0] ?? 25);
const pairs = Number(args[1] ?? 8);
const firstSeed = Number(args[2] ?? 501);
if (
	!Number.isFinite(timeMs) ||
	timeMs < 0 ||
	timeMs > 60000 ||
	!Number.isSafeInteger(pairs) ||
	pairs < 1 ||
	pairs > 1000
)
	throw new Error(
		"usage: node --import tsx scripts/benchmark-mcts.ts [milliseconds=25] [seed-pairs=8] [first-seed=501]",
	);
if (!Number.isSafeInteger(firstSeed) || firstSeed < 0)
	throw new Error("first seed must be a nonnegative integer");

for (let seed = firstSeed; seed < firstSeed + pairs; seed++) {
	for (const searchTeam of [0, 1]) {
		let hand = newHand({ seed, dealer: 3, teamScores: [0, 0] });
		let history: PublicHistory | undefined;
		const rng = mulberry32(seed * 2 + searchTeam);
		let actions = 0;
		let resets = 0;
		let simulations = 0;
		let maximumMs = 0;
		while (!hand.outcome && actions < 2000) {
			const result =
				teamOf(hand.turn) === searchTeam
					? await chooseCanasta(observeCanasta(hand, hand.turn, history), {
							timeMs,
							rng,
						})
					: undefined;
			const action = result ? result.action : botActions(hand, hand.turn)[0];
			if (!action)
				throw new Error(
					`no action at seed ${seed}, team ${searchTeam}, action ${actions}`,
				);
			const step = applyAction(hand, hand.turn, action);
			if (!step.ok) throw new Error(step.reason);
			history = recordTransfer(history, hand, step.hand, hand.turn);
			hand = step.hand;
			actions++;
			resets += Number(action.type === "resetTurn");
			simulations += result?.iterations ?? 0;
			maximumMs = Math.max(maximumMs, result?.elapsedMs ?? 0);
		}
		const scores = scoreHand(hand).map((score) => score.total);
		console.log(
			JSON.stringify({
				seed,
				searchTeam,
				timeMs,
				ended: hand.outcome !== null,
				actions,
				resets,
				simulations,
				maximumMs,
				scores,
				difference: (scores[searchTeam] ?? 0) - (scores[1 - searchTeam] ?? 0),
			}),
		);
	}
}
