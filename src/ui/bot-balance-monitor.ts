import type { OpenRouterBalance } from "../bot/openrouter-balance";

/** Keeps asynchronous balance results with the key and host that requested them. */
export class BotBalanceMonitor {
	readonly #read: (
		key: string,
		signal: AbortSignal,
	) => Promise<OpenRouterBalance>;
	readonly #show: (balance: OpenRouterBalance | undefined) => void;
	#key = "";
	#enabled = false;
	#hand: string | undefined;
	#request: AbortController | undefined;
	#sequence = 0;

	constructor(
		read: (key: string, signal: AbortSignal) => Promise<OpenRouterBalance>,
		show: (balance: OpenRouterBalance | undefined) => void,
	) {
		this.#read = read;
		this.#show = show;
	}

	update(key: string, hand: string | undefined, enabled: boolean): void {
		if (key !== this.#key || enabled !== this.#enabled) {
			this.#request?.abort();
			this.#sequence++;
			this.#key = key;
			this.#enabled = enabled;
			this.#hand = undefined;
			this.#show(undefined);
		}
		if (!enabled || !key || !hand || hand === this.#hand) return;
		this.#hand = hand;
		this.#request?.abort();
		const request = new AbortController();
		this.#request = request;
		const sequence = ++this.#sequence;
		void this.#read(key, request.signal).then((balance) => {
			if (sequence !== this.#sequence || request.signal.aborted) return;
			if (balance.balanceUsd !== undefined || balance.limitUsd !== undefined)
				this.#show(balance);
		});
	}

	stop(): void {
		this.update("", undefined, false);
	}
}
