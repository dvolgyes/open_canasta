import { beforeEach, expect, it, vi } from "vitest";
import { REFERENCE_PRIOR } from "../../src/bot/canasta-prior";
import { parseStudyConfig } from "../../src/bot/research/config";

const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@openrouter/agent", () => ({
	OpenRouter: class {},
	callModel: mock.call,
}));

import {
	type RequestRecord,
	researchChooser,
} from "../../src/bot/research/openrouter";
import {
	boundedMetadata,
	catalogFitsGuard,
	requestReservation,
	validPriceGuard,
} from "../../src/bot/research/price-guard";

const guard = {
	provider: "inception",
	contextTokens: 1000000,
	promptUsdPerMillion: 0.1,
	completionUsdPerMillion: 0.35,
};
const settings = {
	model: "test/model",
	maxRequests: 10000,
	maxCostUsd: 1,
	maxOutputTokens: 4096,
	pairs: 1,
	priceGuard: guard,
};
const entry = {
	id: settings.model,
	context_length: 1000000,
	top_provider: { max_completion_tokens: 131072 },
	pricing: {
		prompt: "0.0000001",
		completion: "0.00000035",
		request: "0",
		input_cache_read: "0.00000001",
	},
};
const metadata = { data: [entry] };
const fetcher = vi.fn(
	async (input: RequestInfo | URL) =>
		new Response(
			JSON.stringify(
				String(input).endsWith("/key")
					? {
							data: {
								limit: 1,
								limit_remaining: 1,
								limit_reset: null,
								include_byok_in_limit: true,
								is_management_key: false,
							},
						}
					: metadata,
			),
		),
);

function journal() {
	const records = new Map<string, RequestRecord>();
	return {
		records,
		write: (record: RequestRecord) => {
			records.set(record.id, record);
		},
	};
}
function answer(cost: number | null = 0.0001) {
	return {
		getResponse: async () => ({
			id: "response",
			model: settings.model,
			usage: { cost, inputTokens: 100, outputTokens: 20 },
			output: [
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: '{"choice":0}' }],
				},
			],
		}),
	};
}
beforeEach(() => {
	mock.call.mockReset();
	fetcher.mockClear();
});

it("accepts explicit guarded evaluation and rejects malformed limits before execution", () => {
	const config = {
		version: 1,
		mode: "evaluate",
		parallel: false,
		maxWallMs: 10000,
		seed: 1,
		pairs: 1,
		alpha: 0.05,
		split: "test",
		budget: {
			kind: "iterations",
			iterations: 8,
			depth: 12,
			emergencyTimeMs: 60000,
		},
		maxHands: 100,
		maxActionsPerHand: 2000,
		candidate: REFERENCE_PRIOR,
		opponent: { kind: "llm" },
		llm: settings,
	};
	expect(parseStudyConfig(config).ok).toBe(true);
	for (const priceGuard of [
		{},
		{ ...guard, contextTokens: NaN },
		{ ...guard, typo: 1 },
	])
		expect(
			parseStudyConfig({ ...config, llm: { ...settings, priceGuard } }).ok,
		).toBe(false);
});

it("reserves the full context ceiling, including a 5% fee margin", () => {
	expect(requestReservation(guard, 4096)).toBeGreaterThanOrEqual(106505280);
	expect(requestReservation(guard, 4096)).toBeLessThanOrEqual(106505281);
	expect(catalogFitsGuard(metadata, settings.model, guard, 4096)).toBe(true);
	for (const bad of [
		null,
		{},
		{ ...guard, extra: 1 },
		{ ...guard, contextTokens: NaN },
		{ ...guard, promptUsdPerMillion: -1 },
		{ ...guard, provider: "bad/provider" },
	])
		expect(validPriceGuard(bad)).toBe(false);
});

it("rejects incompatible metadata before generation", async () => {
	for (const bad of [
		{ ...entry, context_length: 2000000 },
		{ ...entry, pricing: { ...entry.pricing, prompt: "0.1" } },
		{ ...entry, pricing: { ...entry.pricing, request: "0.001" } },
		{ ...entry, pricing: { ...entry.pricing, input_cache_write: "0.1" } },
		{ ...entry, top_provider: { max_completion_tokens: 100 } },
	])
		await expect(
			researchChooser(
				"secret",
				settings,
				journal(),
				async () => new Response(JSON.stringify({ data: [bad] })),
			),
		).rejects.toThrow(/metadata/);
	expect(mock.call).not.toHaveBeenCalled();
});

it("refuses a request when spent plus its reservation exceeds the aggregate cap", async () => {
	const log = journal();
	log.write({
		id: "earlier",
		promptSha256: "a".repeat(64),
		status: "success",
		choice: 0,
		costUsd: 0.9,
	});
	const factory = await researchChooser("secret", settings, log, fetcher);
	await expect(factory("leg").choose("position", ["draw"])).rejects.toThrow(
		/spending budget/,
	);
	expect(mock.call).not.toHaveBeenCalled();
});

