import { expect, it } from "vitest";
import { modernNewHand } from "../../src/canasta/modern-hand";
import { modernViewFor } from "../../src/canasta/modern-view";

it("shows only public information and the observer's hand", () => {
	const result = modernNewHand({ seed: 3, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const bonus = result.hand.stock[0];
	const stockCard = result.hand.stock[1];
	const opponentCard = result.hand.hands[1][0];
	if (!bonus || !stockCard || !opponentCard)
		throw new Error("fixture cards missing");
	const first = {
		...result.hand,
		stock: result.hand.stock.slice(1),
		bonuses: [[], [bonus], [], []] as const,
	};
	const second = {
		...first,
		hands: [
			first.hands[0],
			[stockCard, ...first.hands[1].slice(1)],
			first.hands[2],
			first.hands[3],
		] as const,
		stock: [bonus, ...first.stock.slice(1)],
		bonuses: [[], [opponentCard], [], []] as const,
	};
	const view = modernViewFor(first, 0);
	expect(view).toEqual(modernViewFor(second, 0));
	expect(view.hand).toEqual(first.hands[0]);
	expect(view.handCounts).toEqual([13, 13, 13, 13]);
	expect(view.bonusCounts).toEqual([0, 1, 0, 0]);
	expect(view.stockCount).toBe(first.stock.length);
	expect(JSON.stringify(view)).not.toContain(bonus.id);
});

it("does not identify which physical copy appears in the public pile", () => {
	const result = modernNewHand({ seed: 3, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const one = { id: "0-8C", rank: "8" as const, suit: "C" as const };
	const two = { id: "1-8C", rank: "8" as const, suit: "C" as const };
	const first = { ...result.hand, pile: [one] };
	const second = { ...result.hand, pile: [two] };
	expect(modernViewFor(first, 0)).toEqual(modernViewFor(second, 0));
});

it("reveals a declared special hand at the end of the hand", () => {
	const result = modernNewHand({ seed: 3, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	const ended = {
		...result.hand,
		outcome: { kind: "special" as const, seat: 1 as const, score: 2500 },
	};
	expect(modernViewFor(ended, 0).specialCards).toEqual(
		ended.hands[1].map(({ rank, suit }) => ({ rank, suit })),
	);
	expect(modernViewFor(result.hand, 0).specialCards).toEqual([]);
});
