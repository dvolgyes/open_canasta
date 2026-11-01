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
import {
	accountedNanodollars,
	boundedMetadata,
	catalogFitsGuard,
	type RequestPriceGuard,
	reportedRequestCost,
	requestReservation,
} from "./price-guard";
import type { RequestJournal, RequestRecord } from "./request-ledger";

export type { RequestJournal, RequestRecord } from "./request-ledger";
export { validRequestRecord } from "./request-ledger";

export interface ResearchLlmSettings {
	readonly model: string;
	readonly maxRequests: number;
	readonly maxCostUsd: number;
	readonly maxOutputTokens: number;
	readonly pairs: number;
	readonly priceGuard?: RequestPriceGuard;
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
	if (
		!Number.isFinite(settings.maxCostUsd) ||
		settings.maxCostUsd <= 0 ||
		settings.maxCostUsd > 100000 ||
		!Number.isSafeInteger(settings.maxRequests) ||
		settings.maxRequests < 1 ||
		settings.maxRequests > 1000000 ||
		!Number.isSafeInteger(settings.maxOutputTokens) ||
		settings.maxOutputTokens < 1 ||
		settings.maxOutputTokens > 32768
	)
		throw new Error("invalid research spending limits");
	const key = apiKey.trim();
	if (!/^[\x21-\x7e]{1,512}$/.test(key))
		throw new Error(
			"OPENROUTER_RESEARCH_API_KEY must contain 1–512 printable ASCII characters without spaces",
		);
	const guard = settings.priceGuard;
	const reservation = guard
		? requestReservation(guard, settings.maxOutputTokens)
		: 0;
	if (guard) {
		const metadata = await boundedMetadata(
			await fetcher("https://openrouter.ai/api/v1/models", {
				signal: AbortSignal.timeout(10000),
			}),
		);
		if (
			!catalogFitsGuard(
				metadata,
				settings.model,
				guard,
				settings.maxOutputTokens,
			)
		)
			throw new Error(
				"model metadata exceeds the configured request price guard",
			);
	} else {
		const response = await fetcher("https://openrouter.ai/api/v1/key", {
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(10000),
		});
		if (
			!response.ok ||
			!fundedResearchKey(await boundedMetadata(response), settings.maxCostUsd)
		)
			throw new Error(
				"research LLM requires a non-resetting API key limit within maxCostUsd, including BYOK usage; key settings were not changed",
			);
	}
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
							...(guard ? { priceGuard: guard } : {}),
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
					(sum, r) =>
						sum +
						(guard ? accountedNanodollars(r.costUsd ?? 0) : (r.costUsd ?? 0)),
					0,
				);
				if (
					(guard
						? charged + reservation > Math.floor(settings.maxCostUsd * 1e9)
						: charged >= settings.maxCostUsd) ||
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
					...(guard ? { reservedNanodollars: reservation } : {}),
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
							...(guard
								? {
										plugins: [],
										provider: {
											only: [guard.provider],
											order: [guard.provider],
											allowFallbacks: false,
											requireParameters: true,
											maxPrice: {
												prompt: String(guard.promptUsdPerMillion),
												completion: String(guard.completionUsdPerMillion),
												request: "0",
											},
										},
									}
								: {}),
							text: { format: decisionFormat(labels.length) },
						},
						{ timeoutMs: 45000, retries: { strategy: "none" } },
					).getResponse();
					const cost = reportedRequestCost(result.usage);
					const record: RequestRecord = {
						...reserved,
						status: "failure",
						responseId: result.id,
						resolvedModel: result.model,
						...(typeof result.usage?.cost === "number" &&
						Number.isFinite(result.usage.cost) &&
						result.usage.cost >= 0
							? { routerCostUsd: result.usage.cost }
							: {}),
						...(typeof result.usage?.costDetails?.upstreamInferenceCost ===
							"number" &&
						Number.isFinite(result.usage.costDetails.upstreamInferenceCost) &&
						result.usage.costDetails.upstreamInferenceCost >= 0
							? {
									upstreamCostUsd:
										result.usage.costDetails.upstreamInferenceCost,
								}
							: {}),
						...(typeof cost === "number" && Number.isFinite(cost) && cost >= 0
							? { costUsd: cost }
							: {}),
						inputTokens: result.usage?.inputTokens,
						outputTokens: result.usage?.outputTokens,
					};
					journal.write(record);
					if (
						record.costUsd === undefined ||
						(guard &&
							(result.model !== settings.model ||
								accountedNanodollars(record.costUsd) > reservation ||
								!Number.isSafeInteger(record.inputTokens) ||
								(record.inputTokens ?? -1) < 0 ||
								(record.inputTokens ?? Infinity) > guard.contextTokens ||
								!Number.isSafeInteger(record.outputTokens) ||
								(record.outputTokens ?? -1) < 0 ||
								(record.outputTokens ?? Infinity) > settings.maxOutputTokens))
					)
						throw new Error("unresolved cost or request ceiling violated");
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
