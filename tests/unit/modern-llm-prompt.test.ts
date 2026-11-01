import { expect, it } from "vitest";
import {
	modernActionKey,
	modernSearchActions,
} from "../../src/bot/modern-actions";
import { observeModern } from "../../src/bot/modern-inference";
import { modernLlmPrompt } from "../../src/bot/research/modern-llm-prompt";
import { buildDecks } from "../../src/canasta/cards";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";
import { cardFace } from "../../src/game/canasta-history";
import { recordModernTransfer } from "../../src/game/modern-history";

it("exposes the same public prompt when hidden cards are exchanged", () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const original = dealt.hand;
	const opponent = [...original.hands[1]];
	const stock = [...original.stock];
	const held = opponent[0];
	if (!held) throw new Error("missing hidden hand card");
	const stockIndex = stock.findIndex(
		(card) => card.rank !== "3" && cardFace(card) !== cardFace(held),
	);
	const replacement = stock[stockIndex];
	if (stockIndex < 0 || !replacement)
		throw new Error("missing hidden exchange");
	opponent[0] = replacement;
	stock[stockIndex] = held;
	const altered = {
		...original,
		hands: [
			original.hands[0],
			opponent,
			original.hands[2],
			original.hands[3],
		] as const,
		stock,
	};
	const make = (hand: typeof original) =>
		modernLlmPrompt(observeModern(hand, 0), {
			rng: mulberry32(91),
			timeMs: 30000,
		});
	const first = make(original),
		second = make(altered);
	if (!first.ok || !second.ok) throw new Error("prompt could not be built");
	expect(first.request.prompt).toBe(second.request.prompt);
	expect(first.request.labels).toEqual(second.request.labels);
	for (const card of [...original.hands.flat(), ...original.stock])
		expect(first.request.prompt).not.toContain(card.id);
	for (const card of original.hands[0])
		expect(first.request.prompt).toContain(cardFace(card));
});

it("limits output to current legal actions and rejects untrusted indices", () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const history = recordModernTransfer(undefined, dealt.hand, drawn.hand);
	const result = modernLlmPrompt(observeModern(drawn.hand, 0, history), {
		rng: mulberry32(91),
		timeMs: 30000,
	});
	if (!result.ok) throw new Error(result.reason);
	const expected = modernSearchActions(drawn.hand)
		.map((action) => modernActionKey(drawn.hand, action))
		.sort();
	expect(result.request.labels.toSorted()).toEqual(expected.toSorted());
	expect(result.request.prompt).toContain('"history"');
	expect(result.request.prompt).toContain('"handCounts"');
	expect(result.request.prompt).toContain('"pile"');
	for (const [index] of result.request.labels.entries()) {
		const selected = result.request.select(index);
		if (!selected.ok) throw new Error(selected.reason);
		expect(modernApplyAction(drawn.hand, 0, selected.action).ok).toBe(true);
	}
	for (const value of [
		-1,
		0.5,
		NaN,
		Infinity,
		"0",
		{},
		null,
		result.request.labels.length,
	])
		expect(result.request.select(value).ok).toBe(false);
});

it("fails closed when cancelled or when the complete request exceeds its limits", () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const observation = observeModern(drawn.hand, 0);
	const cancelled = new AbortController();
	cancelled.abort();
	expect(
		modernLlmPrompt(observation, {
			rng: mulberry32(1),
			timeMs: 30000,
			signal: cancelled.signal,
		}).ok,
	).toBe(false);
	expect(
		modernLlmPrompt(observation, { rng: mulberry32(1), timeMs: 0 }).ok,
	).toBe(false);
	expect(
		modernLlmPrompt(observation, {
			rng: mulberry32(1),
			timeMs: 30000,
			maxChoices: 1,
		}).ok,
	).toBe(false);
	expect(
		modernLlmPrompt(observation, {
			rng: mulberry32(1),
			timeMs: 30000,
			maxPromptChars: 20,
		}).ok,
	).toBe(false);
});

it("exposes only the declared public history fields", () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const history = recordModernTransfer(undefined, dealt.hand, drawn.hand);
	const enriched = {
		...history,
		privateNote: "EXTRA_PRIVATE_NOTE",
		events: history.events.map((event) => ({
			...event,
			privateNote: "EXTRA_PRIVATE_EVENT",
		})),
	};
	const result = modernLlmPrompt(observeModern(drawn.hand, 0, enriched), {
		rng: mulberry32(1),
		timeMs: 30000,
	});
	if (!result.ok) throw new Error(result.reason);
	expect(result.request.prompt).not.toContain("EXTRA_PRIVATE_NOTE");
	expect(result.request.prompt).not.toContain("EXTRA_PRIVATE_EVENT");
});

it("stops selection after cancellation and bounds action enumeration", () => {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const observation = observeModern(drawn.hand, 0);
	const controller = new AbortController();
	const result = modernLlmPrompt(observation, {
		rng: mulberry32(1),
		timeMs: 30000,
		signal: controller.signal,
	});
	if (!result.ok) throw new Error(result.reason);
	expect(Object.isFrozen(result.request.labels)).toBe(true);
	controller.abort();
	expect(result.request.select(0).ok).toBe(false);
	expect(
		modernLlmPrompt(observation, {
			rng: mulberry32(1),
			timeMs: 30000,
			maxActionChecks: 1,
		}).ok,
	).toBe(false);
});

it("offers the observed legal undo and retract actions after a meld", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-8H", "0-8S", "0-2C", "0-5C"];
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
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const played = modernApplyAction({ ...base, turnStart: base, undo: [] }, 0, {
		type: "meld",
		cards: ["0-8C", "0-8D", "0-8H", "0-8S"],
	});
	if (!played.ok) throw new Error(played.reason);
	const observation = observeModern(played.hand, 0);
	expect(observation.canUndo).toBe(true);
	expect(observation.canRetract).toBe(true);
	const result = modernLlmPrompt(observation, {
		rng: mulberry32(1),
		timeMs: 30000,
	});
	if (!result.ok) throw new Error(result.reason);
	for (const label of ["undo", "retract"]) {
		const index = result.request.labels.indexOf(label);
		expect(index).toBeGreaterThanOrEqual(0);
		const selected = result.request.select(index);
		if (!selected.ok) throw new Error(selected.reason);
		expect(modernApplyAction(played.hand, 0, selected.action).ok).toBe(true);
	}
});
