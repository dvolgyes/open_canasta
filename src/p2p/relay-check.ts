/** Outcome of an optional probe of a discovery relay. */
export type RelayCheckAnswer = "answered" | "refused" | "silent" | "not-sent";
export type CheckRelay = (url: string) => Promise<RelayCheckAnswer>;

const CHECK_AFTER_MS = 30_000;

/** Tracks optional probes without treating a refused probe as a failed connection. */
export class RelayChecks {
	readonly #check: CheckRelay;
	readonly #pending = new Map<string, object>();
	readonly #unanswered = new Map<string, number>();
	readonly #refused = new Set<string>();

	constructor(check: CheckRelay) {
		this.#check = check;
	}

	/** True when a silent probe received no later relay traffic and the relay should reconnect. */
	tick(url: string, now: number, silentSince: number, on: boolean): boolean {
		if (!on) {
			this.#pending.delete(url);
			this.#unanswered.delete(url);
			return false;
		}
		const unanswered = this.#unanswered.get(url);
		if (unanswered !== undefined) {
			this.#unanswered.delete(url);
			if (silentSince <= unanswered) return true;
		}
		if (
			now - silentSince < CHECK_AFTER_MS ||
			this.#pending.has(url) ||
			this.#refused.has(url)
		)
			return false;
		const token = {};
		this.#pending.set(url, token);
		void this.#check(url).then((answer) => {
			if (this.#pending.get(url) !== token) return;
			this.#pending.delete(url);
			if (answer === "refused") this.#refused.add(url);
			if (answer === "silent") this.#unanswered.set(url, now);
		});
		return false;
	}
}
