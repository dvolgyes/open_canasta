/** A text-only request ceiling, reserved before dispatch rather than estimated after billing. */
export interface RequestPriceGuard {
	readonly provider: string;
	readonly contextTokens: number;
	readonly promptUsdPerMillion: number;
	readonly completionUsdPerMillion: number;
}

export function validPriceGuard(value: unknown): value is RequestPriceGuard {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const v = value as Record<string, unknown>;
	return (
		Object.keys(v).length === 4 &&
		typeof v.provider === "string" &&
		/^[a-z0-9-]{1,80}$/.test(v.provider) &&
		typeof v.contextTokens === "number" &&
		Number.isSafeInteger(v.contextTokens) &&
		v.contextTokens >= 1 &&
		v.contextTokens <= 20000000 &&
		[v.promptUsdPerMillion, v.completionUsdPerMillion].every(
			(n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1000,
		)
	);
}

/** Round reported charges upward in the local spending ledger. */
export function accountedNanodollars(usd: number): number {
	if (!Number.isFinite(usd) || usd < 0 || usd > 100000)
		throw new Error("invalid reported inference cost");
	return Math.ceil(usd * 1e9);
}

export function requestReservation(
	guard: RequestPriceGuard,
	outputTokens: number,
): number {
	if (
		!validPriceGuard(guard) ||
		!Number.isSafeInteger(outputTokens) ||
		outputTokens < 1 ||
		outputTokens > 32768
	)
		throw new Error("invalid request price guard");
	return accountedNanodollars(
		(1.05 *
			(guard.contextTokens * guard.promptUsdPerMillion +
				outputTokens * guard.completionUsdPerMillion)) /
			1e6,
	);
}

/** BYOK provider charges are separate from OpenRouter credit charges. */
export function reportedRequestCost(
	usage:
		| {
				cost?: number | null;
				isByok?: boolean;
				costDetails?: {
					upstreamInferenceCost?: number | null;
					upstreamInferenceInputCost?: number;
					upstreamInferenceOutputCost?: number;
				};
		  }
		| null
		| undefined,
): number | undefined {
	const finiteCost = (n: unknown): n is number =>
		typeof n === "number" && Number.isFinite(n) && n >= 0;
	if (!finiteCost(usage?.cost)) return undefined;
	const details = usage.costDetails;
	const upstream =
		details?.upstreamInferenceCost ??
		(finiteCost(details?.upstreamInferenceInputCost) &&
		finiteCost(details?.upstreamInferenceOutputCost)
			? details.upstreamInferenceInputCost + details.upstreamInferenceOutputCost
			: undefined);
	if (
		usage.isByok ||
		(usage.cost === 0 && finiteCost(upstream) && upstream > 0)
	)
		return finiteCost(upstream) ? usage.cost + upstream : undefined;
	return usage.cost;
}

/** Catalog metadata must support the declared ceiling before the API key is used for generation. */
export function catalogFitsGuard(
	value: unknown,
	model: string,
	guard: RequestPriceGuard,
	outputTokens: number,
): boolean {
	if (
		!validPriceGuard(guard) ||
		typeof value !== "object" ||
		value === null ||
		!("data" in value) ||
		!Array.isArray(value.data)
	)
		return false;
	const entry = value.data.find(
		(v: unknown) =>
			typeof v === "object" && v !== null && "id" in v && v.id === model,
	);
	if (
		!entry ||
		!Number.isSafeInteger(entry.context_length) ||
		entry.context_length < 1 ||
		entry.context_length > guard.contextTokens ||
		typeof entry.pricing !== "object" ||
		entry.pricing === null
	)
		return false;
	const maximumOutput = entry.top_provider?.max_completion_tokens;
	if (!Number.isSafeInteger(maximumOutput) || maximumOutput < outputTokens)
		return false;
	const price = (name: string, limit: number, optional = false) => {
		const raw = entry.pricing[name];
		if (raw === undefined && optional) return true;
		return (
			typeof raw === "string" &&
			/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw) &&
			Number.isFinite(Number(raw)) &&
			Number(raw) >= 0 &&
			Number(raw) <= limit
		);
	};
	return (
		price("prompt", guard.promptUsdPerMillion / 1e6) &&
		price("completion", guard.completionUsdPerMillion / 1e6) &&
		price("request", 0, true) &&
		price("input_cache_read", guard.promptUsdPerMillion / 1e6, true) &&
		price("input_cache_write", guard.promptUsdPerMillion / 1e6, true) &&
		price("internal_reasoning", guard.completionUsdPerMillion / 1e6, true)
	);
}

export async function boundedMetadata(response: Response): Promise<unknown> {
	if (!response.ok || !response.body)
		throw new Error("model metadata unavailable");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.length;
		if (bytes > 8 * 1024 * 1024) {
			await reader.cancel();
			throw new Error("model metadata exceeds 8 MiB");
		}
		chunks.push(value);
	}
	const body = new Uint8Array(bytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.length;
	}
	return JSON.parse(
		new TextDecoder("utf-8", { fatal: true }).decode(body),
	) as unknown;
}
