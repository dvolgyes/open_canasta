import { describe, expect, it } from "vitest";
import {
	type Action,
	applyAction,
	buildDecks,
	type CanastaRules,
	type Card,
	CLASSIC_RULES,
	DRAW_TWO_RULES,
	FROZEN_PILE_RULES,
	type HandState,
	legalActions,
	type Meld,
	newHand,
	scoreHand,
	TWO_CANASTAS_RULES,
	VIENNESE_RULES,
	validateMeld,
	viewFor,
} from "../../src/canasta";

const byId = (id: string): Card => {
	const card = buildDecks().find((candidate) => candidate.id === id);
	if (card === undefined) throw new Error(`no card ${id}`);
	return card;
};
const cardsById = (ids: readonly string[]): Card[] => ids.map(byId);

/** Seat 1 (side 1) is on turn with exact cards; side 1 holds the given melds and made its initial meld with them. */
function seatOne(
	rules: CanastaRules,
	patch: {
		readonly phase: HandState["phase"];
		readonly own: readonly string[];
		readonly pile?: readonly string[];
		readonly stock?: readonly string[];
		readonly melds?: readonly Meld[];
		readonly redThrees?: readonly string[];
	},
): HandState {
	const base = newHand({ rules, teamScores: [0, 0], dealer: 0, seed: 1 });
	const melds = patch.melds ?? [];
	const next: HandState = {
		...base,
		turn: 1,
		phase: patch.phase,
		hands: [[], cardsById(patch.own), [], []],
		pile: cardsById(patch.pile ?? ["0-4S"]),
		stock: patch.stock === undefined ? base.stock : cardsById(patch.stock),
		teams: [
			{ melds: [], redThrees: [], initialMade: false },
			{
				melds,
				redThrees: cardsById(patch.redThrees ?? []),
				initialMade: melds.length > 0,
			},
		],
		nextMeldNo: melds.length + 1,
		// The partner, seat 3, laid the side's melds in earlier turns.
		meldedSeats: melds.length > 0 ? [3] : [],
	};
	return { ...next, turnStart: next };
}

/** Applies the actions in order and returns the last step; an earlier refusal throws. */
function play(hand: HandState, actions: readonly Action[]) {
	let current = hand;
	let step: ReturnType<typeof applyAction> = { ok: true, hand };
	for (const action of actions) {
		step = applyAction(current, current.turn, action);
		if (!step.ok && action !== actions.at(-1)) throw new Error(step.reason);
		if (step.ok) current = step.hand;
	}
	return step;
}

const handOf = (step: ReturnType<typeof applyAction>): HandState => {
	if (!step.ok) throw new Error(step.reason);
	return step.hand;
};

const meld = (id: string, ids: readonly string[]): Meld => {
	const cards = cardsById(ids);
	return { id, rank: cards[0]?.rank ?? "4", team: 1, cards };
};
const sevens = meld("m1", ["0-7C", "1-7C", "0-7S"]);
const kingCanasta = meld("m1", [
	"0-KH",
	"0-KD",
	"0-KS",
	"0-KC",
	"1-KH",
	"1-KD",
	"1-KS",
]);
const queenCanasta = meld("m2", [
	"0-QH",
	"0-QD",
	"0-QS",
	"0-QC",
	"1-QH",
	"1-QD",
	"1-QS",
]);

describe("frozen pile variant", () => {
	const atDraw = (rules: CanastaRules) =>
		seatOne(rules, {
			phase: "draw",
			own: ["0-7H", "1-7H", "0-2S", "0-9C", "0-9D"],
			pile: ["0-4S", "0-7D"],
			melds: [sevens],
		});
	const naturalAndWild: Action = {
		type: "takePile",
		cards: ["0-7H", "0-2S"],
		extend: "m1",
	};
	const topAlone: Action = { type: "takePile", cards: [], extend: "m1" };
	const pair: Action = {
		type: "takePile",
		cards: ["0-7H", "1-7H"],
		extend: "m1",
	};
	const frozen = {
		ok: false,
		reason: "a frozen pile needs two natural cards from your hand",
	};

	it("takes the pile only with a natural pair, also after the side's initial meld", () => {
		expect(applyAction(atDraw(FROZEN_PILE_RULES), 1, naturalAndWild)).toEqual(
			frozen,
		);
		expect(applyAction(atDraw(FROZEN_PILE_RULES), 1, topAlone)).toEqual(frozen);
		expect(applyAction(atDraw(FROZEN_PILE_RULES), 1, pair).ok).toBe(true);
		expect(viewFor(atDraw(FROZEN_PILE_RULES), 1).pileFrozen).toBe(true);
	});

	it("keeps the pickups of an unfrozen pile in the classic rules", () => {
		expect(applyAction(atDraw(CLASSIC_RULES), 1, naturalAndWild).ok).toBe(true);
		expect(applyAction(atDraw(CLASSIC_RULES), 1, topAlone).ok).toBe(true);
		expect(viewFor(atDraw(CLASSIC_RULES), 1).pileFrozen).toBe(false);
	});
});

