import { mulberry32 } from "../../canasta/random";
import { MODERN_PRIOR_WEIGHTS, type ModernPriorWeights } from "../modern-prior";
import { type MatchPlan, streamSeed } from "./arena";
import type { ModernMatchResult } from "./modern-arena";
import {
	summarizeModernHandPairs,
	summarizeModernPairs,
	validModernResult,
} from "./modern-evidence";
import { modernStudyPlan, parseModernStudyConfig } from "./modern-study";
import { type SpsaSchedule, spsaProbe, spsaUpdate } from "./spsa";

export interface ModernOptimizerConfig {
	readonly seed: number;
	readonly split: number;
	readonly updates: number;
	readonly blocks: number;
	readonly radius: number;
	readonly objective?: "match-win" | "hand-score";
	readonly schedule: SpsaSchedule;
	readonly maxHands: number;
	readonly maxActionsPerHand: number;
	readonly simulations: number;
	readonly timeMs: number;
	readonly depth: number;
	readonly opponents: readonly (ModernPriorWeights | null)[];
}

export type ModernOptimizerConfigResult =
	| { readonly ok: true; readonly config: ModernOptimizerConfig }
	| { readonly ok: false; readonly reason: string };

/** Parse only local optimizer settings; unsupported or misspelled fields fail closed. */
export function parseModernOptimizerConfig(
	value: unknown,
): ModernOptimizerConfigResult {
	const fail = (): ModernOptimizerConfigResult => ({
		ok: false,
		reason: "invalid modern optimizer configuration",
	});
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return fail();
	const v = value as Record<string, unknown>;
	const fields = [
		"version",
		"seed",
		"split",
		"updates",
		"blocks",
		"radius",
		"objective",
		"schedule",
		"maxHands",
		"maxActionsPerHand",
		"simulations",
		"timeMs",
		"depth",
		"opponents",
	];
	if (
		Object.keys(v).some((key) => !fields.includes(key)) ||
		fields
			.filter((field) => field !== "objective")
			.some((field) => !Object.hasOwn(v, field)) ||
		v.version !== 1
	)
		return fail();
	const objective = v.objective === undefined ? "match-win" : v.objective;
	if (objective !== "match-win" && objective !== "hand-score") return fail();
	if (objective === "hand-score" && v.maxHands !== 1) return fail();
	if (
		!Number.isSafeInteger(v.updates) ||
		(v.updates as number) < 1 ||
		!Number.isSafeInteger(v.blocks) ||
		(v.blocks as number) < 1 ||
		typeof v.radius !== "number" ||
		!Number.isFinite(v.radius) ||
		v.radius <= 0 ||
		v.radius > 8
	)
		return fail();
	if (
		typeof v.schedule !== "object" ||
		v.schedule === null ||
		Array.isArray(v.schedule)
	)
		return fail();
	const schedule = v.schedule as Record<string, unknown>;
	if (
		Object.keys(schedule).length !== 3 ||
		Object.keys(schedule).some(
			(key) => !["step", "perturbation", "stability"].includes(key),
		) ||
		typeof schedule.step !== "number" ||
		!Number.isFinite(schedule.step) ||
		schedule.step <= 0 ||
		typeof schedule.perturbation !== "number" ||
		!Number.isFinite(schedule.perturbation) ||
		schedule.perturbation <= 0 ||
		schedule.perturbation > 1 ||
		typeof schedule.stability !== "number" ||
		!Number.isFinite(schedule.stability) ||
		schedule.stability < 0
	)
		return fail();
	const updates = v.updates as number;
	const blocks = v.blocks as number;
	if (
		!Array.isArray(v.opponents) ||
		v.opponents.length < 1 ||
		v.opponents.length > 16
	)
		return fail();
	const parsed = v.opponents.map((opponent) =>
		parseModernStudyConfig({
			version: 1,
			seed: v.seed,
			split: v.split,
			pairs: updates * blocks,
			maxHands: v.maxHands,
			maxActionsPerHand: v.maxActionsPerHand,
			simulations: v.simulations,
			timeMs: v.timeMs,
			depth: v.depth,
			a: MODERN_PRIOR_WEIGHTS,
			b: opponent,
		}),
	);
	if (parsed.some((item) => !item.ok)) return fail();
	const first = parsed[0];
	if (!first?.ok) return fail();
	const p = first.config;
	const opponents = parsed.flatMap((item) => (item.ok ? [item.config.b] : []));
	return {
		ok: true,
		config: {
			seed: p.seed,
			split: p.split,
			updates,
			blocks,
			radius: v.radius,
			objective,
			schedule: {
				step: schedule.step,
				perturbation: schedule.perturbation,
				stability: schedule.stability,
			},
			maxHands: p.maxHands,
			maxActionsPerHand: p.maxActionsPerHand,
			simulations: p.simulations,
			timeMs: p.timeMs,
			depth: p.depth,
			opponents,
		},
	};
}

export interface ModernOptimizationJob {
	readonly update: number;
	readonly label: "plus" | "minus";
	readonly block: number;
	readonly objective: "match-win" | "hand-score";
	readonly candidate: ModernPriorWeights;
	readonly opponent: ModernPriorWeights | null;
	readonly plans: readonly [MatchPlan, MatchPlan];
}

export interface ModernOptimizationResult {
	readonly status: "complete" | "incomplete";
	readonly objective: "match-win" | "hand-score";
	readonly completedUpdates: number;
	readonly point: readonly number[];
	readonly candidate: ModernPriorWeights;
	readonly reason?: string;
}

export type ModernPairEvaluator = (
	job: ModernOptimizationJob,
) => Promise<readonly [ModernMatchResult, ModernMatchResult] | null>;
export type ModernOptimizationEvent = Readonly<Record<string, unknown>>;

