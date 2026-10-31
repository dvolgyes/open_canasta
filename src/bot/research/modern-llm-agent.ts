import type { ModernResearchAgent } from "./modern-arena";
import { modernLlmPrompt } from "./modern-llm-prompt";

export type ModernChoiceResponse =
	| { readonly ok: true; readonly choice: unknown }
	| { readonly ok: false };

/** A trusted caller supplies the chooser; its choice remains untrusted data. */
export interface ModernChoiceProvider {
	choose(request: {
		readonly prompt: string;
		readonly labels: readonly string[];
		readonly signal: AbortSignal;
	}): Promise<ModernChoiceResponse>;
}

export interface ModernLlmResearchOptions {
	readonly promptTimeMs: number;
	readonly responseTimeMs: number;
}

/** An offline integration seam; this module owns no API client or spending authority. */
export function modernLlmResearchAgent(
	provider: ModernChoiceProvider,
	options: ModernLlmResearchOptions,
): ModernResearchAgent {
	if (
		provider === null ||
		(typeof provider !== "object" && typeof provider !== "function") ||
		typeof provider.choose !== "function"
	)
		throw new Error("invalid model choice provider");
	if (
		typeof options !== "object" ||
		options === null ||
		!Number.isFinite(options.promptTimeMs) ||
		options.promptTimeMs < 0 ||
		options.promptTimeMs > 60000 ||
		!Number.isSafeInteger(options.responseTimeMs) ||
		options.responseTimeMs < 1 ||
		options.responseTimeMs > 60000
	)
		throw new Error("invalid model choice limits");
	return {
		async decide(observation, context) {
			const prepared = modernLlmPrompt(observation, {
				rng: context.rng,
				timeMs: options.promptTimeMs,
				signal: context.signal,
			});
			if (!prepared.ok) return prepared;
			const started = performance.now();
			const deadline = new AbortController();
			const timer = setTimeout(() => deadline.abort(), options.responseTimeMs);
			try {
				const signal = context.signal
					? AbortSignal.any([context.signal, deadline.signal])
					: deadline.signal;
				if (
					signal.aborted ||
					performance.now() - started >= options.responseTimeMs
				)
					return { ok: false, reason: "model choice cancelled or timed out" };
				let onAbort: () => void = () => {};
				const cancelled = new Promise<{ readonly kind: "cancelled" }>(
					(resolve) => {
						onAbort = () => resolve({ kind: "cancelled" });
						signal.addEventListener("abort", onAbort, { once: true });
					},
				);
				const pending = Promise.resolve().then(async () => {
					if (signal.aborted) return { kind: "cancelled" as const };
					return {
						kind: "response" as const,
						response: await provider.choose(
							Object.freeze({
								prompt: prepared.request.prompt,
								labels: prepared.request.labels,
								signal,
							}),
						),
					};
				});
				let outcome: Awaited<typeof pending>;
				try {
					outcome = await Promise.race([pending, cancelled]);
				} finally {
					signal.removeEventListener("abort", onAbort);
				}
				if (
					outcome.kind === "cancelled" ||
					signal.aborted ||
					performance.now() - started >= options.responseTimeMs
				)
					return { ok: false, reason: "model choice cancelled or timed out" };
				const response = outcome.response;
				if (
					typeof response !== "object" ||
					response === null ||
					response.ok !== true
				)
					return { ok: false, reason: "model choice failed" };
				const selected = prepared.request.select(response.choice);
				return selected.ok
					? {
							ok: true,
							action: selected.action,
							simulations: 0,
							deadlineStopped: false,
						}
					: selected;
			} finally {
				clearTimeout(timer);
			}
		},
	};
}