describe("draw two variant", () => {
	const drawn = (rules: CanastaRules) =>
		handOf(
			applyAction(
				seatOne(rules, {
					phase: "draw",
					own: ["0-9C"],
					stock: ["0-8C", "0-8D", "0-8S"],
				}),
				1,
				{ type: "draw" },
			),
		);

	it("draws two cards from the stock", () => {
		expect(drawn(DRAW_TWO_RULES).turnTaken).toEqual(["0-8C", "0-8D"]);
		expect(drawn(DRAW_TWO_RULES).hands[1]).toHaveLength(3);
		expect(drawn(CLASSIC_RULES).turnTaken).toEqual(["0-8C"]);
	});
});

describe("two canastas variant", () => {
	const fives = ["0-5H", "0-5D", "0-5S"];
	const goOut = (rules: CanastaRules, melds: readonly Meld[]) =>
		play(seatOne(rules, { phase: "play", own: fives, melds }), [
			{ type: "meld", cards: fives },
		]);

	it("needs two canastas to go out", () => {
		expect(goOut(TWO_CANASTAS_RULES, [kingCanasta])).toEqual({
			ok: false,
			reason: "the side needs 2 canastas to go out",
		});
		expect(goOut(CLASSIC_RULES, [kingCanasta]).ok).toBe(true);
		expect(
			handOf(goOut(TWO_CANASTAS_RULES, [kingCanasta, queenCanasta])).outcome
				?.kind,
		).toBe("out");
	});

	it("does not let a move leave one card before the side has two canastas", () => {
		const hand = seatOne(TWO_CANASTAS_RULES, {
			phase: "play",
			own: [...fives, "0-9C"],
			melds: [kingCanasta],
		});
		expect(applyAction(hand, 1, { type: "meld", cards: fives })).toEqual({
			ok: false,
			reason: "the move would leave one card, which needs 2 canastas to go out",
		});
	});
});

