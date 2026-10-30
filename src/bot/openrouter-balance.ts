import { isObject } from "../protocol";
import { normalizeHostApiKey } from "./host-key";
import { readOpenRouterMetadata } from "./openrouter-metadata";

export interface OpenRouterBalance {
	/** Account credit less usage, capped by the key's remaining limit when present. */
	readonly balanceUsd?: number;
	/** Remaining key limit, which is not necessarily the account's balance. */
	readonly limitUsd?: number;
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** A missing or forbidden credits response is normal for a non-management key. */
export async function readOpenRouterBalance(
	apiKey: string,
	signal?: AbortSignal,
): Promise<OpenRouterBalance> {
	const init: RequestInit = {
		headers: { Authorization: `Bearer ${normalizeHostApiKey(apiKey)}` },
		credentials: "omit",
		redirect: "error",
		cache: "no-store",
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
			: AbortSignal.timeout(15_000),
	};
	const read = async (url: string): Promise<unknown> => {
		const response = await fetch(url, init);
		return response.ok ? readOpenRouterMetadata(response) : undefined;
	};
	const [key, credits] = await Promise.allSettled([
		read("https://openrouter.ai/api/v1/key"),
		read("https://openrouter.ai/api/v1/credits"),
	]);
	if (
		key.status !== "fulfilled" ||
		!isObject(key.value) ||
		!isObject(key.value.data)
	)
		return {};
	const keyData = key.value.data;
	const limit =
		keyData.limit !== null && finite(keyData.limit_remaining)
			? Math.max(0, keyData.limit_remaining)
			: undefined;
	const creditData =
		credits.status === "fulfilled" &&
		isObject(credits.value) &&
		isObject(credits.value.data)
			? credits.value.data
			: undefined;
	const available =
		creditData &&
		finite(creditData.total_credits) &&
		finite(creditData.total_usage)
			? Math.max(0, creditData.total_credits - creditData.total_usage)
			: undefined;
	return {
		...(available === undefined
			? {}
			: {
					balanceUsd:
						limit === undefined ? available : Math.min(available, limit),
				}),
		...(limit === undefined ? {} : { limitUsd: limit }),
	};
}
