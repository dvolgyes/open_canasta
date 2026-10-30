import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@openrouter/agent", () => ({
	OpenRouter: class {},
	callModel: mock.call,
}));

import {
	fundedResearchKey,
	type RequestRecord,
	type ResearchLlmSettings,
	researchChooser,
} from "../../src/bot/research/openrouter";

const settings: ResearchLlmSettings = {
	model: "test/pinned-model",
	maxRequests: 2,
	maxCostUsd: 5,
	maxOutputTokens: 512,
	pairs: 1,
};
const keyInfo = {
	data: {
		limit: 5,
		limit_reset: null,
		include_byok_in_limit: true,
		is_management_key: false,
		limit_remaining: 5,
	},
};
const fetcher = vi.fn(async () => new Response(JSON.stringify(keyInfo)));
beforeEach(() => {
	mock.call.mockReset();
	fetcher.mockClear();
});
function journal() {
	const records = new Map<string, RequestRecord>();
	return {
		records,
		write: (record: RequestRecord) => {
			records.set(record.id, record);
		},
	};
}
function answer(text = '{"choice":0}', cost: number | null = 0.01) {
	return {
		getResponse: async () => ({
			id: "response-1",
			model: "test/pinned-model",
			output: [
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text }],
				},
			],
			usage: { cost, inputTokens: 10, outputTokens: 5 },
		}),
	};
}

it("rejects malformed secrets before constructing a request", async () => {
	for (const key of ["", "part\nsecret", "part\u0000secret", "x".repeat(513)]) {
		await expect(
			researchChooser(key, settings, journal(), fetcher),
		).rejects.toThrow(/OPENROUTER_RESEARCH_API_KEY/);
	}
	expect(fetcher).not.toHaveBeenCalled();
});

it("rejects unfunded, resetting and non-spending keys before generation", async () => {
	expect(fundedResearchKey(keyInfo, 5)).toBe(true);
	for (const data of [
		{ ...keyInfo.data, limit: null },
		{ ...keyInfo.data, limit: 6 },
		{ ...keyInfo.data, limit_reset: "daily" },
		{ ...keyInfo.data, include_byok_in_limit: false },
		{ ...keyInfo.data, is_management_key: true },
	]) {
		expect(fundedResearchKey({ data }, 5)).toBe(false);
		await expect(
			researchChooser(
				"secret",
				settings,
				journal(),
				async () => new Response(JSON.stringify({ data })),
			),
		).rejects.toThrow(/limit/);
	}
	expect(mock.call).not.toHaveBeenCalled();
});

it("pins requests, stores usage, replays without charging again and enforces a campaign request cap", async () => {
	mock.call.mockReturnValue(answer());
	const log = journal(),
		factory = await researchChooser("secret", settings, log, fetcher);
	const chooser = factory("leg-0");
	expect(await chooser.choose("position", ["draw"])).toBe(0);
	expect(await factory("leg-0").choose("position", ["draw"])).toBe(0);
	expect(mock.call).toHaveBeenCalledTimes(1);
	expect(mock.call.mock.calls[0]?.[1]).toMatchObject({
		model: settings.model,
		maxOutputTokens: 512,
		store: false,
	});
	expect(mock.call.mock.calls[0]?.[2]).toMatchObject({
		retries: { strategy: "none" },
	});
	expect(log.records.get("leg-0-0")).toMatchObject({
		status: "success",
		costUsd: 0.01,
		inputTokens: 10,
		outputTokens: 5,
	});
	await chooser.choose("next position", ["draw"]);
	await expect(chooser.choose("third", ["draw"])).rejects.toThrow(/budget/);
	expect(mock.call).toHaveBeenCalledTimes(2);
	expect(JSON.stringify([...log.records.values()])).not.toContain("secret");
});

it("retains failures and unknown costs, refusing automatic paid retries and prompt mismatches", async () => {
	for (const response of [
		answer('{"choice":9}'),
		answer('{"choice":0}', null),
	]) {
		mock.call.mockReturnValue(response);
		const log = journal(),
			factory = await researchChooser("secret", settings, log, fetcher);
		const choose = factory("leg");
		await choose.choose("position", ["draw"]).catch(() => undefined);
		await expect(choose.choose("next", ["draw"])).rejects.toThrow(/unresolved/);
		await expect(factory("leg").choose("changed", ["draw"])).rejects.toThrow(
			/mismatch/,
		);
	}
});