const FEATURES = Object.keys(
	MODERN_PRIOR_WEIGHTS,
) as (keyof ModernPriorWeights)[];

/** A radius above one permits testing a reversal of a handcrafted coefficient. */
export function modernWeightsAt(
	point: readonly number[],
	radius: number,
): ModernPriorWeights {
	if (
		point.length !== FEATURES.length ||
		point.some((n) => !Number.isFinite(n) || Math.abs(n) > 1) ||
		!Number.isFinite(radius) ||
		radius <= 0 ||
		radius > 8
	)
		throw new Error("invalid modern prior vector");
	return Object.fromEntries(
		FEATURES.map((key, index) => [
			key,
			MODERN_PRIOR_WEIGHTS[key] +
				radius *
					Math.max(1, Math.abs(MODERN_PRIOR_WEIGHTS[key])) *
					(point[index] ?? 0),
		]),
	) as unknown as ModernPriorWeights;
}

/** Optimize exploratory weights against a frozen opponent league; no candidate is promoted here. */
export async function runModernOptimizer(
	config: ModernOptimizerConfig,
	evaluate: ModernPairEvaluator,
	emit: (event: ModernOptimizationEvent) => Promise<void>,
): Promise<ModernOptimizationResult> {
	const objective = config.objective ?? "match-win";
	if (
		(objective !== "match-win" && objective !== "hand-score") ||
		(objective === "hand-score" && config.maxHands !== 1)
	)
		throw new Error("invalid modern optimization objective");
	if (
		!Number.isSafeInteger(config.updates) ||
		config.updates < 1 ||
		!Number.isSafeInteger(config.blocks) ||
		config.blocks < 1 ||
		config.updates * config.blocks > 10000
	)
		throw new Error("invalid modern optimizer size");
	if (
		!Array.isArray(config.opponents) ||
		config.opponents.length < 1 ||
		config.opponents.length > 16
	)
		throw new Error("invalid modern opponent league");
	const studies = config.opponents.map((opponent) =>
		parseModernStudyConfig({
			version: 1,
			seed: config.seed,
			split: config.split,
			pairs: config.updates * config.blocks,
			maxHands: config.maxHands,
			maxActionsPerHand: config.maxActionsPerHand,
			simulations: config.simulations,
			timeMs: config.timeMs,
			depth: config.depth,
			a: MODERN_PRIOR_WEIGHTS,
			b: opponent,
		}),
	);
	if (studies.some((study) => !study.ok))
		throw new Error("invalid modern study configuration");
	const parsed = studies[0];
	if (!parsed?.ok) throw new Error("missing modern opponent");
	const opponents = studies.flatMap((study) =>
		study.ok ? [study.config.b] : [],
	);
	let point = FEATURES.map(() => 0);
	modernWeightsAt(point, config.radius);
	const result = (
		status: "complete" | "incomplete",
		completedUpdates: number,
		reason?: string,
	): ModernOptimizationResult => ({
		status,
		objective,
		completedUpdates,
		point: [...point],
		candidate: modernWeightsAt(point, config.radius),
		...(reason ? { reason } : {}),
	});
	for (let update = 1; update <= config.updates; update++) {
		const probe = spsaProbe(
			point,
			update,
			config.schedule,
			mulberry32(streamSeed(config.seed, 17, update)),
		);
		const fitness: number[] = [];
		for (const [label, vector] of [
			["plus", probe.plus],
			["minus", probe.minus],
		] as const) {
			let sum = 0;
			for (let block = 0; block < config.blocks; block++) {
				const index = (update - 1) * config.blocks + block;
				// Rotate the league after each dealer cycle to avoid coupling an opponent to a seat.
				const opponent =
					opponents[((index % 4) + Math.floor(index / 4)) % opponents.length];
				if (opponent === undefined) throw new Error("missing modern opponent");
				const job: ModernOptimizationJob = {
					update,
					label,
					block,
					objective,
					candidate: modernWeightsAt(vector, config.radius),
					opponent,
					plans: [
						modernStudyPlan(parsed.config, index, 0),
						modernStudyPlan(parsed.config, index, 1),
					],
				};
				const legs = await evaluate(job);
				if (legs === null) {
					await emit({ kind: "cancelled-pair", job });
					return result("incomplete", update - 1, "cancelled");
				}
				if (
					!validModernResult(legs[0], job.plans[0], config.simulations) ||
					!validModernResult(legs[1], job.plans[1], config.simulations)
				) {
					await emit({ kind: "invalid-pair", job, legs });
					throw new Error("results do not match the scheduled modern pair");
				}
				const summary =
					objective === "hand-score"
						? summarizeModernHandPairs([legs], 1, config.simulations)
						: summarizeModernPairs([legs], 1, config.simulations);
				await emit({ kind: "pair", job, legs, summary });
				const score =
					"meanPairScore" in summary ? summary.meanPairScore : summary.winRate;
				if (!summary.eligible || score === null)
					return result(
						"incomplete",
						update - 1,
						`incomplete or budget-limited ${label} pair ${block}`,
					);
				sum += score;
			}
			fitness.push(sum / config.blocks);
		}
		const plus = fitness[0],
			minus = fitness[1];
		if (plus === undefined || minus === undefined)
			throw new Error("missing modern optimizer fitness");
		point = spsaUpdate(point, probe, plus, minus);
		await emit({
			kind: "update",
			update,
			point: [...point],
			candidate: modernWeightsAt(point, config.radius),
			fitnessPlus: plus,
			fitnessMinus: minus,
		});
	}
	return result("complete", config.updates);
}
