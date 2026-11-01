import { expect, it } from "vitest";
import { modernSearchActions } from "../../src/bot/modern-actions";
import {
	inferModern,
	observeModern,
	sampleModernPosition,
} from "../../src/bot/modern-inference";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { mulberry32 } from "../../src/canasta/random";

it("replays undo histories across sampled deals without changing hidden cards", () => {
	let checked = 0;
	for (let seed = 0; seed < 12; seed++) {
		const dealt = modernNewHand({ seed, dealer: 3, teamScores: [0, 0] });
		if (!dealt.ok) throw new Error(dealt.reason);
		const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
		if (!drawn.ok) throw new Error(drawn.reason);
		let hand = drawn.hand;
		const random = mulberry32(seed + 500);
		for (let step = 0; step < 3; step++) {
			const actions = modernSearchActions(hand).filter(
				(action) => action.type === "meld" || action.type === "extend",
			);
			const action = actions[Math.floor(random() * actions.length)];
			if (!action) break;
			const applied = modernApplyAction(hand, 0, action);
			if (!applied.ok) throw new Error(applied.reason);
			hand = applied.hand;
			const observation = observeModern(hand, 0);
			const belief = inferModern(observation.view, 0);
			for (let sampleSeed = 0; sampleSeed < 3; sampleSeed++) {
				let sampled = sampleModernPosition(
					observation,
					belief,
					mulberry32(sampleSeed),
				);
				let actual = hand;
				const hidden = [sampled.hands.slice(1), sampled.bonuses, sampled.stock];
				if (observation.canRetract) {
					const expected = modernApplyAction(actual, 0, { type: "retract" });
					const received = modernApplyAction(sampled, 0, { type: "retract" });
					if (!expected.ok || !received.ok)
						throw new Error(
							`missing retraction at ${seed}, ${step}, ${sampleSeed}`,
						);
					expect(modernViewFor(received.hand, 0)).toEqual(
						modernViewFor(expected.hand, 0),
					);
					expect([
						received.hand.hands.slice(1),
						received.hand.bonuses,
						received.hand.stock,
					]).toEqual(hidden);
				}
				for (let i = 0; i < hand.undo.length; i++) {
					const expected = modernApplyAction(actual, 0, { type: "undo" });
					const received = modernApplyAction(sampled, 0, { type: "undo" });
					if (!expected.ok || !received.ok) throw new Error("missing undo");
					actual = expected.hand;
					sampled = received.hand;
					expect(modernViewFor(sampled, 0)).toEqual(modernViewFor(actual, 0));
					expect([
						sampled.hands.slice(1),
						sampled.bonuses,
						sampled.stock,
					]).toEqual(hidden);
				}
				checked++;
			}
		}
	}
	expect(checked).toBeGreaterThanOrEqual(20);
}, 30000);
