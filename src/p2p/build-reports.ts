import { MAX_PEERS } from "./limits";

const BUILD_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

export function isBuildDate(value: unknown): value is string {
	return (
		typeof value === "string" &&
		BUILD_DATE.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

export function isBuildCommit(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{4,40}$/.test(value);
}

export interface PeerBuild {
	readonly date: string;
	readonly commit?: string;
}

/** Peer build dates are untrusted reports, not proof of an update. */
export class BuildReports {
	readonly #local: string;
	readonly #dates = new Map<string, PeerBuild>();

	constructor(local: string) {
		this.#local = local;
	}

	record(peer: string, date: unknown, commit?: unknown): boolean {
		if (
			!isBuildDate(date) ||
			(commit !== undefined && !isBuildCommit(commit)) ||
			(!this.#dates.has(peer) && this.#dates.size >= MAX_PEERS)
		)
			return false;
		this.#dates.set(peer, {
			date,
			...(typeof commit === "string" ? { commit } : {}),
		});
		return true;
	}

	forget(peer: string): void {
		this.#dates.delete(peer);
	}

	get(peer: string): PeerBuild | undefined {
		return this.#dates.get(peer);
	}

	newer(): string | undefined {
		if (!isBuildDate(this.#local)) return undefined;
		let latest = Date.parse(this.#local);
		let result: string | undefined;
		for (const { date } of this.#dates.values()) {
			const time = Date.parse(date);
			if (time > latest) {
				latest = time;
				result = date;
			}
		}
		return result;
	}
}
