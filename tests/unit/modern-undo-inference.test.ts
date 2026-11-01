import { expect, it } from "vitest";
import { sampleCards } from "../../src/bot/card-knowledge";
import {
	modernActionKey,
	modernSearchActions,
} from "../../src/bot/modern-actions";
import {
	inferModern,
	observeModern,
	sampleModernPosition,
} from "../../src/bot/modern-inference";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { buildDecks } from "../../src/canasta/cards";
import {
	type ModernHandSnapshot,
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { mulberry32 } from "../../src/canasta/random";
import { cardFace } from "../../src/game/canasta-history";

it("combines observation partitioning with reconstructed undo history", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const melded = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-AC", "0-AS", "1-JK0"],
	});
	if (!melded.ok) throw new Error(melded.reason);
	const result = await chooseModernPosition(observeModern(melded.hand, 0), {
		timeMs: 20000,
		maxIterations: 4,
		maxDepth: 4,
		partitionObservations: true,
		rng: mulberry32(42),
	});
	expect(result.iterations).toBe(4);
	if (!result.action) throw new Error("missing search action");
	expect(modernApplyAction(melded.hand, 0, result.action).ok).toBe(true);
}, 30000);

it("preserves the actor's latest undo and retraction in sampled positions", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const melded = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-AC", "0-AS", "1-JK0"],
	});
	if (!melded.ok) throw new Error(melded.reason);
	const observation = observeModern(melded.hand, 0);
	const belief = inferModern(observation.view, 0, observation.history);
	const expectedAllocation = sampleCards(belief, mulberry32(2));
	expect(() =>
		sampleModernPosition(
			{ ...observation, undoViews: [] },
			belief,
			mulberry32(2),
		),
	).toThrow("modern undo history does not match the observation");
	const sample = sampleModernPosition(observation, belief, mulberry32(2));
	for (const seat of [1, 2, 3] as const)
		expect(sample.hands[seat].map(cardFace)).toEqual(expectedAllocation[seat]);
	for (const seat of [0, 1, 2, 3] as const)
		expect(sample.bonuses[seat].map(cardFace)).toEqual(
			expectedAllocation[seat + 4],
		);
	expect(sample.stock.map(cardFace)).toEqual(expectedAllocation[8]);
	for (const action of [{ type: "undo" }, { type: "retract" }] as const) {
		const actual = modernApplyAction(melded.hand, 0, action);
		const simulated = modernApplyAction(sample, 0, action);
		expect(actual.ok).toBe(true);
		expect(simulated.ok).toBe(true);
		if (!actual.ok || !simulated.ok) throw new Error("missing transition");
		expect(modernViewFor(simulated.hand, 0)).toEqual(
			modernViewFor(actual.hand, 0),
		);
	}
});

it("searches the real forced-retraction action instead of evaluating an empty root", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-8H", "0-2S", "0-2H"];
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ opened: true, threes: [], melds: [] },
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	const meld = modernApplyAction({ ...base, turnStart: base, undo: [] }, 0, {
		type: "meld",
		cards: ids.slice(0, 3),
	});
	if (!meld.ok) throw new Error(meld.reason);
	const result = await chooseModernPosition(observeModern(meld.hand, 0), {
		timeMs: 30000,
		maxIterations: 4,
		maxDepth: 4,
		rng: mulberry32(1),
	});
	expect(result.iterations).toBe(4);
	expect(result.action?.type).toBe("retract");
	expect(
		result.choices.some(
			(choice) => choice.action.type === "retract" && choice.visits > 0,
		),
	).toBe(true);
}, 40000);

it("preserves a further retraction after a partial retraction", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-8H", "0-8S", "0-7C", "0-AC"];
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ opened: true, threes: [], melds: [] },
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	const meld = modernApplyAction({ ...base, turnStart: base, undo: [] }, 0, {
		type: "meld",
		cards: ids.slice(0, 4),
	});
	if (!meld.ok) throw new Error(meld.reason);
	const first = modernApplyAction(meld.hand, 0, { type: "retract" });
	if (!first.ok) throw new Error(first.reason);
	const observation = observeModern(first.hand, 0);
	const sampled = sampleModernPosition(
		observation,
		inferModern(observation.view, 0),
		mulberry32(3),
	);
	const expected = modernApplyAction(first.hand, 0, { type: "retract" });
	const received = modernApplyAction(sampled, 0, { type: "retract" });
	if (!expected.ok || !received.ok) throw new Error("missing retraction");
	expect(modernViewFor(received.hand, 0)).toEqual(
		modernViewFor(expected.hand, 0),
	);
});

it("retracts indistinguishable copies without assuming their public identity", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8S", "1-8S", "0-8C", "0-8D", "0-7C", "0-AC"];
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ opened: true, threes: [], melds: [] },
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	const meld = modernApplyAction({ ...base, turnStart: base, undo: [] }, 0, {
		type: "meld",
		cards: ["1-8S", "0-8C", "0-8D", "0-8S"],
	});
	if (!meld.ok) throw new Error(meld.reason);
	const observation = observeModern(meld.hand, 0);
	const sampled = sampleModernPosition(
		observation,
		inferModern(observation.view, 0),
		mulberry32(9),
	);
	const expected = modernApplyAction(meld.hand, 0, { type: "retract" });
	const received = modernApplyAction(sampled, 0, { type: "retract" });
	if (!expected.ok || !received.ok) throw new Error("missing retraction");
	const visible = (hand: typeof received.hand) => {
		const { hand: ownHand, ...rest } = modernViewFor(hand, 0);
		return { ...rest, hand: ownHand.map(({ rank, suit }) => ({ rank, suit })) };
	};
	expect(visible(received.hand)).toEqual(visible(expected.hand));
});

