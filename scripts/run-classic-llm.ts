/** Paid diagnostic, gated on the full local study and one persistent aggregate ledger. */
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { REFERENCE_PRIOR } from "../src/bot/canasta-prior";
import { NODE_PROMPT_TEMPLATES } from "../src/bot/node-prompts";
import { type MatchResult, playMatch } from "../src/bot/research/arena";
import { studySeed } from "../src/bot/research/campaign";
import { verifyClassic1000 } from "../src/bot/research/classic-prerequisite";
import {
	type RequestRecord,
	researchChooser,
} from "../src/bot/research/openrouter";
import { llmAgent, localAgent } from "../src/bot/research/policies";
import {
	accountedNanodollars,
	boundedMetadata,
} from "../src/bot/research/price-guard";

const [localRoot, ...extra] = process.argv.slice(2);
if (!localRoot || extra.length)
	throw new Error(
		"usage: node --import tsx scripts/run-classic-llm.ts LOCAL_STUDY_DIRECTORY",
	);
const root = resolve(localRoot);
const prerequisite = verifyClassic1000(root); // This must precede credential loading and network access.
const out = join(root, "llm-test");
mkdirSync(out); // Existing output, including a failed attempt, cannot reset the aggregate budget.
const save = (name: string, value: unknown) => {
	const path = join(out, name),
		temporary = `${path}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value, null, "\t")}\n`, {
		flush: true,
	});
	renameSync(temporary, path);
};
save("run.lock", { pid: process.pid, started: new Date().toISOString() });
const records = new Map<string, RequestRecord>();
const results: { label: string; result: MatchResult }[] = [];
let completed = false;
try {
	const catalog = await boundedMetadata(
		await fetch("https://openrouter.ai/api/v1/models", {
			signal: AbortSignal.timeout(10000),
		}),
	);
	if (
		typeof catalog !== "object" ||
		catalog === null ||
		!("data" in catalog) ||
		!Array.isArray(catalog.data)
	)
		throw new Error("invalid model catalog");
	const entries = catalog.data;
	const model = ["inception/mercury-3-20261019", "inception/mercury-3"].find(
		(id) => entries.some((entry) => entry?.id === id),
	);
	if (!model) throw new Error("the declared Mercury 3 opponent is unavailable");
	const settings = {
		model,
		maxRequests: 4000,
		maxCostUsd: 1,
		maxOutputTokens: 4096,
		pairs: 1,
		priceGuard: {
			provider: "inception",
			contextTokens: 1000000,
			promptUsdPerMillion: 0.1,
			completionUsdPerMillion: 0.35,
		},
	};
	const labels = [{ label: "reference", weights: REFERENCE_PRIOR }];
	if (
		JSON.stringify(prerequisite.candidate) !== JSON.stringify(REFERENCE_PRIOR)
	)
		labels.push({ label: "candidate", weights: prerequisite.candidate });
	const budget = {
		kind: "iterations" as const,
		iterations: 8,
		depth: 12,
		emergencyTimeMs: 60000,
	};
	const base = {
		seed: studySeed(1779033703, 5, 0),
		policySeed: studySeed(1779033703, 37, 0),
		dealer: 0 as const,
		maxHands: 100,
		maxActionsPerHand: 2000,
	};
	save("manifest.json", {
		prerequisite,
		settings,
		labels,
		budget,
		plan: base,
		modelMetadata: entries.filter((entry) => entry?.id === model),
		commit: execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim(),
		node: process.version,
		startedAt: new Date().toISOString(),
		maxWallMs: 3600000,
	});
	const apiKey =
		parseEnv(readFileSync(".env", "utf8")).OPENROUTER_API_KEY ?? "";
	const chooser = await researchChooser(apiKey, settings, {
		records,
		write: (record) => {
			save(`request-${record.id}.json`, record);
			records.set(record.id, record);
		},
	});
	const signal = AbortSignal.timeout(3600000);
	for (const policy of labels) {
		for (const aTeam of [0, 1] as const) {
			process.stderr.write(
				`LLM diagnostic ${policy.label}, A=${aTeam === 0 ? "N-S" : "E-W"}\n`,
			);
			const result = await playMatch(
				{ ...base, aTeam },
				(seat, side) =>
					side === "a"
						? localAgent({ kind: "mcts", weights: policy.weights, budget })
						: llmAgent(
								chooser(`${policy.label}-${aTeam}-${seat}`),
								NODE_PROMPT_TEMPLATES,
							),
				signal,
			);
			results.push({ label: policy.label, result });
			save(`${policy.label}-${aTeam}.json`, {
				weights: policy.weights,
				result,
			});
			if (result.status !== "complete")
				throw new Error(
					"LLM diagnostic incomplete; results and charges retained",
				);
		}
	}
	completed = true;
} finally {
	const reportedCostUsd = [...records.values()].reduce(
		(sum, record) => sum + (record.costUsd ?? 0),
		0,
	);
	const accountedCostUsd =
		[...records.values()].reduce(
			(sum, record) => sum + accountedNanodollars(record.costUsd ?? 0),
			0,
		) / 1e9;
	const maximumAccountedExposureUsd =
		[...records.values()].reduce(
			(sum, record) =>
				sum +
				(record.costUsd === undefined
					? (record.reservedNanodollars ?? 0)
					: accountedNanodollars(record.costUsd)),
			0,
		) / 1e9;
	const summary = {
		status: completed ? "complete" : "incomplete",
		results,
		requests: records.size,
		reportedCostUsd,
		accountedCostUsd,
		maximumAccountedExposureUsd,
		failedRequests: [...records.values()].filter(
			(record) => record.status !== "success",
		).length,
		unresolvedCosts: [...records.values()].filter(
			(record) => record.costUsd === undefined,
		).length,
		maxCostUsd: 1,
		diagnosticOnly: true,
		finishedAt: new Date().toISOString(),
	};
	save("summary.json", summary);
	unlinkSync(join(out, "run.lock"));
	process.stdout.write(`${JSON.stringify(summary)}\n`);
}
