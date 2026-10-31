import { expect, it } from "vitest";
import { modernDiscardRiskV1 } from "../../src/bot/modern-discard-risk-prior";
import { observeModern } from "../../src/bot/modern-inference";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { modernResearchAgent } from "../../src/bot/research/modern-arena";
import { buildDecks } from "../../src/canasta/cards";
import { modernNewHand } from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";
import { mulberry32 } from "../../src/canasta/random";

it("uses the acting hand and public opposing counts, including pending bonuses", () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const own = ["0-KC", "1-KC", "0-AC"].map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const view = {
		...modernViewFor(dealt.hand, 0),
		hand: own,
		handCounts: [3, 2, 10, 12],
		bonusCounts: [0, 1, 0, 0],
	};
	const king = modernDiscardRiskV1(view, { type: "discard", card: "0-KC" });
	expect(king).toBeCloseTo(1 / 6);
	expect(
		modernDiscardRiskV1(view, { type: "discard", card: "1-KC" }),
	).toBeCloseTo(king);
	expect(
		modernDiscardRiskV1(view, { type: "discard", card: "0-AC" }),
	).toBeCloseTo(1 / 3);
	expect(
		modernDiscardRiskV1(
			{ ...view, handCounts: [3, 2, 0, 12] },
			{ type: "discard", card: "0-KC" },
		),
	).toBeCloseTo(king);
	expect(
		modernDiscardRiskV1(
			{ ...view, handCounts: [3, 2, 0, 12], bonusCounts: [0, 2, 0, 0] },
			{ type: "discard", card: "0-AC" },
		),
	).toBe(0);
	expect(modernDiscardRiskV1(view, { type: "draw" })).toBe(0);
	expect(() =>
		modernDiscardRiskV1(view, { type: "discard", card: "not-owned" }),
	).toThrow("discard refers to a card outside the hand");
	expect(() =>
		modernDiscardRiskV1(
			{ ...view, bonusCounts: [0, -1, 0, 0] },
			{ type: "discard", card: "0-KC" },
		),
	).toThrow("invalid public card counts");
});

it("can alter a root discard prior without changing the default policy", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const own = ["0-KC", "0-KD", "0-4C"];
	const opponent = ["0-9C"];
	const partner = ["0-6C"];
	const otherOpponent = ["0-9D", "0-9H", "0-9S"];
	const pile = ["0-5C"];
	const occupied = [...own, ...opponent, ...partner, ...otherOpponent, ...pile];
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [
			own.map(get),
			opponent.map(get),
			partner.map(get),
			otherOpponent.map(get),
		] as const,
		pile: pile.map(get),
		stock: deck.filter((card) => !occupied.includes(card.id)),
		teams: [
			{ opened: true, threes: [], melds: [] },
			{ opened: false, threes: [], melds: [] },
		] as const,
	};
	const observation = observeModern({ ...base, turnStart: base, undo: [] }, 0);
	const options = { timeMs: 30000, maxIterations: 1, maxDepth: 1 };
	const baseline = await chooseModernPosition(observation, {
		...options,
		rng: mulberry32(7),
	});
	const zero = await chooseModernPosition(observation, {
		...options,
		discardRiskV1Weight: 0,
		rng: mulberry32(7),
	});
	const riskAware = await chooseModernPosition(observation, {
		...options,
		discardRiskV1Weight: 100,
		rng: mulberry32(7),
	});
	expect(baseline.action).toEqual({ type: "discard", card: "0-4C" });
	expect(zero.action).toEqual(baseline.action);
	expect(riskAware.action?.type).toBe("discard");
	if (riskAware.action?.type !== "discard") throw new Error("missing discard");
	expect(["0-KC", "0-KD"]).toContain(riskAware.action.card);
	const agent = modernResearchAgent({
		priorWeights: MODERN_PRIOR_WEIGHTS,
		discardRiskV1Weight: 100,
		simulations: 1,
		timeMs: 30000,
		depth: 1,
	});
	const decision = await agent.decide(observation, {
		rng: mulberry32(7),
		handNo: 0,
	});
	if (!decision.ok || decision.action.type !== "discard")
		throw new Error("missing research discard");
	expect(["0-KC", "0-KD"]).toContain(decision.action.card);
	const deeper = await chooseModernPosition(observation, {
		...options,
		maxIterations: 10,
		maxDepth: 3,
		discardRiskV1Weight: 100,
		rng: mulberry32(7),
	});
	expect(deeper.iterations).toBe(10);
	const negativeOwn = ["0-4C", "0-4D", "0-KD"];
	const negativeOccupied = [
		...negativeOwn,
		...opponent,
		...partner,
		...otherOpponent,
		...pile,
	];
	const negativeBase = {
		...base,
		hands: [
			negativeOwn.map(get),
			opponent.map(get),
			partner.map(get),
			otherOpponent.map(get),
		] as const,
		stock: deck.filter((card) => !negativeOccupied.includes(card.id)),
	};
	const negativeObservation = observeModern(
		{ ...negativeBase, turnStart: negativeBase, undo: [] },
		0,
	);
	const negativeBaseline = await chooseModernPosition(negativeObservation, {
		...options,
		rng: mulberry32(7),
	});
	const negative = await chooseModernPosition(negativeObservation, {
		...options,
		discardRiskV1Weight: -100,
		rng: mulberry32(7),
	});
	expect(negativeBaseline.action).toEqual({ type: "discard", card: "0-KD" });
	if (negative.action?.type !== "discard") throw new Error("missing discard");
	expect(["0-4C", "0-4D"]).toContain(negative.action.card);
	await expect(
		chooseModernPosition(observation, {
			...options,
			discardRiskV1Weight: Number.NaN,
		}),
	).rejects.toThrow("invalid modern discard-risk weight");
	await expect(
		chooseModernPosition(observation, {
			...options,
			priorWeights: null,
			discardRiskV1Weight: 1,
		}),
	).rejects.toThrow("invalid modern discard-risk weight");
});
