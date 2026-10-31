import type { Seat } from "./hand";
import {
	MODERN_RULES_VERSION,
	type ModernHandState,
	modernNewHand,
} from "./modern-hand";
import { modernScoreHand } from "./modern-special-scoring";

export interface ModernMatchState {
	readonly seed: number;
	readonly handNo: number;
	readonly dealer: Seat;
	readonly scores: readonly [number, number];
	readonly hand: ModernHandState;
	readonly settled: boolean;
	readonly winner: 0 | 1 | null;
}

export type ModernMatchStep =
	| { readonly ok: true; readonly match: ModernMatchState }
	| { readonly ok: false; readonly reason: string };

function dealSeed(seed: number, handNo: number): number {
	return (seed ^ Math.imul(handNo, 0x9e3779b1)) >>> 0;
}

export function modernStartMatch(seed: number, dealer: Seat): ModernMatchStep {
	if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
		return { ok: false, reason: "invalid match seed" };
	const scores: readonly [number, number] = [0, 0];
	const hand = modernNewHand({
		seed: dealSeed(seed, 1),
		dealer,
		teamScores: scores,
	});
	if (!hand.ok) return hand;
	return {
		ok: true,
		match: {
			seed,
			handNo: 1,
			dealer,
			scores,
			hand: hand.hand,
			settled: false,
			winner: null,
		},
	};
}

export function modernSettleHand(match: ModernMatchState): ModernMatchStep {
	if (match.hand.rulesVersion !== MODERN_RULES_VERSION)
		return { ok: false, reason: "unsupported modern rules version" };
	if (match.hand.outcome === null)
		return { ok: false, reason: "the hand is not over" };
	if (match.settled)
		return { ok: false, reason: "the hand is already settled" };
	const result = modernScoreHand(match.hand);
	if (!result) return { ok: false, reason: "the hand cannot be scored" };
	const scores: readonly [number, number] = [
		match.scores[0] + result[0].total,
		match.scores[1] + result[1].total,
	];
	const winner =
		Math.max(...scores) < 8500 || scores[0] === scores[1]
			? null
			: scores[0] > scores[1]
				? 0
				: 1;
	return { ok: true, match: { ...match, scores, settled: true, winner } };
}

export function modernNextHand(match: ModernMatchState): ModernMatchStep {
	if (!match.settled)
		return { ok: false, reason: "settle the finished hand first" };
	if (match.winner !== null) return { ok: false, reason: "the match is over" };
	const handNo = match.handNo + 1;
	const dealer = ((match.dealer + 1) % 4) as Seat;
	const hand = modernNewHand({
		seed: dealSeed(match.seed, handNo),
		dealer,
		teamScores: match.scores,
	});
	if (!hand.ok) return hand;
	return {
		ok: true,
		match: { ...match, handNo, dealer, hand: hand.hand, settled: false },
	};
}
