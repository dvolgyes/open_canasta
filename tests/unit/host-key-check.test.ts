import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHostApiKey } from "../../src/bot/browser-openrouter";
import { DECISIONS_ENDPOINT } from "../../src/bot/decision-model";
import { DECISION_BOT_MODELS } from "../../src/protocol";

afterEach(() => {
	vi.unstubAllGlobals();
});

function responseWithText(text: string): Response {
	return new Response(
		JSON.stringify({
			output: [
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text }],
				},
			],
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

/** Answers every request with `answer` and records the URL, the authorization header and the body. */
function stubFetch(answer: () => Response | Promise<Response>) {
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	const requests: { url: string; authorization: string; body: unknown }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({
				url: String(input),
				authorization: new Headers(init?.headers).get("Authorization") ?? "",
				body: JSON.parse(String(init?.body)),
			});
			return answer();
		}),
	);
	return requests;
}

describe("OpenRouter key check", () => {
	it("accepts a key when the model returns a valid choice", async () => {
		const requests = stubFetch(() => responseWithText('{"choice": 0}'));

		expect(await checkHostApiKey(" new-key ", "inception/mercury-3")).toEqual({
			kind: "accepted",
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/responses");
		expect(requests[0]?.authorization).toBe("Bearer new-key");
		expect(requests[0]?.body).toMatchObject({ model: "inception/mercury-3" });
	});

	it("rejects a key that OpenRouter answers with 401, after one request", async () => {
		const requests = stubFetch(() => new Response("", { status: 401 }));

		expect(await checkHostApiKey("wrong-key", "inception/mercury-3")).toEqual({
			kind: "rejected",
		});
		expect(requests).toHaveLength(1);
	});

	it.each([
		[402, "HTTP 402"],
		[429, "HTTP 429"],
		[503, "HTTP 503"],
	])(
		"leaves the key unverified after HTTP %i, with no retry or fallback model",
		async (status, problem) => {
			const requests = stubFetch(() => new Response("", { status }));

			expect(await checkHostApiKey("new-key", "inception/mercury-3")).toEqual({
				kind: "unverified",
				problem,
			});
			expect(requests).toHaveLength(1);
		},
	);

	it("leaves the key unverified when OpenRouter cannot be reached", async () => {
		stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

		expect(await checkHostApiKey("new-key", "inception/mercury-3")).toEqual({
			kind: "unverified",
			problem: "no connection",
		});
	});

	it("leaves the key unverified when the answer is not a valid choice", async () => {
		stubFetch(() => responseWithText("Hello!"));

		expect(await checkHostApiKey("new-key", "inception/mercury-3")).toEqual({
			kind: "unverified",
			problem: "no usable answer",
		});
	});

	it("asks a Decisions model at the Decisions endpoint", async () => {
		const model = DECISION_BOT_MODELS[0];
		const requests = stubFetch(
			() =>
				new Response(
					JSON.stringify({
						answers: { canasta_choice: { type: "choice", choice: "0" } },
					}),
					{ status: 200 },
				),
		);

		expect(await checkHostApiKey("new-key", model)).toEqual({
			kind: "accepted",
		});
		expect(requests[0]?.url).toBe(DECISIONS_ENDPOINT);
	});
});
