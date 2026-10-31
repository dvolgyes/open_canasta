import { expect, it } from "vitest";
import { inferModern, observeModern } from "../../src/bot/modern-inference";
import { modernKnownPairV1 } from "../../src/bot/modern-known-pair-prior";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { buildDecks } from "../../src/canasta/cards";
import { modernNewHand } from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";
import type { ModernPublicHistory } from "../../src/game/modern-history";

it("uses guaranteed opponent pairs at the root without guessing duplicate identities", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const ownIds = ["0-8S", "0-8C", "0-KD"];
	const opponentIds = ["0-8D", "0-8H"];
	const pileIds = ["0-4C", "0-5C", "0-6C"];
	const meldIds = ["0-KC", "0-KH", "0-KS"];
	const occupied = [...ownIds, ...opponentIds, ...pileIds, ...meldIds];
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [ownIds.map(get), opponentIds.map(get), [], []] as const,
		pile: pileIds.map(get),
		stock: deck.filter((card) => !occupied.includes(card.id)),
		teams: [
			{ opened: true, threes: [], melds: [] },
			{
				opened: true,
				threes: [],
				melds: [
					{
						id: "kings",
						kind: "natural" as const,
						rank: "K" as const,
						cards: meldIds.map(get),
					},
				],
			},
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const history: ModernPublicHistory = {
		initialCounts: [3, 0, 0, 0, 0, 0, 0, 0],
		events: [{ player: 1, gained: ["8D", "8H"], removed: [], drawn: 0 }],
	};
	const observation = observeModern(hand, 0, history);
	const belief = inferModern(observation.view, 0, history);
	const eight = { type: "discard" as const, card: "0-8S" };
	const king = { type: "discard" as const, card: "0-KD" };
	expect(modernKnownPairV1(observation.view, belief, eight)).toBe(-1);
	expect(modernKnownPairV1(observation.view, belief, king)).toBe(0);
	expect(modernKnownPairV1(observation.view, belief, { type: "draw" })).toBe(0);
	expect(() =>
		modernKnownPairV1(observation.view, belief, {
			type: "discard",
			card: "missing",
		}),
	).toThrow();
	const options = { timeMs: 30000, maxIterations: 1, maxDepth: 1 };
	const baseline = await chooseModernPosition(observation, {
		...options,
		rng: mulberry32(7),
	});
	const zero = await chooseModernPosition(observation, {
		...options,
		knownPairV1Weight: 0,
		rng: mulberry32(7),
	});
	const aware = await chooseModernPosition(observation, {
		...options,
		knownPairV1Weight: 50,
		rng: mulberry32(7),
	});
	expect(baseline.action?.type).toBe("discard");
	if (baseline.action?.type !== "discard")
		throw new Error("missing baseline discard");
	expect(ownIds.slice(0, 2)).toContain(baseline.action.card);
	expect(zero.action).toEqual(baseline.action);
	expect(aware.action).toEqual(king);
	const deeper = await chooseModernPosition(observation, {
		...options,
		maxIterations: 50,
		maxDepth: 4,
		knownPairV1Weight: 50,
		rng: mulberry32(7),
	});
	expect(deeper.iterations).toBe(50);
	expect(deeper.choices.some((choice) => choice.visits > 1)).toBe(true);
	await expect(
		chooseModernPosition(observation, {
			...options,
			knownPairV1Weight: Number.NaN,
		}),
	).rejects.toThrow("invalid modern known-pair weight");
	await expect(
		chooseModernPosition(observation, {
			...options,
			priorWeights: null,
			knownPairV1Weight: 1,
		}),
	).rejects.toThrow("invalid modern known-pair weight");
	const duplicateHistory: ModernPublicHistory = {
		...history,
		events: [{ player: 1, gained: ["8D", "8D"], removed: [], drawn: 0 }],
	};
	const duplicate = inferModern(observation.view, 0, duplicateHistory);
	expect(duplicate.players[1]?.minimum["8D"]).toBe(2);
	expect(modernKnownPairV1(observation.view, duplicate, eight)).toBe(-1);
	const afterRemoval = {
		...observation.view,
		handCounts: [3, 1, 0, 0],
		pile: [
			...observation.view.pile,
			{ rank: "8" as const, suit: "D" as const },
		],
	};
	const ambiguousHistory: ModernPublicHistory = {
		...history,
		events: [
			{ player: 1, gained: ["8D"], removed: [], drawn: 1 },
			{ player: 1, gained: [], removed: ["8D"], drawn: 0 },
		],
	};
	const ambiguous = inferModern(afterRemoval, 0, ambiguousHistory);
	expect(ambiguous.players[1]?.minimum["8D"] ?? 0).toBe(0);
	expect(modernKnownPairV1(afterRemoval, ambiguous, eight)).toBe(0);
}, 30000);
