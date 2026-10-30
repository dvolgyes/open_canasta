import { MAX_PEERS } from "./limits";

const BUILD_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

export function isBuildDate(value: unknown): value is string {
	return (
		typeof value === "string" &&
		BUILD_DATE.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

/** Peer build dates are untrusted reports, not proof of an update. */
export class BuildReports {
	readonly #local: string;
	readonly #dates = new Map<string, string>();

	constructor(local: string) {
		this.#local = local;
	}

	record(peer: string, date: unknown): boolean {
		if (
			!isBuildDate(date) ||
			(!this.#dates.has(peer) && this.#dates.size >= MAX_PEERS)
		)
			return false;
		this.#dates.set(peer, date);
		return true;
	}

	forget(peer: string): void {
		this.#dates.delete(peer);
	}

	newer(): string | undefined {
		if (!isBuildDate(this.#local)) return undefined;
		let latest = Date.parse(this.#local);
		let result: string | undefined;
		for (const date of this.#dates.values()) {
			const time = Date.parse(date);
			if (time > latest) {
				latest = time;
				result = date;
			}
		}
		return result;
	}
}