describe("Viennese variant", () => {
	it("refuses a meld with more wild cards than natural cards", () => {
		const five = cardsById(["0-QH", "0-QD", "0-2S", "1-2S", "0-2C"]);
		expect(validateMeld(five, VIENNESE_RULES)).toEqual({
			ok: false,
			reason: "a meld may not hold more wild cards than natural cards",
		});
		expect(validateMeld(five, CLASSIC_RULES).ok).toBe(true);
		expect(validateMeld(five.slice(0, 4), VIENNESE_RULES).ok).toBe(true);
	});

	it("blocks the pile for a side when the top card fits a canasta of that side", () => {
		const mixedSevens = meld("m1", [
			"0-7C",
			"1-7C",
			"0-7S",
			"1-7S",
			"0-2C",
			"0-2D",
			"0-JK0",
		]);
		const atDraw = (rules: CanastaRules) =>
			seatOne(rules, {
				phase: "draw",
				own: ["0-7H", "1-7H", "0-9C", "0-9D"],
				pile: ["0-4S", "0-7D"],
				melds: [mixedSevens],
			});
		const pair: Action = {
			type: "takePile",
			cards: ["0-7H", "1-7H"],
			extend: "m1",
		};
		expect(applyAction(atDraw(VIENNESE_RULES), 1, pair)).toEqual({
			ok: false,
			reason: "the top card fits a canasta of your side, so it blocks the pile",
		});
		expect(
			legalActions(atDraw(VIENNESE_RULES), 1).map((action) => action.type),
		).toEqual(["draw"]);
		expect(viewFor(atDraw(VIENNESE_RULES), 1).pileBlocked).toBe(true);
		expect(applyAction(atDraw(CLASSIC_RULES), 1, pair).ok).toBe(true);
		expect(viewFor(atDraw(CLASSIC_RULES), 1).pileBlocked).toBe(false);
	});

	it("counts red threes positive only for a side with a canasta", () => {
		const redThrees = (rules: CanastaRules, melds: readonly Meld[]) =>
			scoreHand(
				seatOne(rules, { phase: "play", own: [], melds, redThrees: ["0-3H"] }),
			)[1].redThrees;
		expect(redThrees(VIENNESE_RULES, [sevens])).toBe(-100);
		expect(redThrees(CLASSIC_RULES, [sevens])).toBe(100);
		expect(redThrees(VIENNESE_RULES, [kingCanasta])).toBe(100);
	});

	describe("going out concealed", () => {
		const fives = ["0-5H", "0-5D", "0-5S", "0-5C", "1-5H", "1-5D", "1-5S"];
		const partnerKings = meld("m1", ["0-KH", "0-KD", "0-KS"]);
		const outBonus = (hand: HandState) => scoreHand(hand)[1].outBonus;

		it("gives 1000 to a player who lays a canasta of their own (Hand-Canasta)", () => {
			const layCanasta = (rules: CanastaRules) =>
				handOf(
					play(
						seatOne(rules, {
							phase: "play",
							own: [...fives, "0-9C"],
							melds: [partnerKings],
						}),
						[
							{ type: "meld", cards: fives.slice(0, 3) },
							{ type: "extend", meldId: "m2", cards: fives.slice(3) },
							{ type: "discard", card: "0-9C" },
						],
					),
				);
			expect(outBonus(layCanasta(VIENNESE_RULES))).toBe(1000);
			expect(outBonus(layCanasta(CLASSIC_RULES))).toBe(200);
		});

		it("gives 200 to a player who goes out concealed on the partner's canasta (Verdeckt Ausmachen)", () => {
			const onPartnerCanasta = (rules: CanastaRules) =>
				handOf(
					play(
						seatOne(rules, {
							phase: "play",
							own: ["0-5H", "0-5D", "0-5S", "0-9C"],
							melds: [kingCanasta],
						}),
						[
							{ type: "meld", cards: ["0-5H", "0-5D", "0-5S"] },
							{ type: "discard", card: "0-9C" },
						],
					),
				);
			const viennese = onPartnerCanasta(VIENNESE_RULES);
			expect(viennese.outcome).toEqual({
				kind: "out",
				seat: 1,
				concealed: false,
				concealedWithoutCanasta: true,
			});
			expect(outBonus(viennese)).toBe(200);
			const classic = onPartnerCanasta(CLASSIC_RULES);
			expect(classic.outcome).toEqual({
				kind: "out",
				seat: 1,
				concealed: false,
			});
			expect(outBonus(classic)).toBe(100);
		});

		it("gives no concealed bonus to a player who took the pile in that turn", () => {
			// The pickup puts the 4 under the top five into the hand, and the player discards it.
			const afterPickup = (rules: CanastaRules) =>
				handOf(
					play(
						seatOne(rules, {
							phase: "draw",
							own: ["0-5H", "0-5D", "0-5C", "1-5H", "1-5D", "1-5S"],
							pile: ["0-4S", "0-5S"],
							melds: [partnerKings],
						}),
						[
							{ type: "takePile", cards: ["0-5H", "0-5D"] },
							{
								type: "extend",
								meldId: "m2",
								cards: ["0-5C", "1-5H", "1-5D", "1-5S"],
							},
							{ type: "discard", card: "0-4S" },
						],
					),
				);
			expect(afterPickup(VIENNESE_RULES).outcome).toEqual({
				kind: "out",
				seat: 1,
				concealed: false,
			});
			expect(outBonus(afterPickup(VIENNESE_RULES))).toBe(100);
			expect(afterPickup(CLASSIC_RULES).outcome).toEqual({
				kind: "out",
				seat: 1,
				concealed: true,
			});
		});
	});
});
