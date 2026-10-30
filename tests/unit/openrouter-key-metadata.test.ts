import { afterEach, expect, it, vi } from "vitest";
import { checkHostApiKey } from "../../src/bot/browser-openrouter";

afterEach(() => vi.unstubAllGlobals());

it("checks a key without sending a paid model request", async () => {
	const fetcher = vi.fn(
		async () =>
			new Response(
				JSON.stringify({ data: { limit: null, limit_remaining: null } }),
				{ status: 200 },
			),
	);
	vi.stubGlobal("fetch", fetcher);
	expect(await checkHostApiKey(" test-key ")).toEqual({ kind: "accepted" });
	expect(fetcher).toHaveBeenCalledOnce();
	const [url, options] = fetcher.mock.calls[0] as unknown as [
		string,
		RequestInit,
	];
	expect(url).toBe("https://openrouter.ai/api/v1/key");
	expect(options.method ?? "GET").toBe("GET");
	expect(new Headers(options.headers).get("Authorization")).toBe(
		"Bearer test-key",
	);
	expect(options.body).toBeUndefined();
});
