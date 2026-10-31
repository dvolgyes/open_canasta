import { expect, it } from "vitest";
import { inferModern, observeModern } from "../../src/bot/modern-inference";
import { modernPairThreatV1 } from "../../src/bot/modern-pair-threat-prior";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { modernResearchAgent } from "../../src/bot/research/modern-arena";
import { buildDecks } from "../../src/canasta/cards";
import { modernNewHand } from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";
import type { ModernPublicHistory } from "../../src/game/modern-history";

it("penalizes a known next-opponent pair without looking at hidden hands", async () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const own = ["0-8S", "0-8C", "0-KD"];
	const opponent = ["0-8D", "0-8H"];
	const partner = ["0-7C"];
	const other = ["0-9C", "0-9D", "0-9H"];
	const pile = ["0-4C", "0-5C", "0-6C"];
	const meld = ["0-KC", "0-KH", "0-KS"];
	const occupied = [
		...own,
		...opponent,
		...partner,
		...other,
		...pile,
		...meld,
	];
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [
			own.map(get),
			opponent.map(get),
			partner.map(get),
			other.map(get),
		] as const,
		pile: pile.map(get),
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
						cards: meld.map(get),
					},
				],
			},
		] as const,
	};
	const history: ModernPublicHistory = {
		initialCounts: [3, 0, 1, 3, 0, 0, 0, 0],
		events: [{ player: 1, gained: ["8D", "8H"], removed: [], drawn: 0 }],
	};
	const observation = observeModern(
		{ ...base, turnStart: base, undo: [] },
		0,
		history,
	);
	const belief = inferModern(observation.view, 0, history);
	const eight = { type: "discard" as const, card: "0-8S" };
	const king = { type: "discard" as const, card: "0-KD" };
	expect(modernPairThreatV1(observation.view, belief, eight)).toBe(-1);
	expect(
		modernPairThreatV1(observation.view, belief, {
			type: "discard",
			card: "0-8C",
		}),
	).toBe(-1);
	expect(modernPairThreatV1(observation.view, belief, king)).toBeGreaterThan(
		-1,
	);
	const opponentTeam = observation.view.teams[1];
	const kings = opponentTeam.melds[0];
	if (kings?.kind !== "natural") throw new Error("missing king meld");
	const blocked = {
		...observation.view,
		teams: [
			observation.view.teams[0],
			{
				...opponentTeam,
				melds: [
					{
						...kings,
						cards: [...kings.cards, get("1-KC"), get("1-KH")],
					},
				],
			},
		] as const,
	};
	expect(modernPairThreatV1(blocked, belief, king)).toBe(0);
	expect(modernPairThreatV1(observation.view, belief, { type: "draw" })).toBe(
		0,
	);
	expect(() =>
		modernPairThreatV1(observation.view, belief, {
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
		pairThreatV1Weight: 0,
		rng: mulberry32(7),
	});
	const aware = await chooseModernPosition(observation, {
		...options,
		pairThreatV1Weight: 100,
		rng: mulberry32(7),
	});
	if (baseline.action?.type !== "discard")
		throw new Error("missing baseline discard");
	expect(["0-8S", "0-8C"]).toContain(baseline.action.card);
	expect(zero.action).toEqual(baseline.action);
	expect(aware.action).toEqual(king);
	const agent = modernResearchAgent({
		priorWeights: MODERN_PRIOR_WEIGHTS,
		pairThreatV1Weight: 100,
		simulations: 1,
		timeMs: 30000,
		depth: 1,
	});
	const decision = await agent.decide(observation, {
		rng: mulberry32(7),
		handNo: 0,
	});
	if (!decision.ok) throw new Error(decision.reason);
	expect(decision.action).toEqual(king);
	await expect(
		chooseModernPosition(observation, {
			...options,
			pairThreatV1Weight: Number.NaN,
		}),
	).rejects.toThrow("invalid modern pair-threat weight");
	await expect(
		chooseModernPosition(observation, {
			...options,
			priorWeights: null,
			pairThreatV1Weight: 1,
		}),
	).rejects.toThrow("invalid modern pair-threat weight");
});
