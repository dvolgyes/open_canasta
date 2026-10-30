import { callModel } from "@openrouter/agent";
import { afterEach, expect, it, vi } from "vitest";
import { cliChooser } from "../../src/bot/cli-chooser";
import { DEFAULT_BOT_SETUP } from "../../src/protocol";

vi.mock("@openrouter/agent", () => ({
	OpenRouter: class {},
	callModel: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

function answer(text: string) {
	vi.mocked(callModel).mockReturnValue({
		getResponse: async () => ({
			output: [
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text }],
				},
			],
		}),
	} as unknown as ReturnType<typeof callModel>);
}

it("keeps MCTS as the default even when a key and old model settings exist", () => {
	expect(
		cliChooser({}, DEFAULT_BOT_SETUP, "test-key", vi.fn()),
	).toBeUndefined();
	expect(callModel).not.toHaveBeenCalled();
});

it("requires explicit LLM selection and credentials", () => {
	expect(() =>
		cliChooser({ llm: true }, undefined, undefined, vi.fn()),
	).toThrow(/OPENROUTER_API_KEY/);
	expect(() =>
		cliChooser({ model: "test/model" }, undefined, "test-key", vi.fn()),
	).toThrow(/--model requires --llm/);
	expect(() =>
		cliChooser({ llm: true, random: true }, undefined, "test-key", vi.fn()),
	).toThrow(/--llm and --random/);
});

it("uses the retained LLM strategy and reports a validated response", async () => {
	answer('{"choice":1}');
	const report = vi.fn();
	const chooser = cliChooser(
		{ llm: true, model: "test/model" },
		DEFAULT_BOT_SETUP,
		"test-key",
		report,
	);
	expect(await chooser?.choose("public position", ["draw", "take pile"])).toBe(
		1,
	);
	expect(callModel).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ model: "test/model" }),
		expect.anything(),
	);
	expect(report).toHaveBeenCalledWith("LLM decision received.");
});

it("pins an explicit model and does not report invalid output as a successful decision", async () => {
	vi.mocked(callModel).mockImplementation(() => {
		throw Object.assign(new Error("unavailable"), { statusCode: 503 });
	});
	const report = vi.fn();
	const setup = { ...DEFAULT_BOT_SETUP, retries: 1, retryDelayMs: 0 };
	const chooser = cliChooser(
		{ llm: true, model: "test/model" },
		setup,
		"test-key",
		report,
	);
	await expect(chooser?.choose("position", ["draw"])).rejects.toThrow(
		/unavailable/,
	);
	expect(vi.mocked(callModel).mock.calls.map((call) => call[1].model)).toEqual([
		"test/model",
		"test/model",
	]);
	expect(report).not.toHaveBeenCalled();
	answer('{"choice":20}');
	await expect(chooser?.choose("position", ["draw"])).rejects.toThrow(
		/not offered/,
	);
	expect(report).not.toHaveBeenCalled();
});

it("retains random mode without an API key", async () => {
	const chooser = cliChooser({ random: true }, undefined, undefined, vi.fn());
	expect(await chooser?.choose("position", ["draw"])).toBe(0);
	expect(callModel).not.toHaveBeenCalled();
});
