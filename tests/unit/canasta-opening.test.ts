import { expect, it } from "vitest";
import {
	canCompleteOpening,
	openingPointUpperBound,
} from "../../src/bot/canasta-opening";
import { searchActions } from "../../src/bot/canasta-search";
import {
	applyAction,
	buildDecks,
	type HandState,
	isRed3,
	mulberry32,
	newHand,
} from "../../src/canasta";
import shared from "../fixtures/shared-wild-opening.json";
import stranded from "../fixtures/stranded-opening.json";

it("excludes black-three points when the rest cannot be cleared for going out", () => {
	for (const fixture of [stranded, shared]) {
		const hand = fixture as unknown as HandState;
		expect(openingPointUpperBound(hand, hand.turn)).toBe(85);
	}
});

it("matches exhaustive legal continuations across small paired inventories", () => {
	const deck = buildDecks();
	const kings = deck.filter((c) => c.rank === "K").slice(0, 3);
	const available = deck.filter(
		(c) =>
			!kings.includes(c) &&
			!isRed3(c) &&
			["K", "Q", "3", "2", "JK", "A"].includes(c.rank),
	);
	for (let seed = 1; seed <= 64; seed++) {
		const rng = mulberry32(seed),
			pool = [...available];
		const selected = Array.from({ length: 6 }, () => {
			const card = pool.splice(Math.floor(rng() * pool.length), 1)[0];
			if (!card) throw new Error("missing card");
			return card;
		});
		const own = [...kings.slice(0, 2), ...selected.slice(0, 3)];
		const top = kings[2];
		if (!top) throw new Error("missing pile top");
		const pile = [...selected.slice(3), top];
		const used = new Set([...own, ...pile].map((c) => c.id));
		const base = newHand({ seed, dealer: 3, teamScores: [1500, 0] });
		const snapshot = {
			...base,
			hands: [own, [], [], []],
			pile,
			stock: deck.filter((c) => !used.has(c.id)),
		};
		const step = applyAction({ ...snapshot, turnStart: snapshot }, 0, {
			type: "takePile",
			cards: kings.slice(0, 2).map((c) => c.id),
		});
		if (!step.ok) throw new Error(step.reason);
		const visit = (hand: HandState): { maximum: number; finishes: boolean } => {
			let maximum = hand.turnMeldPoints;
			let finishes =
				Boolean(hand.outcome) ||
				hand.turn !== 0 ||
				(hand.hands[0] ?? []).some(
					(card) => applyAction(hand, 0, { type: "discard", card: card.id }).ok,
				);
			if (!hand.outcome)
				for (const action of searchActions(hand)) {
					if (action.type !== "meld" && action.type !== "extend") continue;
					const next = applyAction(hand, 0, action);
					if (next.ok) {
						const result = visit(next.hand);
						maximum = Math.max(maximum, result.maximum);
						finishes ||= result.finishes;
					}
				}
			expect(
				openingPointUpperBound(hand, 0),
				`seed ${seed}`,
			).toBeGreaterThanOrEqual(maximum);
			if (!hand.outcome && hand.turn === 0)
				expect(
					canCompleteOpening(hand, 0, () => false),
					`seed ${seed}`,
				).toBe(finishes);
			return { maximum, finishes };
		};
		visit(step.hand);
	}
}, 20000);

it("does not accept an interrupted opening proof", () => {
	const hand = shared as unknown as HandState;
	expect(canCompleteOpening(hand, hand.turn, () => true)).toBe(false);
});
