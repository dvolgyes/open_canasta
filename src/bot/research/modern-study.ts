import { MODERN_PRIOR_WEIGHTS, type ModernPriorWeights } from "../modern-prior";
import { validSeed } from "./arena";
import { studySeed } from "./campaign";
import type { ModernAgentConfig, ModernMatchPlan } from "./modern-arena";
import type { ModernSimulationBudgets } from "./modern-evidence";

export interface ModernStudyConfig {
	readonly version: 1;
	readonly seed: number;
	readonly split: number;
	readonly pairs: number;
	readonly maxHands: number;
	readonly maxActionsPerHand: number;
	readonly simulations: number;
	/** Overrides the shared simulation budget for either policy. */
	readonly aSimulations?: number;
	readonly bSimulations?: number;
	readonly timeMs: number;
	readonly depth: number;
	/** Overrides the shared search depth for either policy. */
	readonly aDepth?: number;
	readonly bDepth?: number;
	readonly a: ModernPriorWeights | null;
	readonly b: ModernPriorWeights | null;
	/** Progressive-bias strength; unvisited actions retain prior-based ordering. */
	readonly aPriorWeight?: number;
	readonly bPriorWeight?: number;
	readonly aSevenBlockedV1Weight?: number;
	readonly bSevenBlockedV1Weight?: number;
	readonly aKnownPairV1Weight?: number;
	readonly bKnownPairV1Weight?: number;
	readonly aDiscardRiskV1Weight?: number;
	readonly bDiscardRiskV1Weight?: number;
	readonly aPairThreatV1Weight?: number;
	readonly bPairThreatV1Weight?: number;
	readonly aPairPileV1Weight?: number;
	readonly bPairPileV1Weight?: number;
	/** A symmetric hypothetical starting score for single-hand trials only. */
	readonly initialTeamScore?: number;
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
	const optionalFields = [
		"aSimulations",
		"bSimulations",
		"aDepth",
		"bDepth",
		"aPriorWeight",
		"bPriorWeight",
		"aSevenBlockedV1Weight",
		"bSevenBlockedV1Weight",
		"aKnownPairV1Weight",
		"bKnownPairV1Weight",
		"aDiscardRiskV1Weight",
		"bDiscardRiskV1Weight",
		"aPairThreatV1Weight",
		"bPairThreatV1Weight",
		"aPairPileV1Weight",
		"bPairPileV1Weight",
		"initialTeamScore",
	];
	if (
		fields.some((key) => !Object.hasOwn(v, key)) ||
		Object.keys(v).some(
			(key) => !fields.includes(key) && !optionalFields.includes(key),
		)
	)
		return fail();
	const validPriorWeight = (key: string) =>
		!Object.hasOwn(v, key) ||
		(typeof v[key] === "number" &&
			Number.isFinite(v[key]) &&
			(v[key] as number) >= 0 &&
			(v[key] as number) <= 1e6);
	const integer = (n: unknown, min: number, max: number): n is number =>
		typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
	const a = policy(v.a);
	const b = policy(v.b);
	const validExperimentalWeight = (
		key: string,
		weights: ModernPriorWeights | null | undefined,
	) =>
		!Object.hasOwn(v, key) ||
		(typeof v[key] === "number" &&
			Number.isFinite(v[key]) &&
			Math.abs(v[key] as number) <= 1e6 &&
			(weights !== null || v[key] === 0));
	if (
		v.version !== 1 ||
		typeof v.seed !== "number" ||
		!validSeed(v.seed) ||
		!integer(v.split, 0, 31) ||
		!integer(v.pairs, 1, 10000) ||
		!integer(v.maxHands, 1, 10000) ||
		!integer(v.maxActionsPerHand, 1, 100000) ||
		!integer(v.simulations, 1, 1000000) ||
		(Object.hasOwn(v, "aSimulations") &&
			!integer(v.aSimulations, 1, 1000000)) ||
		(Object.hasOwn(v, "bSimulations") &&
			!integer(v.bSimulations, 1, 1000000)) ||
		!integer(v.timeMs, 1, 3600000) ||
		!integer(v.depth, 1, 10000) ||
		(Object.hasOwn(v, "aDepth") && !integer(v.aDepth, 1, 10000)) ||
		(Object.hasOwn(v, "bDepth") && !integer(v.bDepth, 1, 10000)) ||
		!validPriorWeight("aPriorWeight") ||
		!validPriorWeight("bPriorWeight") ||
		!validExperimentalWeight("aSevenBlockedV1Weight", a) ||
		!validExperimentalWeight("bSevenBlockedV1Weight", b) ||
		!validExperimentalWeight("aKnownPairV1Weight", a) ||
		!validExperimentalWeight("bKnownPairV1Weight", b) ||
		!validExperimentalWeight("aDiscardRiskV1Weight", a) ||
		!validExperimentalWeight("bDiscardRiskV1Weight", b) ||
		!validExperimentalWeight("aPairThreatV1Weight", a) ||
		!validExperimentalWeight("bPairThreatV1Weight", b) ||
		!validExperimentalWeight("aPairPileV1Weight", a) ||
		!validExperimentalWeight("bPairPileV1Weight", b) ||
		(Object.hasOwn(v, "initialTeamScore") &&
			(!integer(v.initialTeamScore, 0, 8499) || v.maxHands !== 1)) ||
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
			...(Object.hasOwn(v, "aSimulations")
				? { aSimulations: v.aSimulations as number }
				: {}),
			...(Object.hasOwn(v, "bSimulations")
				? { bSimulations: v.bSimulations as number }
				: {}),
			timeMs: v.timeMs,
			depth: v.depth,
			...(Object.hasOwn(v, "aDepth") ? { aDepth: v.aDepth as number } : {}),
			...(Object.hasOwn(v, "bDepth") ? { bDepth: v.bDepth as number } : {}),
			a,
			b,
			...(Object.hasOwn(v, "aPriorWeight")
				? { aPriorWeight: v.aPriorWeight as number }
				: {}),
			...(Object.hasOwn(v, "bPriorWeight")
				? { bPriorWeight: v.bPriorWeight as number }
				: {}),
			...(Object.hasOwn(v, "aSevenBlockedV1Weight")
				? { aSevenBlockedV1Weight: v.aSevenBlockedV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "bSevenBlockedV1Weight")
				? { bSevenBlockedV1Weight: v.bSevenBlockedV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "aKnownPairV1Weight")
				? { aKnownPairV1Weight: v.aKnownPairV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "bKnownPairV1Weight")
				? { bKnownPairV1Weight: v.bKnownPairV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "aDiscardRiskV1Weight")
				? { aDiscardRiskV1Weight: v.aDiscardRiskV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "bDiscardRiskV1Weight")
				? { bDiscardRiskV1Weight: v.bDiscardRiskV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "aPairThreatV1Weight")
				? { aPairThreatV1Weight: v.aPairThreatV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "bPairThreatV1Weight")
				? { bPairThreatV1Weight: v.bPairThreatV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "aPairPileV1Weight")
				? { aPairPileV1Weight: v.aPairPileV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "bPairPileV1Weight")
				? { bPairPileV1Weight: v.bPairPileV1Weight as number }
				: {}),
			...(Object.hasOwn(v, "initialTeamScore")
				? { initialTeamScore: v.initialTeamScore as number }
				: {}),
		},
	};
}

