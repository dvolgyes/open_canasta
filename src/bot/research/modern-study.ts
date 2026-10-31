import { MODERN_PRIOR_WEIGHTS, type ModernPriorWeights } from "../modern-prior";
import type { MatchPlan } from "./arena";
import { validSeed } from "./arena";
import { studySeed } from "./campaign";

export interface ModernStudyConfig {
	readonly version: 1;
	readonly seed: number;
	readonly split: number;
	readonly pairs: number;
	readonly maxHands: number;
	readonly maxActionsPerHand: number;
	readonly simulations: number;
	readonly timeMs: number;
	readonly depth: number;
	readonly a: ModernPriorWeights | null;
	readonly b: ModernPriorWeights | null;
}

export type ModernStudyConfigResult =
	| { readonly ok: true; readonly config: ModernStudyConfig }
	| { readonly ok: false; readonly reason: string };

function policy(value: unknown): ModernPriorWeights | null | undefined {
	if (value === null) return null;
	if (typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(
		MODERN_PRIOR_WEIGHTS,
	) as (keyof ModernPriorWeights)[];
	if (
		Object.keys(record).length !== keys.length ||
		keys.some(
			(key) =>
				typeof record[key] !== "number" ||
				!Number.isFinite(record[key]) ||
				Math.abs(record[key] as number) > 1e6,
		)
	)
		return undefined;
	return Object.fromEntries(
		keys.map((key) => [key, record[key]]),
	) as unknown as ModernPriorWeights;
}

/** Validate local-only study inputs before launching any game. */
export function parseModernStudyConfig(
	value: unknown,
): ModernStudyConfigResult {
	const fail = (): ModernStudyConfigResult => ({
		ok: false,
		reason: "invalid modern study configuration",
	});
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return fail();
	const v = value as Record<string, unknown>;
	const fields = [
		"version",
		"seed",
		"split",
		"pairs",
		"maxHands",
		"maxActionsPerHand",
		"simulations",
		"timeMs",
		"depth",
		"a",
		"b",
	];
	if (
		Object.keys(v).length !== fields.length ||
		Object.keys(v).some((key) => !fields.includes(key))
	)
		return fail();
	const integer = (n: unknown, min: number, max: number): n is number =>
		typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
	const a = policy(v.a);
	const b = policy(v.b);
	if (
		v.version !== 1 ||
		typeof v.seed !== "number" ||
		!validSeed(v.seed) ||
		!integer(v.split, 0, 31) ||
		!integer(v.pairs, 1, 10000) ||
		!integer(v.maxHands, 1, 10000) ||
		!integer(v.maxActionsPerHand, 1, 100000) ||
		!integer(v.simulations, 1, 1000000) ||
		!integer(v.timeMs, 1, 3600000) ||
		!integer(v.depth, 1, 10000) ||
		a === undefined ||
		b === undefined
	)
		return fail();
	return {
		ok: true,
		config: {
			version: 1,
			seed: v.seed,
			split: v.split,
			pairs: v.pairs,
			maxHands: v.maxHands,
			maxActionsPerHand: v.maxActionsPerHand,
			simulations: v.simulations,
			timeMs: v.timeMs,
			depth: v.depth,
			a,
			b,
		},
	};
}

export function modernStudyPlan(
	config: ModernStudyConfig,
	index: number,
	aTeam: 0 | 1,
): MatchPlan {
	if (
		!Number.isSafeInteger(index) ||
		index < 0 ||
		index >= config.pairs ||
		(aTeam !== 0 && aTeam !== 1)
	)
		throw new Error("invalid modern study pair index");
	return {
		seed: studySeed(config.seed, config.split, index),
		policySeed: studySeed(config.seed, config.split + 32, index),
		dealer: (index % 4) as 0 | 1 | 2 | 3,
		aTeam,
		maxHands: config.maxHands,
		maxActionsPerHand: config.maxActionsPerHand,
	};
}