it("does not expose hidden cards in the actor's recorded undo history", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const melded = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-AC", "0-AS", "1-JK0"],
	});
	if (!melded.ok) throw new Error(melded.reason);
	const swap = (snapshot: ModernHandSnapshot): ModernHandSnapshot => {
		const a = snapshot.hands[1][0];
		const b = snapshot.hands[2][0];
		if (!a || !b) throw new Error("missing hidden cards");
		return {
			...snapshot,
			hands: [
				snapshot.hands[0],
				[b, ...snapshot.hands[1].slice(1)],
				[a, ...snapshot.hands[2].slice(1)],
				snapshot.hands[3],
			],
		};
	};
	const changed = {
		...melded.hand,
		...swap(melded.hand),
		turnStart: swap(melded.hand.turnStart),
		undo: melded.hand.undo.map(swap),
	};
	const before = observeModern(melded.hand, 0);
	const after = observeModern(changed, 0);
	expect(after).toEqual(before);
	const a = sampleModernPosition(
		before,
		inferModern(before.view, 0),
		mulberry32(5),
	);
	const b = sampleModernPosition(
		after,
		inferModern(after.view, 0),
		mulberry32(5),
	);
	expect(b).toEqual(a);
});

it("reconstructs undo after taking and then melding a pile card", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-5D", "0-5H", "0-4C"];
	const pileIds = ["0-5C", "1-8C"];
	const card = (id: string) => {
		const item = deck.find((value) => value.id === id);
		if (!item) throw new Error(`missing ${id}`);
		return item;
	};
	const base = {
		...dealt.hand.turnStart,
		hands: [ids.map(card), [], [], []] as const,
		pile: pileIds.map(card),
		stock: deck.filter((item) => ![...ids, ...pileIds].includes(item.id)),
		teams: [
			{ opened: true, threes: [], melds: [] },
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	const pickup = modernApplyAction({ ...base, turnStart: base, undo: [] }, 0, {
		type: "take-pile",
		cards: ids.slice(0, 2),
	});
	if (!pickup.ok) throw new Error(pickup.reason);
	const meld = modernApplyAction(pickup.hand, 0, {
		type: "meld",
		cards: ["0-5C", "0-5D", "0-5H"],
	});
	if (!meld.ok) throw new Error(meld.reason);
	const observation = observeModern(meld.hand, 0);
	let actual = meld.hand;
	let sampled = sampleModernPosition(
		observation,
		inferModern(observation.view, 0),
		mulberry32(8),
	);
	const stock = sampled.stock;
	for (let i = 0; i < 2; i++) {
		const expected = modernApplyAction(actual, 0, { type: "undo" });
		const received = modernApplyAction(sampled, 0, { type: "undo" });
		if (!expected.ok || !received.ok) throw new Error("missing undo");
		actual = expected.hand;
		sampled = received.hand;
		expect(modernViewFor(sampled, 0)).toEqual(modernViewFor(actual, 0));
		expect(sampled.stock).toEqual(stock);
		const actionKeys = (hand: typeof sampled) =>
			modernSearchActions(hand)
				.map((action) => modernActionKey(hand, action))
				.toSorted();
		expect(actionKeys(sampled)).toEqual(actionKeys(actual));
		const cards = [
			...sampled.hands.flat(),
			...sampled.bonuses.flat(),
			...sampled.stock,
			...sampled.pile,
			...sampled.teams.flatMap((team) => [
				...team.threes,
				...team.melds.flatMap((item) => item.cards),
			]),
		];
		expect(new Set(cards.map((item) => item.id)).size).toBe(108);
	}
});

it("undoes several sampled actions one at a time without changing hidden cards", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const first = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["0-AC", "0-AS", "1-JK0"],
	});
	if (!first.ok) throw new Error(first.reason);
	const second = modernApplyAction(first.hand, 0, {
		type: "meld",
		cards: ["0-10C", "0-10S", "1-JK1"],
	});
	if (!second.ok) throw new Error(second.reason);
	const observation = observeModern(second.hand, 0);
	let actual = second.hand;
	let sampled = sampleModernPosition(
		observation,
		inferModern(observation.view, 0, observation.history),
		mulberry32(2),
	);
	const hiddenHands = sampled.hands.slice(1);
	const stock = sampled.stock;
	for (let i = 0; i < 2; i++) {
		const actualUndo = modernApplyAction(actual, 0, { type: "undo" });
		const sampledUndo = modernApplyAction(sampled, 0, { type: "undo" });
		expect(actualUndo.ok).toBe(true);
		expect(sampledUndo.ok).toBe(true);
		if (!actualUndo.ok || !sampledUndo.ok) throw new Error("missing undo");
		actual = actualUndo.hand;
		sampled = sampledUndo.hand;
		expect(modernViewFor(sampled, 0)).toEqual(modernViewFor(actual, 0));
		expect(sampled.hands.slice(1)).toEqual(hiddenHands);
		expect(sampled.stock).toEqual(stock);
	}
});
