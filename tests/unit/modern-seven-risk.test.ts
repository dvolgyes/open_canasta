import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { modernSevenBlockedV1 } from "../../src/bot/modern-seven-risk";
import { buildDecks } from "../../src/canasta/cards";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";

it("distinguishes opposing committed sevens from cards that can still move", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ownIds = ["0-7C", "0-7D", "0-7H", "0-4C", "0-4D"];
	const otherIds = ["0-7S", "1-7C", "1-7D"];
	const cards = (ids: readonly string[]) =>
		ids.map((id) => {
			const card = deck.find((item) => item.id === id);
			if (!card) throw new Error(`missing ${id}`);
			return card;
		});
	const own = cards(ownIds);
	const other = cards(otherIds);
	const remaining = deck.filter(
		(card) => !ownIds.includes(card.id) && !otherIds.includes(card.id),
	);
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: remaining,
		pile: [],
		teams: [
			{ melds: [], threes: [], opened: true },
			{
				melds: [
					{
						id: "opponent-sevens",
						kind: "natural" as const,
						rank: "7" as const,
						cards: other,
					},
				],
				threes: [],
				opened: true,
			},
		] as const,
	};
	const action = { type: "meld" as const, cards: ownIds.slice(0, 3) };
	const blocked = { ...base, turnStart: base, undo: [] };
	expect(modernSevenBlockedV1(blocked, action)).toBe(-3);
	const melded = modernApplyAction(blocked, 0, action);
	if (!melded.ok) throw new Error(melded.reason);
	expect(modernSevenBlockedV1(melded.hand, { type: "undo" })).toBe(0);
	const movableBase = {
		...base,
		teams: [base.teams[0], { ...base.teams[1], melds: [] }] as const,
	};
	const heldBase = { ...movableBase, hands: [own, other, [], []] as const };
	const pileBase = { ...movableBase, pile: other };
	expect(
		modernSevenBlockedV1(
			{ ...heldBase, turnStart: heldBase, undo: [] },
			action,
		),
	).toBe(0);
	expect(
		modernSevenBlockedV1(
			{ ...pileBase, turnStart: pileBase, undo: [] },
			action,
		),
	).toBe(0);
	const sevenIds = ["0-7C", "0-7D", "0-7H", "0-7S", "1-7C", "1-7D", "1-7H"];
	const completedOwn = cards([...sevenIds, "0-4C", "0-4D"]);
	const completeBase = {
		...movableBase,
		hands: [completedOwn, [], [], []] as const,
		stock: deck.filter(
			(card) => !completedOwn.some((item) => item.id === card.id),
		),
	};
	expect(
		modernSevenBlockedV1(
			{ ...completeBase, turnStart: completeBase, undo: [] },
			{ type: "meld", cards: sevenIds },
		),
	).toBe(0);
	const weights = Object.fromEntries(
		Object.keys(MODERN_PRIOR_WEIGHTS).map((key) => [
			key,
			key === "cardsMelded" ? 100 : 0,
		]),
	) as typeof MODERN_PRIOR_WEIGHTS;
	const observation = observeModern(blocked, 0);
	const options = {
		timeMs: 30000,
		maxIterations: 1,
		maxDepth: 1,
		priorWeights: weights,
	};
	const baseline = await chooseModernPosition(observation, {
		...options,
		rng: mulberry32(7),
	});
	const zero = await chooseModernPosition(observation, {
		...options,
		sevenBlockedV1Weight: 0,
		rng: mulberry32(7),
	});
	const cautious = await chooseModernPosition(observation, {
		...options,
		sevenBlockedV1Weight: 500,
		rng: mulberry32(7),
	});
	expect(baseline.action?.type).toBe("meld");
	expect(zero.action).toEqual(baseline.action);
	expect(cautious.action?.type).toBe("discard");
	await expect(
		chooseModernPosition(observation, {
			...options,
			sevenBlockedV1Weight: Number.NaN,
		}),
	).rejects.toThrow("invalid modern seven-risk weight");
	await expect(
		chooseModernPosition(observation, {
			...options,
			sevenBlockedV1Weight: null as unknown as number,
		}),
	).rejects.toThrow("invalid modern seven-risk weight");
	await expect(
		chooseModernPosition(observation, {
			...options,
			priorWeights: null,
			sevenBlockedV1Weight: 1,
		}),
	).rejects.toThrow("invalid modern seven-risk weight");
}, 30000);