/** Resolve a policy's configuration without changing the saved study identity. */
export function modernStudyAgentConfig(
	config: ModernStudyConfig,
	policy: "a" | "b",
): ModernAgentConfig {
	const select = <T>(a: T, b: T): T => (policy === "a" ? a : b);
	return {
		priorWeights: config[policy],
		priorWeight: select(config.aPriorWeight, config.bPriorWeight),
		sevenBlockedV1Weight: select(
			config.aSevenBlockedV1Weight,
			config.bSevenBlockedV1Weight,
		),
		knownPairV1Weight: select(
			config.aKnownPairV1Weight,
			config.bKnownPairV1Weight,
		),
		discardRiskV1Weight: select(
			config.aDiscardRiskV1Weight,
			config.bDiscardRiskV1Weight,
		),
		pairThreatV1Weight: select(
			config.aPairThreatV1Weight,
			config.bPairThreatV1Weight,
		),
		pairPileV1Weight: select(
			config.aPairPileV1Weight,
			config.bPairPileV1Weight,
		),
		simulations:
			select(config.aSimulations, config.bSimulations) ?? config.simulations,
		timeMs: config.timeMs,
		depth: select(config.aDepth, config.bDepth) ?? config.depth,
	};
}

/** Resolve per-policy overrides while retaining the legacy shared-budget representation. */
export function modernStudyBudgets(
	config: ModernStudyConfig,
): ModernSimulationBudgets {
	return config.aSimulations === undefined && config.bSimulations === undefined
		? config.simulations
		: {
				a: config.aSimulations ?? config.simulations,
				b: config.bSimulations ?? config.simulations,
			};
}

export function modernStudyPlan(
	config: ModernStudyConfig,
	index: number,
	aTeam: 0 | 1,
): ModernMatchPlan {
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
		...(config.initialTeamScore === undefined
			? {}
			: { initialTeamScore: config.initialTeamScore }),
	};
}
