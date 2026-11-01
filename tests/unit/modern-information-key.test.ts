import { expect, it } from "vitest";
import { modernInformationKey } from "../../src/bot/modern-information-key";
import type { Card } from "../../src/canasta/cards";
import { modernNewHand } from "../../src/canasta/modern-hand";

it("uses the acting player's visible cards and ignores other hidden cards", () => {
	const dealt = modernNewHand({ seed: 3, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const hand = dealt.hand;
	const opponentCard = hand.hands[1][0];
	const stockCard = hand.stock[0];
	if (!opponentCard || !stockCard) throw new Error("fixture cards missing");
	const hiddenSwap = {
		...hand,
		hands: [
			hand.hands[0],
			[stockCard, ...hand.hands[1].slice(1)],
			hand.hands[2],
			hand.hands[3],
		] as const,
		stock: [opponentCard, ...hand.stock.slice(1)],
	};
	expect(modernInformationKey(hiddenSwap)).toBe(modernInformationKey(hand));
	const ownSwap = {
		...hand,
		hands: [
			[stockCard, ...hand.hands[0].slice(1)],
			hand.hands[1],
			hand.hands[2],
			hand.hands[3],
		] as const,
	};
	expect(modernInformationKey(ownSwap)).not.toBe(modernInformationKey(hand));
	expect(modernInformationKey({ ...hand, turn: 1 })).not.toBe(
		modernInformationKey(hand),
	);
});

it("ignores card order and physical copies but preserves face multiplicity", () => {
	const dealt = modernNewHand({ seed: 3, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const hand = dealt.hand;
	const first = { id: "0-8C", rank: "8" as const, suit: "C" as const };
	const second = { ...first, id: "1-8C" };
	const other = { id: "0-9C", rank: "9" as const, suit: "C" as const };
	const withCards = (cards: readonly Card[]) => ({
		...hand,
		hands: [cards, hand.hands[1], hand.hands[2], hand.hands[3]] as const,
	});
	expect(modernInformationKey(withCards([first, other]))).toBe(
		modernInformationKey(withCards([other, second])),
	);
	expect(modernInformationKey(withCards([first, second]))).not.toBe(
		modernInformationKey(withCards([first, other])),
	);
});

it("distinguishes observable changes to the discard pile", () => {
	const dealt = modernNewHand({ seed: 3, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const card = dealt.hand.stock[0];
	if (!card) throw new Error("fixture card missing");
	expect(modernInformationKey({ ...dealt.hand, pile: [card] })).not.toBe(
		modernInformationKey(dealt.hand),
	);
});
