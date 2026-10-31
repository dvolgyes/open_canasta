import type { Action } from "../canasta";
import {
	actionPayload,
	engineSeat,
	parseCanastaState,
	resetVotePayload,
} from "../game/canasta";
import { englishTranslator, type Translate } from "../i18n";
import {
	BOT_CONTROL_CHANGED,
	botSeats as configuredBotSeats,
} from "../p2p/bot-seats";
import type { TableController } from "../p2p/table";
import { playerConfig } from "../players";
import type { Seat } from "../protocol";
import { observeCanasta } from "./canasta-search";
import { BotRequestAbortedError } from "./cancellation";
import { matchPositionKey, turnKey } from "./position";
import { botActionDelay, thinkingTime, waitForBotAction } from "./timing";
import { chooseLocalCanasta } from "./worker-search";

export interface HostBotSettings {
	readonly thinkingTimeMs?: number;
	readonly actionDelayMs?: number;
}

export { configuredBotSeats };

/** Runs host-managed bot decisions in the page that currently owns the host. */
export class HostBotRunner {
	readonly #controller: TableController;
	#settings: HostBotSettings;
	readonly #onError: (kind: "failed", detail?: string) => void;
	readonly #onStatus: (message: string) => void;
	readonly #translate: Translate;
	#requestAbort = new AbortController();
	readonly #processed = new Set<string>();
	#position: string | undefined;
	#generation = 0;
	#pending:
		| {
				seat: Seat;
				payload: ReturnType<typeof actionPayload>;
				retryAt: number;
		  }
		| undefined;
	#unsubscribe: (() => void) | undefined;
	#running = false;
	#rerun = false;
	#stopped = false;
	#paused = false;
	readonly #seatOverrides = new Map<Seat, boolean>();

	constructor(
		controller: TableController,
		settings: HostBotSettings,
		onError: (kind: "failed", detail?: string) => void = () => {},
		onStatus: (message: string) => void = () => {},
		translate: Translate = englishTranslator,
	) {
		botActionDelay(settings.actionDelayMs);
		thinkingTime(settings.thinkingTimeMs);
		this.#controller = controller;
		this.#settings = settings;
		this.#onError = onError;
		this.#onStatus = onStatus;
		this.#translate = translate;
	}

