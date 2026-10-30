import { dataChannelRefused } from "./webrtc-errors";

/** Probe each configured STUN server without retaining its returned address. */
export type StunAnswer = "answered" | "no-answer";
export type ProbeStun = (url: string) => Promise<StunAnswer>;
export interface StunStatus {
	readonly url: string;
	readonly state: "checking" | StunAnswer;
}

export function stunProbe(
	Rtc: typeof RTCPeerConnection,
	timeoutMs = 5_000,
): ProbeStun {
	return (url) =>
		new Promise((resolve) => {
			let connection: RTCPeerConnection;
			try {
				connection = new Rtc({ iceServers: [{ urls: url }] });
			} catch (error) {
				if (
					error instanceof DOMException &&
					["NotSupportedError", "SecurityError", "NotAllowedError"].includes(
						error.name,
					)
				) {
					resolve("no-answer");
					return;
				}
				throw error;
			}
			let done = false;
			const finish = (answer: StunAnswer) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				connection.onicecandidate = null;
				connection.close();
				resolve(answer);
			};
			const timer = setTimeout(() => finish("no-answer"), timeoutMs);
			connection.onicecandidate = ({ candidate }) => {
				if (candidate === null) finish("no-answer");
				else if (/ typ srflx(?: |$)/.test(candidate.candidate))
					finish("answered");
			};
			try {
				connection.createDataChannel("stun");
			} catch (error) {
				if (dataChannelRefused(error)) {
					finish("no-answer");
					return;
				}
				clearTimeout(timer);
				connection.close();
				throw error;
			}
			void connection
				.createOffer()
				.then((offer) => connection.setLocalDescription(offer))
				.catch(() => finish("no-answer"));
		});
}

/** The last answer remains visible while a retry is pending. */
export class StunChecks {
	readonly #probe: ProbeStun;
	readonly #states: Map<string, StunStatus["state"]>;
	readonly #pending = new Set<string>();
	readonly #change: () => void;
	#askedAt = Number.NEGATIVE_INFINITY;
	#closed = false;

	constructor(urls: readonly string[], probe: ProbeStun, change: () => void) {
		this.#probe = probe;
		this.#states = new Map(urls.map((url) => [url, "checking"]));
		this.#change = change;
	}

	statuses(): StunStatus[] {
		return [...this.#states].map(([url, state]) => ({ url, state }));
	}

	tick(now: number, alone: boolean): void {
		if (this.#closed) return;
		const first = this.#askedAt === Number.NEGATIVE_INFINITY;
		if (!first && (!alone || now - this.#askedAt < 60_000)) return;
		this.#askedAt = now;
		for (const url of this.#states.keys()) {
			if (this.#pending.has(url)) continue;
			this.#pending.add(url);
			void this.#probe(url).then((answer) => {
				this.#pending.delete(url);
				if (this.#closed || this.#states.get(url) === answer) return;
				this.#states.set(url, answer);
				this.#change();
			});
		}
	}

	close(): void {
		this.#closed = true;
	}
}
