import { afterEach, expect, it, vi } from "vitest";
import { readOpenRouterBalance } from "../../src/bot/openrouter-balance";

afterEach(() => vi.unstubAllGlobals());

it("reports the lesser of account credit and the key's remaining limit", async () => {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			calls.push(url);
			expect(new Headers(init.headers).get("Authorization")).toBe("Bearer key");
			return new Response(
				JSON.stringify(
					url.endsWith("/key")
						? { data: { limit: 10, limit_remaining: 2 } }
						: { data: { total_credits: 20, total_usage: 15 } },
				),
				{ status: 200 },
			);
		}),
	);
	expect(await readOpenRouterBalance("key")).toEqual({
		balanceUsd: 2,
		limitUsd: 2,
	});
	expect(calls.sort()).toEqual([
		"https://openrouter.ai/api/v1/credits",
		"https://openrouter.ai/api/v1/key",
	]);
});

it("reports an unknown balance when credit access is refused and no key limit exists", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) =>
			url.endsWith("/key")
				? new Response(
						JSON.stringify({ data: { limit: null, limit_remaining: null } }),
						{ status: 200 },
					)
				: new Response("", { status: 403 }),
		),
	);
	expect(await readOpenRouterBalance("key")).toEqual({});
});

it("keeps the key limit distinct when account credit is unavailable", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) =>
			url.endsWith("/key")
				? new Response(
						JSON.stringify({ data: { limit: 10, limit_remaining: 3 } }),
						{ status: 200 },
					)
				: new Response("", { status: 403 }),
		),
	);
	expect(await readOpenRouterBalance("key")).toEqual({ limitUsd: 3 });
});

it("ignores malformed and oversized account credit data", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) =>
			url.endsWith("/key")
				? new Response(
						JSON.stringify({ data: { limit: null, limit_remaining: null } }),
						{ status: 200 },
					)
				: new Response(
						JSON.stringify({
							data: {
								total_credits: 10,
								total_usage: 1,
								extra: "x".repeat(40_000),
							},
						}),
						{ status: 200 },
					),
		),
	);
	expect(await readOpenRouterBalance("key")).toEqual({});
});

it("does not show an old or invalid credit value when the key check fails", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) =>
			url.endsWith("/key")
				? new Response("", { status: 401 })
				: new Response(
						JSON.stringify({ data: { total_credits: 10, total_usage: 1 } }),
						{ status: 200 },
					),
		),
	);
	expect(await readOpenRouterBalance("bad-key")).toEqual({});
});
