/** Shared cancellation signal for local search, pacing, and legacy clients. */
export class BotRequestAbortedError extends Error {
	constructor() {
		super("bot request aborted");
		this.name = "AbortError";
	}
}