it("pins price, provider and output caps, records a reservation, and replays without spending", async () => {
	const log = journal();
	mock.call.mockImplementation(() => {
		expect(log.records.get("leg-0")).toMatchObject({
			status: "reserved",
			reservedNanodollars: requestReservation(guard, 4096),
		});
		return answer();
	});
	const factory = await researchChooser("secret", settings, log, fetcher);
	expect(await factory("leg").choose("position", ["draw"])).toBe(0);
	expect(await factory("leg").choose("position", ["draw"])).toBe(0);
	expect(mock.call).toHaveBeenCalledTimes(1);
	expect(mock.call.mock.calls[0]?.[1]).toMatchObject({
		model: settings.model,
		maxOutputTokens: 4096,
		plugins: [],
		provider: {
			only: ["inception"],
			order: ["inception"],
			allowFallbacks: false,
			requireParameters: true,
			maxPrice: { prompt: "0.1", completion: "0.35", request: "0" },
		},
	});
	expect(fetcher.mock.calls[0]?.[0]).toBe(
		"https://openrouter.ai/api/v1/models",
	);
	expect(JSON.stringify([...log.records.values()])).not.toContain("secret");
});

it("blocks concurrent dispatch, unknown charges, and automatic retry after failure", async () => {
	const log = journal();
	let finish: ((value: unknown) => void) | undefined;
	mock.call.mockReturnValue({
		getResponse: () =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	});
	const factory = await researchChooser("secret", settings, log, fetcher);
	const pending = factory("first").choose("position", ["draw"]);
	await expect(factory("second").choose("position", ["draw"])).rejects.toThrow(
		/unresolved/,
	);
	finish?.(await answer(null).getResponse());
	await expect(pending).rejects.toThrow(/request failed/);
	await expect(factory("first").choose("position", ["draw"])).rejects.toThrow(
		/automatic paid replay/,
	);
	expect(mock.call).toHaveBeenCalledTimes(1);
});

it("rejects invalid aggregate budgets before any network request", async () => {
	for (const maxCostUsd of [NaN, Infinity, 0, -1])
		await expect(
			researchChooser(
				"secret",
				{ ...settings, maxCostUsd },
				journal(),
				fetcher,
			),
		).rejects.toThrow(/spending limits/);
	expect(fetcher).not.toHaveBeenCalled();
});

it("accounts for upstream BYOK charges and refuses missing upstream accounting", async () => {
	for (const upstream of [0.01, undefined]) {
		const base = await answer(0).getResponse();
		mock.call.mockReturnValue({
			getResponse: async () => ({
				...base,
				usage: {
					...base.usage,
					isByok: true,
					...(upstream === undefined
						? {}
						: { costDetails: { upstreamInferenceCost: upstream } }),
				},
			}),
		});
		const log = journal(),
			factory = await researchChooser("secret", settings, log, fetcher);
		const request = factory("leg").choose("position", ["draw"]);
		if (upstream === undefined)
			await expect(request).rejects.toThrow(/request failed/);
		else {
			expect(await request).toBe(0);
			expect(log.records.get("leg-0")?.costUsd).toBe(0.01);
		}
	}
});

it("retains ceiling violations and blocks later requests", async () => {
	for (const change of [
		{ model: "different/model" },
		{ usage: { cost: 0.5, inputTokens: 100, outputTokens: 20 } },
		{ usage: { cost: 0.0001, inputTokens: -1, outputTokens: 20 } },
		{ usage: { cost: 0.0001, inputTokens: 1000001, outputTokens: 20 } },
		{ usage: { cost: 0.0001, inputTokens: 100, outputTokens: 4097 } },
	]) {
		mock.call.mockClear();
		mock.call.mockReturnValue({
			getResponse: async () => ({
				...(await answer().getResponse()),
				...change,
			}),
		});
		const log = journal(),
			factory = await researchChooser("secret", settings, log, fetcher);
		await expect(factory("leg").choose("position", ["draw"])).rejects.toThrow(
			/request failed/,
		);
		expect(log.records.get("leg-0")?.status).toBe("failure");
		await expect(factory("next").choose("position", ["draw"])).rejects.toThrow(
			/unresolved/,
		);
		expect(mock.call).toHaveBeenCalledTimes(1);
	}
});

it("bounds metadata size and rejects invalid UTF-8 and failed responses", async () => {
	for (const response of [
		new Response("x".repeat(8 * 1024 * 1024 + 1)),
		new Response(new Uint8Array([255])),
		new Response("", { status: 500 }),
	])
		await expect(boundedMetadata(response)).rejects.toThrow();
});
