import { type PriorWeights, validPriorWeights } from "../canasta-prior";
import type { CampaignConfig } from "./campaign";
import type { ResearchLlmSettings } from "./openrouter";
import type { ResearchBudget } from "./policies";
import { validPriceGuard } from "./price-guard";

export type StudyOpponent =
	| { readonly kind: "heuristic" }
	| { readonly kind: "llm" }
	| { readonly kind: "mcts"; readonly weights: PriorWeights | null };
export type StudyConfig =
	| {
			readonly version: 1;
			readonly mode: "train";
			readonly parallel: boolean;
			readonly maxWallMs: number;
			readonly campaign: CampaignConfig;
			readonly llm?: ResearchLlmSettings;
	  }
	| {
			readonly version: 1;
			readonly mode: "evaluate";
			readonly parallel: boolean;
			readonly parallelPairs?: number;
			readonly maxWallMs: number;
			readonly seed: number;
			readonly pairs: number;
			readonly alpha: number;
			readonly split: "validation" | "test";
			readonly budget: ResearchBudget;
			readonly maxHands: number;
			readonly maxActionsPerHand: number;
			readonly candidate: PriorWeights;
			readonly opponent: StudyOpponent;
			readonly llm?: ResearchLlmSettings;
	  };
type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const keys = (
	v: RecordValue,
	names: readonly string[],
	optional: readonly string[] = [],
) =>
	Object.keys(v).every((n) => names.includes(n) || optional.includes(n)) &&
	names.every((n) => Object.hasOwn(v, n));
const integer = (v: unknown, min: number, max: number): v is number =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const real = (v: unknown, min: number, max: number): v is number =>
	typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function validLlm(v: unknown): v is ResearchLlmSettings {
	return (
		object(v) &&
		keys(
			v,
			["model", "maxRequests", "maxCostUsd", "maxOutputTokens", "pairs"],
			["priceGuard"],
		) &&
		typeof v.model === "string" &&
		/^[\w~][\w./:@+-]{0,199}$/.test(v.model) &&
		integer(v.maxRequests, 1, 1000000) &&
		real(v.maxCostUsd, 0.01, 100000) &&
		integer(v.maxOutputTokens, 1, 32768) &&
		integer(v.pairs, 1, 100000) &&
		(v.priceGuard === undefined || validPriceGuard(v.priceGuard))
	);
}

export function validResearchBudget(v: unknown): v is ResearchBudget {
	if (!object(v) || !integer(v.depth, 1, 200)) return false;
	return v.kind === "iterations"
		? keys(v, ["kind", "iterations", "depth", "emergencyTimeMs"]) &&
				integer(v.iterations, 1, 1000000) &&
				integer(v.emergencyTimeMs, 1, 60000)
		: v.kind === "time" &&
				keys(v, ["kind", "timeMs", "depth"]) &&
				integer(v.timeMs, 1, 60000);
}

export function validCampaign(v: unknown): v is CampaignConfig {
	if (
		!object(v) ||
		!keys(
			v,
			[
				"seed",
				"updates",
				"trainingPairs",
				"evaluationPairs",
				"checkpointEvery",
				"alpha",
				"method",
				"schedule",
				"budget",
				"maxHands",
				"maxActionsPerHand",
			],
			["weightRadius", "parallelPairs"],
		)
	)
		return false;
	if (
		!integer(v.seed, 0, 0xffffffff) ||
		!integer(v.updates, 1, 100000) ||
		!integer(v.trainingPairs, 1, 100000) ||
		!integer(v.evaluationPairs, 1, 100000) ||
		!integer(v.checkpointEvery, 1, 100000) ||
		!real(v.alpha, 0.000001, 0.1) ||
		!["spsa", "random"].includes(String(v.method)) ||
		!validResearchBudget(v.budget) ||
		v.budget.kind !== "iterations" ||
		!integer(v.maxHands, 1, 10000) ||
		!integer(v.maxActionsPerHand, 1, 100000) ||
		(v.weightRadius !== undefined && !real(v.weightRadius, 0.01, 8)) ||
		(v.parallelPairs !== undefined && !integer(v.parallelPairs, 1, 4))
	)
		return false;
	if (
		v.updates * v.trainingPairs >= 2 ** 26 ||
		Math.ceil(v.updates / v.checkpointEvery) * v.evaluationPairs >= 2 ** 26
	)
		return false;
	return (
		object(v.schedule) &&
		keys(v.schedule, ["step", "perturbation", "stability"]) &&
		real(v.schedule.step, 0.000001, 10) &&
		real(v.schedule.perturbation, 0.000001, 1) &&
		real(v.schedule.stability, 0, 100000)
	);
}

export function parseStudyConfig(
	v: unknown,
): { ok: true; config: StudyConfig } | { ok: false; reason: string } {
	if (
		!object(v) ||
		v.version !== 1 ||
		typeof v.parallel !== "boolean" ||
		(v.parallelPairs !== undefined && !integer(v.parallelPairs, 1, 4)) ||
		(!v.parallel && v.parallelPairs !== undefined && v.parallelPairs !== 1) ||
		!integer(v.maxWallMs, 1000, 86400000)
	)
		return {
			ok: false,
			reason:
				"study requires version 1, parallel and maxWallMs between 1000 and 86400000",
		};
	if (v.llm !== undefined && !validLlm(v.llm))
		return {
			ok: false,
			reason:
				"LLM evaluation requires a pinned model and explicit request, USD, output-token and paired-match limits",
		};
	if (
		v.mode === "train" &&
		keys(
			v,
			["version", "mode", "parallel", "maxWallMs", "campaign"],
			["llm"],
		) &&
		validCampaign(v.campaign) &&
		(v.parallel || (v.campaign.parallelPairs ?? 1) === 1)
	)
		return { ok: true, config: v as unknown as StudyConfig };
	if (
		v.mode === "evaluate" &&
		keys(
			v,
			[
				"version",
				"mode",
				"parallel",
				"maxWallMs",
				"seed",
				"pairs",
				"alpha",
				"split",
				"budget",
				"maxHands",
				"maxActionsPerHand",
				"candidate",
				"opponent",
			],
			["llm", "parallelPairs"],
		) &&
		integer(v.seed, 0, 0xffffffff) &&
		integer(v.pairs, 1, 100000) &&
		real(v.alpha, 0.000001, 0.1) &&
		(v.split === "validation" || v.split === "test") &&
		validResearchBudget(v.budget) &&
		(!v.parallel || v.budget.kind === "iterations") &&
		integer(v.maxHands, 1, 10000) &&
		integer(v.maxActionsPerHand, 1, 100000) &&
		validPriorWeights(v.candidate) &&
		object(v.opponent) &&
		(v.opponent.kind === "llm"
			? validLlm(v.llm) && !v.parallel && keys(v.opponent, ["kind"])
			: v.llm === undefined &&
				((v.opponent.kind === "heuristic" && keys(v.opponent, ["kind"])) ||
					(v.opponent.kind === "mcts" &&
						keys(v.opponent, ["kind", "weights"]) &&
						(v.opponent.weights === null ||
							validPriorWeights(v.opponent.weights)))))
	)
		return { ok: true, config: v as unknown as StudyConfig };
	return {
		ok: false,
		reason:
			"invalid study configuration: use the documented schema; training needs iteration budgets and timed evaluation must run sequentially",
	};
}
