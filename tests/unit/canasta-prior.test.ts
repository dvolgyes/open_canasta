import { expect, it } from "vitest";
import {
	type PriorWeights,
	priorFeatures,
	REFERENCE_PRIOR,
	validPriorWeights,
	weightedPriorScore,
} from "../../src/bot/canasta-prior";
import {
	chooseCanasta,
	observeCanasta,
	searchActions,
} from "../../src/bot/canasta-search";
import { scoreAction } from "../../src/bot/heuristic";
import { applyAction, mulberry32, newHand } from "../../src/canasta";

it("reconstructs the frozen heuristic through actual draws, melds, pickups and discards", () => {
	let checked = 0;
	const types = new Set<string>();
	for (const seed of [14, 31, 85, 113]) {
		let hand = newHand({ seed, dealer: 3, teamScores: [0, 0] });
		for (let turn = 0; turn < 120 && !hand.outcome; turn++) {
			const actions = searchActions(hand);
			for (const action of actions) {
				expect(
					weightedPriorScore(
						priorFeatures(hand, hand.turn, action),
						REFERENCE_PRIOR,
					),
				).toBe(scoreAction(hand, hand.turn, action));
				types.add(action.type);
				checked++;
			}
			const action = [...actions].sort(
				(a, b) =>
					scoreAction(hand, hand.turn, b) - scoreAction(hand, hand.turn, a),
			)[0];
			if (!action) throw new Error("no action");
			const step = applyAction(hand, hand.turn, action);
			if (!step.ok) throw new Error(step.reason);
			hand = step.hand;
		}
	}
	expect(checked).toBeGreaterThan(1000);
	expect(types).toEqual(
		new Set(["draw", "takePile", "meld", "extend", "discard", "resetTurn"]),
	);
}, 20000);

it("rejects incomplete, extra, non-finite and excessive weights", () => {
	expect(validPriorWeights(REFERENCE_PRIOR)).toBe(true);
	for (const value of [
		{},
		{ ...REFERENCE_PRIOR, typo: 1 },
		{ ...REFERENCE_PRIOR, draw: NaN },
		{ ...REFERENCE_PRIOR, draw: 1e100 },
	])
		expect(validPriorWeights(value)).toBe(false);
});

it("a frozen reference vector preserves seeded search decisions and visit statistics", async () => {
	const observation = observeCanasta(
		newHand({ seed: 1201, dealer: 3, teamScores: [0, 0] }),
		0,
	);
	const run = (weighted: boolean) =>
		chooseCanasta(observation, {
			timeMs: 10000,
			maxIterations: 12,
			maxDepth: 8,
			rng: mulberry32(41),
			...(weighted ? { priorWeights: REFERENCE_PRIOR } : {}),
		});
	const baseline = await run(false);
	const weighted = await run(true);
	expect(weighted.iterations).toBe(12);
	expect(weighted.action).toEqual(baseline.action);
	expect(weighted.choices).toEqual(baseline.choices);
});

it("a null prior matches all-zero features and is unaffected by the UCB prior multiplier", async () => {
	const hand = newHand({ seed: 1201, dealer: 3, teamScores: [0, 0] });
	const drawn = applyAction(hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const observation = observeCanasta(drawn.hand, 0);
	const zero = Object.fromEntries(
		Object.keys(REFERENCE_PRIOR).map((key) => [key, 0]),
	) as PriorWeights;
	const run = (priorWeights: PriorWeights | null, priorWeight: number) =>
		chooseCanasta(observation, {
			timeMs: 10000,
			maxIterations: 16,
			maxDepth: 8,
			rng: mulberry32(41),
			priorWeights,
			priorWeight,
		});
	const absent = await run(null, 1);
	expect(absent.iterations).toBe(16);
	for (const result of [await run(zero, 1), await run(null, 100)]) {
		expect(result.action).toEqual(absent.action);
		expect(result.choices).toEqual(absent.choices);
	}
});
