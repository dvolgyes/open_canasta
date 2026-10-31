import type { ModernMatchResult } from "../src/bot/research/modern-arena";
import { summarizeModernPairs } from "../src/bot/research/modern-evidence";

/** Maximum difference between this dealer schedule's mean and a uniform-dealer mean. */
export function dealerImbalance(dealers: readonly number[]): number {
	if (
		dealers.length === 0 ||
		dealers.some(
			(dealer) => !Number.isInteger(dealer) || dealer < 0 || dealer > 3,
		)
	)
		throw new Error("invalid dealer schedule");
	return (
		[0, 1, 2, 3].reduce(
			(total, dealer) =>
				total +
				Math.abs(
					dealers.filter((item) => item === dealer).length / dealers.length -
						0.25,
				),
			0,
		) / 2
	);
}

/** One-sided lower confidence bound for independent scores in [0, 1]. */
export function pairedKlLowerBound(
	pairedScores: readonly number[],
	alpha: number,
): number {
	if (
		pairedScores.length === 0 ||
		pairedScores.some(
			(score) => !Number.isFinite(score) || score < 0 || score > 1,
		) ||
		!Number.isFinite(alpha) ||
		alpha <= 0 ||
		alpha >= 1
	)
		throw new Error("invalid paired scores or error probability");
	const mean =
		pairedScores.reduce((sum, score) => sum + score, 0) / pairedScores.length;
	if (mean === 0) return 0;
	if (mean === 1) return Math.exp(Math.log(alpha) / pairedScores.length);
	const threshold = -Math.log(alpha) / pairedScores.length;
	let lower = 0;
	let upper = mean;
	for (let i = 0; i < 80; i++) {
		const candidate = (lower + upper) / 2;
		if (candidate === lower || candidate === upper) break;
		const divergence =
			mean * Math.log(mean / candidate) +
			(1 - mean) * (Math.log1p(-mean) - Math.log1p(-candidate));
		if (divergence > threshold) lower = candidate;
		else upper = candidate;
	}
	return lower;
}

/** Incomplete, hypothetical, or budget-limited pairs cannot yield a match bound. */
export function modernPairedKlLowerBound(
	pairs: readonly (readonly [ModernMatchResult, ModernMatchResult])[],
	plannedPairs: number,
	simulations: number,
	alpha: number,
): number | null {
	if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1)
		throw new Error("invalid paired error probability");
	const summary = summarizeModernPairs(pairs, plannedPairs, simulations);
	if (!summary.eligible) return null;
	return pairedKlLowerBound(
		pairs.map(
			([first, second]) =>
				(Number(first.aWin === 1) + Number(second.aWin === 1)) / 2,
		),
		alpha,
	);
}
