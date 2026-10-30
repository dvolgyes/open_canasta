/** Strict, pinned-model research requests with persistent accounting and no retries or fallback. */

import { createHash } from "node:crypto";
import { callModel, OpenRouter } from "@openrouter/agent";
import {
	decisionFormat,
	parseChoice,
	preferredReasoningEffort,
	reasoningSettings,
	responseText,
} from "../strategy";
import type { TurnChooser } from "../turn";

export interface ResearchLlmSettings {
	readonly model: string;
	readonly maxRequests: number;
	readonly maxCostUsd: number;
	readonly maxOutputTokens: number;
	readonly pairs: number;
}
export interface RequestRecord {
	readonly id: string;
	readonly promptSha256: string;
	readonly status: "reserved" | "success" | "failure";
	readonly choice?: number;
	readonly costUsd?: number;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly responseId?: string;
	readonly resolvedModel?: string;
}
export interface RequestJournal {
	readonly records: ReadonlyMap<string, RequestRecord>;
	write(record: RequestRecord): void;
}

export function validRequestRecord(value: unknown): value is RequestRecord {
	if (typeof value !== "object" || value === null) return false;
	const r = value as Partial<RequestRecord>;
	return (
		typeof r.id === "string" &&
		/^[a-z0-9-]{1,160}$/.test(r.id) &&
		typeof r.promptSha256 === "string" &&
		/^[a-f0-9]{64}$/.test(r.promptSha256) &&
		["reserved", "success", "failure"].includes(r.status ?? "") &&
		(r.status !== "success" ||
			(typeof r.choice === "number" &&
				Number.isSafeInteger(r.choice) &&
				r.choice >= 0)) &&
		[r.costUsd, r.inputTokens, r.outputTokens].every(
			(n) =>
				n === undefined ||
				(typeof n === "number" && Number.isFinite(n) && n >= 0),
		) &&
		[r.responseId, r.resolvedModel].every(
			(s) => s === undefined || (typeof s === "string" && s.length <= 500),
		)
	);
}

export function fundedResearchKey(value: unknown, maximumUsd: number): boolean {
	if (
		typeof value !== "object" ||
		value === null ||
		!("data" in value) ||
		typeof value.data !== "object" ||
		value.data === null
	)
		return false;
	const d = value.data as Record<string, unknown>;
	return (
		typeof d.limit === "number" &&
		Number.isFinite(d.limit) &&
		d.limit > 0 &&
		d.limit <= maximumUsd &&
		d.limit_reset === null &&
		d.include_byok_in_limit === true &&
		d.is_management_key === false &&
		typeof d.limit_remaining === "number" &&
		Number.isFinite(d.limit_remaining) &&
		d.limit_remaining > 0 &&
		d.limit_remaining <= d.limit
	);
}

export async function researchChooser(
	apiKey: string,
	settings: ResearchLlmSettings,
	journal: RequestJournal,
	fetcher: typeof fetch = fetch,
): Promise<(scope: string) => TurnChooser> {
	const key = apiKey.trim();
	if (!/^[\x21-\x7e]{1,512}$/.test(key))
		throw new Error(
			"OPENROUTER_RESEARCH_API_KEY must contain 1–512 printable ASCII characters without spaces",
		);
	const response = await fetcher("https://openrouter.ai/api/v1/key", {
		headers: { Authorization: `Bearer ${key}` },
		signal: AbortSignal.timeout(10000),
	});
	if (
		!response.ok ||
		!fundedResearchKey(await response.json(), settings.maxCostUsd)
	)
		throw new Error(
			"research LLM requires a non-resetting API key limit within maxCostUsd, including BYOK usage; key settings were not changed",
		);
	const client = new OpenRouter({ apiKey: key });
	return (scope) => {
		let call = 0;
		return {
			choose: async (prompt, labels) => {
				const id = `${scope}-${call++}`;
				const promptSha256 = createHash("sha256")
					.update(
						JSON.stringify({
							prompt,
							labels,
							model: settings.model,
							maxOutputTokens: settings.maxOutputTokens,
						}),
					)
					.digest("hex");
				const saved = journal.records.get(id);
				if (saved) {
					if (saved.promptSha256 !== promptSha256)
						throw new Error("LLM replay prompt mismatch");
					if (
						saved.status !== "success" ||
						saved.choice === undefined ||
						!Number.isSafeInteger(saved.choice) ||
						saved.choice < 0 ||
						saved.choice >= labels.length
					)
						throw new Error(
							"LLM request failed or outcome unknown; automatic paid replay is disabled",
						);
					return saved.choice;
				}
				if (journal.records.size >= settings.maxRequests)
					throw new Error("LLM request budget exhausted");
				const charged = [...journal.records.values()].reduce(
					(sum, r) => sum + (r.costUsd ?? 0),
					0,
				);
				if (
					charged >= settings.maxCostUsd ||
					[...journal.records.values()].some(
						(r) => r.status !== "success" || r.costUsd === undefined,
					)
				)
					throw new Error(
						"LLM spending budget exhausted or prior request cost unresolved",
					);
				const reserved: RequestRecord = {
					id,
					promptSha256,
					status: "reserved",
				};
				journal.write(reserved); // Durable before dispatch: a crash cannot authorize another paid request.
				try {
					const result = await callModel(
						client,
						{
							model: settings.model,
							input: prompt,
							instructions:
								'Return exactly {"choice": N}, where N indexes a supplied legal option.',
							maxOutputTokens: settings.maxOutputTokens,
							reasoning: reasoningSettings(
								settings.model,
								preferredReasoningEffort(settings.model),
							),
							store: false,
							text: { format: decisionFormat(labels.length) },
						},
						{ timeoutMs: 45000, retries: { strategy: "none" } },
					).getResponse();
					const cost = result.usage?.cost;
					const record: RequestRecord = {
						...reserved,
						status: "failure",
						responseId: result.id,
						resolvedModel: result.model,
						...(typeof cost === "number" && Number.isFinite(cost) && cost >= 0
							? { costUsd: cost }
							: {}),
						inputTokens: result.usage?.inputTokens,
						outputTokens: result.usage?.outputTokens,
					};
					journal.write(record);
					const choice = parseChoice(responseText(result), labels.length);
					journal.write({ ...record, status: "success", choice });
					return choice;
				} catch {
					const record = journal.records.get(id) ?? reserved;
					journal.write({ ...record, status: "failure" });
					throw new Error(
						"research model request failed; recorded without fallback",
					);
				}
			},
		};
	};
}
