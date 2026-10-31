import { expect, it } from "vitest";
import { knownCards, sampleCards } from "../../src/bot/card-knowledge";
import {
	inferModern,
	observeModern,
	sampleModernAtTurnStart,
	sampleModernPosition,
} from "../../src/bot/modern-inference";
import { buildDecks } from "../../src/canasta/cards";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { mulberry32 } from "../../src/canasta/random";
import { recordModernTransfer } from "../../src/game/modern-history";

it("infers and samples a complete modern deal from only the observing seat's view", () => {
	const result = modernNewHand({ seed: 42, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const view = modernViewFor(result.hand, 0);
	const belief = inferModern(view, 0);
	const own = belief.players[0];
	if (!own) throw new Error("missing observer row");
	expect(knownCards(own).unknown).toBe(0);
	expect(belief.players.map((row) => row.count)).toEqual([
		...view.handCounts,
		...view.bonusCounts,
		view.stockCount,
	]);
	for (let seed = 0; seed < 8; seed++) {
		const sample = sampleCards(belief, mulberry32(seed));
		expect(sample[0]?.toSorted()).toEqual(
			view.hand.map((card) => `${card.rank}${card.suit ?? ""}`).toSorted(),
		);
		for (const hand of sample.slice(0, 4))
			expect(hand.some((face) => face.startsWith("3"))).toBe(false);
		expect(
			sample.flat().length + view.teams.flatMap((team) => team.threes).length,
		).toBe(108);
	}
	const sampled = sampleModernAtTurnStart(view, 0, belief, mulberry32(7));
	const all = [
		...sampled.hands.flat(),
		...sampled.bonuses.flat(),
		...sampled.stock,
		...sampled.pile,
		...sampled.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((meld) => meld.cards),
		]),
	];
	expect(all).toHaveLength(108);
	expect(new Set(all.map((card) => card.id)).size).toBe(108);
	expect(sampled.hands[0]).toEqual(view.hand);
	expect(modernViewFor(sampled, 0)).toEqual(view);
	const a = result.hand.hands[1][0];
	const b = result.hand.hands[2][0];
	if (!a || !b) throw new Error("missing hidden cards");
	const swapped = {
		...result.hand,
		hands: [
			result.hand.hands[0],
			[b, ...result.hand.hands[1].slice(1)],
			[a, ...result.hand.hands[2].slice(1)],
			result.hand.hands[3],
		] as const,
	};
	const otherView = modernViewFor(swapped, 0);
	const otherBelief = inferModern(otherView, 0);
	expect(
		sampleModernAtTurnStart(otherView, 0, otherBelief, mulberry32(7)),
	).toEqual(sampled);
});

it("reconstructs the actor's turn baseline after drawing and melding", () => {
	const dealt = modernNewHand({ seed: 0, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const melded = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-8C", "1-8S", "1-8C"],
	});
	if (!melded.ok) throw new Error(melded.reason);
	const observation = observeModern(melded.hand, 0);
	const belief = inferModern(observation.view, 0);
	const sample = sampleModernPosition(observation, belief, mulberry32(3));
	expect(modernViewFor(sample, 0)).toEqual(observation.view);
	expect(
		modernViewFor(
			{ ...sample.turnStart, turnStart: sample.turnStart, undo: [] },
			0,
		),
	).toEqual(observation.turnStart);
	for (const position of [sample, sample.turnStart]) {
		const cards = [
			...position.hands.flat(),
			...position.bonuses.flat(),
			...position.stock,
			...position.pile,
			...position.teams.flatMap((team) => [
				...team.threes,
				...team.melds.flatMap((meld) => meld.cards),
			]),
		];
		expect(cards).toHaveLength(108);
		expect(new Set(cards.map((card) => card.id)).size).toBe(108);
	}
});

it("reconstructs the pile top and its opening exclusion during a staged pickup", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = [
		"0-8C",
		"0-8D",
		"0-AC",
		"0-AD",
		"0-AH",
		"0-KC",
		"0-KD",
		"0-KH",
		"0-KS",
		"0-7C",
		"0-7D",
		"0-7H",
		"0-7S",
		"1-7C",
		"0-4C",
		"0-4D",
		"0-5D",
		"0-5H",
	];
	const pile = ["0-5C", "1-8C"];
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const base = {
		...dealt.hand.turnStart,
		hands: [ids.map(get), [], [], []] as const,
		pile: pile.map(get),
		stock: deck.filter((card) => ![...ids, ...pile].includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const before = { ...base, turnStart: base, undo: [] };
	const pickup = modernApplyAction(before, 0, {
		type: "take-pile",
		cards: ids.slice(0, 2),
	});
	if (!pickup.ok) throw new Error(pickup.reason);
	const meld = modernApplyAction(pickup.hand, 0, {
		type: "meld",
		cards: ids.slice(2, 5),
	});
	if (!meld.ok) throw new Error(meld.reason);
	const first = recordModernTransfer(undefined, before, pickup.hand);
	const history = recordModernTransfer(first, pickup.hand, meld.hand);
	const observation = observeModern(meld.hand, 0, history);
	const belief = inferModern(observation.view, 0, history);
	const sample = sampleModernPosition(observation, belief, mulberry32(5));
	expect(modernViewFor(sample, 0)).toEqual(observation.view);
	expect(
		modernViewFor(
			{ ...sample.turnStart, turnStart: sample.turnStart, undo: [] },
			0,
		),
	).toEqual(observation.turnStart);
	const top = sample.turnStart.pile.at(-1);
	if (!top) throw new Error("missing reconstructed top card");
	expect(
		sample.teams[0].melds.some((meld) =>
			meld.cards.some((card) => card.id === top.id),
		),
	).toBe(true);
	expect(modernApplyAction(sample, 0, { type: "commit-pile" }).ok).toBe(false);
	let after = meld.hand;
	let currentHistory = history;
	for (const action of [
		{ type: "meld" as const, cards: ids.slice(5, 9) },
		{ type: "meld" as const, cards: ids.slice(9, 14) },
		{ type: "commit-pile" as const },
		{ type: "meld" as const, cards: ["0-5C", "0-5D", "0-5H"] },
	]) {
		const step = modernApplyAction(after, 0, action);
		if (!step.ok) throw new Error(step.reason);
		currentHistory = recordModernTransfer(currentHistory, after, step.hand);
		after = step.hand;
	}
	const committed = observeModern(after, 0, currentHistory);
	const determinized = sampleModernPosition(
		committed,
		inferModern(committed.view, 0, currentHistory),
		mulberry32(6),
	);
	expect(modernViewFor(determinized, 0)).toEqual(committed.view);
	expect(
		modernViewFor(
			{
				...determinized.turnStart,
				turnStart: determinized.turnStart,
				undo: [],
			},
			0,
		),
	).toEqual(committed.turnStart);
	for (const position of [
		sample,
		sample.turnStart,
		determinized,
		determinized.turnStart,
	]) {
		const cards = [
			...position.hands.flat(),
			...position.bonuses.flat(),
			...position.stock,
			...position.pile,
			...position.teams.flatMap((team) => [
				...team.threes,
				...team.melds.flatMap((item) => item.cards),
			]),
		];
		expect(cards).toHaveLength(108);
		expect(new Set(cards.map((card) => card.id)).size).toBe(108);
	}
});
