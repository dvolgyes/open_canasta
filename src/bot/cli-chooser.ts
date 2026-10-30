import { type BotSetup, botModelOrder, DEFAULT_BOT_SETUP } from "../protocol";
import { OpenRouterStrategy } from "./node-openrouter";
import type { TurnChooser } from "./turn";

/** Explicit CLI backend selection; undefined selects the runner's local MCTS engine. */
export function cliChooser(
	options: {
		readonly llm?: boolean;
		readonly random?: boolean;
		readonly model?: string;
	},
	setup: BotSetup | undefined,
	apiKey: string | undefined,
	report: (message: string) => void,
): TurnChooser | undefined {
	if (options.llm && options.random)
		throw new Error("--llm and --random cannot be combined");
	if (options.model !== undefined && !options.llm)
		throw new Error("--model requires --llm");
	if (options.random)
		return {
			choose: async (_prompt, labels) =>
				Math.floor(Math.random() * labels.length),
		};
	if (!options.llm) return undefined;
	if (!apiKey?.trim())
		throw new Error("OPENROUTER_API_KEY is required for --llm");
	const settings = setup ?? DEFAULT_BOT_SETUP;
	// An explicitly named model stays pinned, so a comparison cannot silently switch models.
	const models =
		options.model === undefined ? botModelOrder(settings) : [options.model];
	const strategy = new OpenRouterStrategy(apiKey, {
		model: models[0],
		modelOrder: models,
		fallbackModel: settings.fallbackModel,
		retries: settings.retries,
		retryDelayMs: settings.retryDelayMs,
	});
	return {
		choose: async (prompt, labels, state) => {
			const choice = await strategy.choose(prompt, labels, state);
			report("LLM decision received.");
			return choice;
		},
	};
}
