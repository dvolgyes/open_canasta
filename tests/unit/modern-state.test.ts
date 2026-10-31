import { expect, it } from "vitest";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import {
	modernSettleHand,
	modernStartMatch,
} from "../../src/canasta/modern-match";
import { parseModernMatch } from "../../src/game/modern-state";

function match() {
	const result = modernStartMatch(42, 0);
	if (!result.ok) throw new Error(result.reason);
	return result.match;
}

it("accepts a serialized modern deal and a drawn position", () => {
	const start = match();
	expect(parseModernMatch(JSON.parse(JSON.stringify(start)))).toEqual(start);
	const step = modernApplyAction(start.hand, start.hand.turn, { type: "draw" });
	if (!step.ok) throw new Error(step.reason);
	expect(parseModernMatch({ ...start, hand: step.hand })).toEqual({
		...start,
		hand: step.hand,
	});
});

it("rejects duplicate physical cards in current, turn-start, and undo snapshots", () => {
	const start = match();
	const duplicate = start.hand.hands[0][0];
	if (!duplicate || !start.hand.stock.length)
		throw new Error("invalid fixture");
	const stock = [duplicate, ...start.hand.stock.slice(1)];
	expect(
		parseModernMatch({ ...start, hand: { ...start.hand, stock } }),
	).toBeUndefined();
	expect(
		parseModernMatch({
			...start,
			hand: { ...start.hand, turnStart: { ...start.hand.turnStart, stock } },
		}),
	).toBeUndefined();
	expect(
		parseModernMatch({
			...start,
			hand: { ...start.hand, undo: [{ ...start.hand.turnStart, stock }] },
		}),
	).toBeUndefined();
});

it("rejects malformed modern match metadata and inconsistent outcomes", () => {
	const start = match();
	for (const invalid of [
		{ ...start, handNo: 0 },
		{ ...start, dealer: 4 },
		{ ...start, winner: 1 },
		{ ...start, settled: true },
		{ ...start, hand: { ...start.hand, rulesVersion: "other" } },
		{ ...start, hand: { ...start.hand, phase: "unknown" } },
		{ ...start, hand: { ...start.hand, nextMeldNo: 0 } },
		{
			...start,
			hand: { ...start.hand, turnStart: { ...start.hand.turnStart, turn: 3 } },
		},
		{
			...start,
			hand: {
				...start.hand,
				undo: [{ ...start.hand.turnStart, teamScores: [1, 0] }],
			},
		},
	])
		expect(parseModernMatch(invalid)).toBeUndefined();
});

it("accepts real meld and undo snapshots", () => {
	let tested = 0;
	for (let seed = 0; seed < 100 && tested < 4; seed++) {
		const started = modernStartMatch(seed, 0);
		if (!started.ok) throw new Error(started.reason);
		const drawn = modernApplyAction(
			started.match.hand,
			started.match.hand.turn,
			{ type: "draw" },
		);
		if (!drawn.ok || drawn.hand.outcome) continue;
		const hand = drawn.hand;
		const natural = hand.hands[hand.turn].filter(
			(card) => card.rank !== "2" && card.rank !== "JK" && card.rank !== "3",
		);
		const group = natural.find(
			(card) => natural.filter((other) => other.rank === card.rank).length >= 3,
		);
		if (!group) continue;
		const ids = natural
			.filter((card) => card.rank === group.rank)
			.slice(0, 3)
			.map((card) => card.id);
		const melded = modernApplyAction(hand, hand.turn, {
			type: "meld",
			cards: ids,
		});
		if (!melded.ok) continue;
		expect(
			parseModernMatch({ ...started.match, hand: melded.hand }),
		).toBeDefined();
		const undone = modernApplyAction(melded.hand, hand.turn, { type: "undo" });
		if (!undone.ok) throw new Error(undone.reason);
		expect(
			parseModernMatch({ ...started.match, hand: undone.hand }),
		).toBeDefined();
		tested++;
	}
	expect(tested).toBe(4);
});

it("accepts generated turns through stock exhaustion and settlement", () => {
	for (const seed of [1, 2, 3, 4, 5, 6]) {
		const started = modernStartMatch(seed, 0);
		if (!started.ok) throw new Error(started.reason);
		let current = started.match;
		for (
			let action = 0;
			action < 200 && current.hand.outcome === null;
			action++
		) {
			expect(
				parseModernMatch(current),
				`seed ${seed}, action ${action}`,
			).toBeDefined();
			const hand = current.hand;
			const step =
				hand.phase === "draw"
					? modernApplyAction(hand, hand.turn, { type: "draw" })
					: hand.hands[hand.turn]
							.map((card) =>
								modernApplyAction(hand, hand.turn, {
									type: "discard",
									card: card.id,
								}),
							)
							.find((candidate) => candidate.ok);
			if (!step?.ok) throw new Error("no legal stock or discard action");
			current = { ...current, hand: step.hand };
		}
		expect(current.hand.outcome, `seed ${seed}`).not.toBeNull();
		const settled = modernSettleHand(current);
		if (!settled.ok) throw new Error(settled.reason);
		expect(
			parseModernMatch(settled.match),
			`settled seed ${seed}`,
		).toBeDefined();
	}
});
