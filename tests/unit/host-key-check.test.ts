import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHostApiKey } from "../../src/bot/browser-openrouter";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(answer: () => Response | Promise<Response>) {
	const fetcher = vi.fn(answer);
	vi.stubGlobal("fetch", fetcher);
	return fetcher;
}

describe("OpenRouter key check", () => {
	it("accepts a key when OpenRouter returns key metadata", async () => {
		const requests = stubFetch(
			() =>
				new Response(JSON.stringify({ data: { limit_remaining: null } }), {
					status: 200,
				}),
		);
		expect(await checkHostApiKey("new-key")).toEqual({ kind: "accepted" });
		expect(requests).toHaveBeenCalledOnce();
	});

	it("rejects a key that OpenRouter answers with 401", async () => {
		const requests = stubFetch(() => new Response("", { status: 401 }));
		expect(await checkHostApiKey("wrong-key")).toEqual({ kind: "rejected" });
		expect(requests).toHaveBeenCalledOnce();
	});

	it.each([
		[402, "HTTP 402"],
		[429, "HTTP 429"],
		[503, "HTTP 503"],
	])(
		"leaves the key unverified after HTTP %i without retry",
		async (status, problem) => {
			const requests = stubFetch(() => new Response("", { status }));
			expect(await checkHostApiKey("new-key")).toEqual({
				kind: "unverified",
				problem,
			});
			expect(requests).toHaveBeenCalledOnce();
		},
	);

	it("leaves the key unverified when OpenRouter cannot be reached", async () => {
		stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
		expect(await checkHostApiKey("new-key")).toEqual({
			kind: "unverified",
			problem: "no connection",
		});
	});

	it("leaves the key unverified when the response is malformed", async () => {
		stubFetch(
			() => new Response(JSON.stringify({ data: null }), { status: 200 }),
		);
		expect(await checkHostApiKey("new-key")).toEqual({
			kind: "unverified",
			problem: "no usable answer",
		});
	});

	it("refuses an oversized metadata response", async () => {
		stubFetch(
			() =>
				new Response(JSON.stringify({ data: { label: "x".repeat(40_000) } }), {
					status: 200,
				}),
		);
		expect(await checkHostApiKey("new-key")).toEqual({
			kind: "unverified",
			problem: "no usable answer",
		});
	});

	it("reports a timeout without exposing the key or the exception", async () => {
		stubFetch(() => Promise.reject(new DOMException("secret", "TimeoutError")));
		expect(await checkHostApiKey("new-key")).toEqual({
			kind: "unverified",
			problem: "no answer in time",
		});
	});
});