	async start(requiredSeats: readonly Seat[] = []): Promise<boolean> {
		const view = this.#controller.view();
		const config = view.table?.config;
		if (!view.hosting || !view.ready || !config) return false;
		for (const seat of requiredSeats) this.#seatOverrides.set(seat, true);
		const seats = this.#activeSeats(
			view.roster?.bots ?? configuredBotSeats(config),
		).filter((seat) => seat !== view.seat && !requiredSeats.includes(seat));
		if (!(await this.#controller.activateBots(seats))) return false;
		this.#unsubscribe = this.#controller.onChange(() => this.#schedule());
		this.#schedule();
		return true;
	}

	stop(): void {
		if (this.#stopped) return;
		this.#stopped = true;
		this.#requestAbort.abort();
		this.#unsubscribe?.();
	}

	pause(): void {
		this.#paused = true;
		this.#requestAbort.abort();
	}

	resume(): void {
		if (this.#stopped || !this.#paused) return;
		this.#paused = false;
		this.#requestAbort = new AbortController();
		this.#schedule();
	}

	updateSettings(settings: HostBotSettings): void {
		thinkingTime(settings.thinkingTimeMs);
		if (
			botActionDelay(settings.actionDelayMs) !==
				botActionDelay(this.#settings.actionDelayMs) ||
			thinkingTime(settings.thinkingTimeMs) !==
				thinkingTime(this.#settings.thinkingTimeMs)
		) {
			this.#requestAbort.abort();
			this.#requestAbort = new AbortController();
		}
		this.#settings = settings;
		this.#schedule();
	}

	setSeatEnabled(seat: Seat, enabled: boolean): void {
		this.#seatOverrides.set(seat, enabled);
		if (!enabled) {
			this.#requestAbort.abort();
			this.#requestAbort = new AbortController();
		}
		this.#schedule();
	}

	#activeSeats(seats: readonly Seat[]): Seat[] {
		const active = new Set(seats);
		for (const [seat, enabled] of this.#seatOverrides) {
			if (enabled) active.add(seat);
			else active.delete(seat);
		}
		return [...active];
	}

	#schedule(): void {
		if (this.#stopped) return;
		const table = this.#controller.view().table;
		const state = table
			? parseCanastaState(table.state, this.#controller.tableId)
			: undefined;
		const position = state
			? `${state.matches}:${matchPositionKey(state.match, state.actions)}:${state.reset?.id ?? ""}`
			: undefined;
		if (position !== this.#position) {
			this.#position = position;
			this.#generation++;
			this.#processed.clear();
			this.#pending = undefined;
			this.#requestAbort.abort();
			this.#requestAbort = new AbortController();
		}
		if (this.#paused) return;
		if (this.#running) {
			this.#rerun = true;
			return;
		}
		void this.#drive();
	}

	async #drive(): Promise<void> {
		this.#running = true;
		try {
			do {
				this.#rerun = false;
				await this.#step();
			} while (this.#rerun && !this.#stopped && !this.#paused);
		} catch (error) {
			// The table remains playable; the host can resume after a local search failure.
			if (this.#stopped) return;
			if (this.#paused && error instanceof BotRequestAbortedError) return;
			this.stop();
			this.#onError(
				"failed",
				error instanceof Error
					? error.message
					: this.#translate("Local search failed."),
			);
		} finally {
			this.#running = false;
		}
	}

	async #step(): Promise<void> {
		const view = this.#controller.view();
		if (
			this.#stopped ||
			this.#paused ||
			!view.hosting ||
			!view.ready ||
			!view.table
		)
			return;
		const config = playerConfig(view.table);
		const seats = this.#activeSeats(
			view.roster?.bots ?? configuredBotSeats(config),
		);
		const state = parseCanastaState(view.table.state, this.#controller.tableId);
		if (this.#pending) {
			if (!seats.includes(this.#pending.seat)) {
				this.#pending = undefined;
				this.#processed.clear();
				return;
			}
			if (performance.now() < this.#pending.retryAt) return;
			const pending = this.#pending;
			await this.#send(pending.seat, pending.payload);
			return;
		}
		// A bot approves a reset that asks its seat; the game waits until every asked seat answers.
		const reset = state?.reset;
		if (reset)
			for (const seat of seats) {
				const voteKey = `reset:${reset.id}:${seat}`;
				if (
					!reset.required.includes(seat) ||
					reset.approved.includes(seat) ||
					this.#processed.has(voteKey)
				)
					continue;
				this.#processed.add(voteKey);
				await this.#send(
					seat,
					resetVotePayload(this.#controller.tableId, reset.id, true),
				);
				return;
			}
		if (reset) return;
		const match = state?.match;
		if (!state || !match || match.settled || match.winner !== null) return;
		const matchPosition = matchPositionKey(match, state.actions);
		for (const seat of seats) {
			// Only the seat whose turn it is has legal actions, so other seats are skipped here.
			if (match.hand.turn !== engineSeat(seat)) continue;
			// The table changes on every tick and ping. The choices take a search on the page's only thread, so a
			// position that was already asked is skipped before they are computed again.
			if (this.#processed.has(turnKey(match, state.actions, seat))) continue;
			const generation = this.#generation;
			const startedAt = performance.now();
			const key = turnKey(match, state.actions, seat);
			this.#processed.add(key);
			const signal = this.#requestAbort.signal;
			let action: Action | undefined;
			try {
				const result = await chooseLocalCanasta(
					observeCanasta(match.hand, engineSeat(seat), state.history),
					{
						timeMs: this.#settings.thinkingTimeMs ?? 250,
						signal,
					},
				);
				action = result.action;
				this.#onStatus(
					`${config.names[seat]}: ${this.#translate("MCTS: {count} simulations", { count: result.iterations })}`,
				);
				await waitForBotAction(
					startedAt,
					botActionDelay(this.#settings.actionDelayMs),
					signal,
				);
			} catch (error) {
				this.#processed.delete(key);
				if (
					error instanceof BotRequestAbortedError &&
					(signal !== this.#requestAbort.signal || this.#paused)
				)
					return;
				throw error;
			}
			if (this.#stopped || this.#paused || generation !== this.#generation)
				return;
			const current = this.#controller.view();
			if (!current.hosting || !current.ready) return;
			const currentBots = current.roster?.bots ?? configuredBotSeats(config);
			if (!this.#activeSeats(currentBots).includes(seat)) {
				this.#processed.delete(key);
				return;
			}
			const currentState = current.table
				? parseCanastaState(current.table.state, this.#controller.tableId)
				: undefined;
			const currentMatch = currentState?.match;
			if (
				!currentState ||
				!currentMatch ||
				currentState.reset !== null ||
				currentState.matches !== state.matches ||
				matchPositionKey(currentMatch, currentState.actions) !== matchPosition
			)
				return;
			if (!action) throw new Error("MCTS found no legal action");
			const payload = actionPayload(
				this.#controller.tableId,
				match,
				state.actions,
				action,
				state.matches,
			);
			await this.#send(seat, payload);
			return;
		}
	}

	async #send(
		seat: Seat,
		payload: ReturnType<typeof actionPayload>,
	): Promise<void> {
		const generation = this.#generation;
		const result = await this.#controller.sendBot(seat, payload);
		if (!result.ok) {
			if (generation !== this.#generation) return;
			if ("reason" in result && result.reason === BOT_CONTROL_CHANGED) {
				this.#pending = undefined;
				this.#processed.clear();
				this.#rerun = true;
				return;
			}
			if ("waiting" in result && result.waiting === true) {
				this.#pending = {
					seat,
					payload,
					retryAt: performance.now() + 1_000,
				};
				return;
			}
			throw new Error("host rejected local bot action");
		}
		this.#pending = undefined;
		this.#rerun = true;
	}
}
