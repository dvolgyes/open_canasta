/** Optimizer state is separate from the tested champion; all game execution is injected. */
import { mulberry32 } from "../../canasta";
import {
	PRIOR_FEATURES,
	type PriorWeights,
	REFERENCE_PRIOR,
} from "../canasta-prior";
import { type MatchPlan, type PairResult, streamSeed } from "./arena";
import { validCampaign } from "./config";
import type { LocalPolicy, ResearchBudget } from "./policies";
import { type SpsaSchedule, spsaProbe, spsaUpdate } from "./spsa";
import { boundedEstimate } from "./statistics";

export interface CampaignConfig {
	readonly seed: number;
	readonly updates: number;
	readonly trainingPairs: number;
	readonly evaluationPairs: number;
	readonly checkpointEvery: number;
	readonly alpha: number;
	readonly method: "spsa" | "random";
	readonly schedule: SpsaSchedule;
	readonly budget: ResearchBudget;
	readonly maxHands: number;
	readonly maxActionsPerHand: number;
}
export interface PairJob {
	readonly id: string;
	readonly plan: Omit<MatchPlan, "aTeam">;
	readonly a: LocalPolicy;
	readonly b: LocalPolicy;
}
export type PairEvaluator = (job: PairJob) => Promise<PairResult>;
export interface CampaignState {
	readonly update: number;
	readonly point: readonly number[];
	readonly candidate: PriorWeights;
	readonly champion: PriorWeights;
	readonly promotions: number;
}
export type CampaignEvent = Readonly<Record<string, unknown>>;

export function weightsAt(point: readonly number[]): PriorWeights {
	if (
		point.length !== PRIOR_FEATURES.length ||
		point.some((v) => !Number.isFinite(v) || Math.abs(v) > 1)
	)
		throw new Error("invalid normalized prior vector");
	return Object.fromEntries(
		PRIOR_FEATURES.map((key, i) => [
			key,
			REFERENCE_PRIOR[key] +
				Math.max(Math.abs(REFERENCE_PRIOR[key]), 0.1) * (point[i] ?? 0),
		]),
	) as unknown as PriorWeights;
}

/** Split/index pairs occupy disjoint namespaces in a permutation of the 32-bit deal-seed space. */
export function studySeed(
	master: number,
	split: number,
	index: number,
): number {
	if (
		!Number.isInteger(split) ||
		split < 0 ||
		split > 63 ||
		!Number.isSafeInteger(index) ||
		index < 0 ||
		index >= 2 ** 26
	)
		throw new Error("study seed namespace exhausted");
	return streamSeed(master, split * 2 ** 26 + index);
}

export function makePairJob(
	config: CampaignConfig,
	id: string,
	split: number,
	index: number,
	a: PriorWeights,
	b: PriorWeights,
): PairJob {
	return {
		id,
		plan: {
			seed: studySeed(config.seed, split, index),
			policySeed: studySeed(config.seed, split + 32, index),
			dealer: (index % 4) as 0 | 1 | 2 | 3,
			maxActionsPerHand: config.maxActionsPerHand,
			maxHands: config.maxHands,
		},
		a: { kind: "mcts", weights: a, budget: config.budget },
		b: { kind: "mcts", weights: b, budget: config.budget },
	};
}

export async function runCampaign(
	config: CampaignConfig,
	evaluate: PairEvaluator,
	emit: (event: CampaignEvent) => Promise<void>,
	llmCheck?: (state: CampaignState) => Promise<unknown>,
): Promise<CampaignState> {
	if (!validCampaign(config)) throw new Error("invalid campaign configuration");
	let point = PRIOR_FEATURES.map(() => 0);
	let champion: PriorWeights = REFERENCE_PRIOR;
	let promotions = 0;
	let bestRandomFitness = -Infinity;
	const archive: PriorWeights[] = [];
	const checkpoints = Math.ceil(config.updates / config.checkpointEvery);
	const gateAlpha = config.alpha / (2 * checkpoints);
	let epochChampion = champion,
		epochArchive: readonly PriorWeights[] = [];
	for (let update = 1; update <= config.updates; update++) {
		if ((update - 1) % config.checkpointEvery === 0) {
			epochChampion = champion;
			epochArchive = [...archive];
		}
		const rng = mulberry32(streamSeed(config.seed, 2, update));
		const probe = spsaProbe(point, update, config.schedule, rng);
		const plus =
			config.method === "spsa" ? probe.plus : point.map(() => 2 * rng() - 1);
		const minus =
			config.method === "spsa" ? probe.minus : point.map(() => 2 * rng() - 1);
		const outcomes: number[] = [];
		for (const [label, vector] of [
			["plus", plus],
			["minus", minus],
		] as const) {
			const values: number[] = [];
			for (let block = 0; block < config.trainingPairs; block++) {
				const index = (update - 1) * config.trainingPairs + block;
				const opponentRng = mulberry32(streamSeed(config.seed, 3, index));
				const bucket = opponentRng();
				const opponent =
					bucket < 0.5
						? epochChampion
						: bucket < 0.75 && epochArchive.length
							? (epochArchive[
									Math.floor(opponentRng() * epochArchive.length)
								] ?? REFERENCE_PRIOR)
							: REFERENCE_PRIOR;
				const job = makePairJob(
					config,
					`train-${update}-${label}-${block}`,
					0,
					index,
					weightsAt(vector),
					opponent,
				);
				const result = await evaluate(job);
				await emit({
					kind: "pair",
					phase: "training",
					update,
					label,
					block,
					job,
					result,
				});
				if (result.score === null)
					throw new Error(
						`incomplete training pair ${job.id}; results retained, champion unchanged`,
					);
				values.push(result.score);
			}
			outcomes.push(values.reduce((s, v) => s + v, 0) / values.length);
		}
		const fitnessPlus = outcomes[0],
			fitnessMinus = outcomes[1];
		if (fitnessPlus === undefined || fitnessMinus === undefined)
			throw new Error("missing perturbation measurement");
		if (config.method === "spsa")
			point = spsaUpdate(point, probe, fitnessPlus, fitnessMinus);
		else if (Math.max(fitnessPlus, fitnessMinus) > bestRandomFitness) {
			point = [...(fitnessPlus >= fitnessMinus ? plus : minus)];
			bestRandomFitness = Math.max(fitnessPlus, fitnessMinus);
		}
		const candidate = weightsAt(point);
		await emit({
			kind: "update",
			update,
			point,
			candidate,
			fitnessPlus,
			fitnessMinus,
		});
		if (update % config.checkpointEvery !== 0 && update !== config.updates)
			continue;
		const wins: (number | null)[] = [],
			differences: (number | null)[] = [];
		for (let block = 0; block < config.evaluationPairs; block++) {
			const index =
				(Math.ceil(update / config.checkpointEvery) - 1) *
					config.evaluationPairs +
				block;
			const run = async (
				label: string,
				a: PriorWeights,
				b: PriorWeights,
				split: number,
			) => {
				const job = makePairJob(
					config,
					`promotion-${update}-${label}-${block}`,
					split,
					index,
					a,
					b,
				);
				const result = await evaluate(job);
				await emit({
					kind: "pair",
					phase: "promotion",
					update,
					label,
					block,
					job,
					result,
				});
				return result.score;
			};
			wins.push(await run("incumbent", candidate, champion, 1));
			const candidateAnchor = await run(
				"candidate-anchor",
				candidate,
				REFERENCE_PRIOR,
				2,
			);
			const championAnchor = await run(
				"champion-anchor",
				champion,
				REFERENCE_PRIOR,
				2,
			);
			differences.push(
				candidateAnchor === null || championAnchor === null
					? null
					: candidateAnchor - championAnchor,
			);
		}
		const superiority = boundedEstimate(
			wins,
			config.evaluationPairs,
			gateAlpha,
		);
		const noninferiority = boundedEstimate(
			differences,
			config.evaluationPairs,
			gateAlpha,
			-1,
			1,
		);
		const promoted = superiority.lower > 0.5 && noninferiority.lower > -0.02;
		if (promoted) {
			champion = candidate;
			promotions++;
		}
		archive.push(candidate);
		const state: CampaignState = {
			update,
			point,
			candidate,
			champion,
			promotions,
		};
		await emit({
			kind: "checkpoint",
			...state,
			superiority,
			noninferiority,
			promoted,
		});
		const llm = llmCheck
			? await llmCheck(state)
			: {
					status: "skipped",
					reason: "no funded, pinned LLM opponent configured",
				};
		await emit({ kind: "llm-checkpoint", update, result: llm });
	}
	return {
		update: config.updates,
		point,
		candidate: weightsAt(point),
		champion,
		promotions,
	};
}
