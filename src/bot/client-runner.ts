import {
	actionPayload,
	parseCanastaState,
	resetVotePayload,
} from "../game/canasta";
import type { TableController, TableView } from "../p2p/table";
import type { Seat } from "../protocol";
import { NODE_PROMPT_TEMPLATES } from "./node-prompts";
import { actionPositionKey } from "./position";
import { DEFAULT_BOT_ACTION_DELAY_MS, waitForBotAction } from "./timing";
import { chooseTurn, type TurnChooser, turnRequest } from "./turn";

/** Drives the game decisions of a CLI bot after it has joined a seat. */
export class ClientBotRunner {
	readonly #controller: TableController;
	readonly #chooser: TurnChooser;
	readonly #report: (message: string) => void;
	readonly #onAction: (label: string, seat: Seat) => void;
	#strategyKey: string | undefined;
	#sentKey: string | undefined;
	#sentFailureCount = 0;
	#position: string | undefined;
	#generation = 0;
	#stopped = false;
	#abort = new AbortController();

	constructor(
		controller: TableController,
		chooser: TurnChooser,
		report: (message: string) => void,
		onAction: (label: string, seat: Seat) => void = () => {},
	) {
		this.#controller = controller;
		this.#chooser = chooser;
		this.#report = report;
		this.#onAction = onAction;
	}

	async advance(view: TableView): Promise<void> {
		if (this.#stopped) return;
		const state = view.table
			? parseCanastaState(view.table.state, this.#controller.tableId)
			: undefined;
		const position = state
			? `${state.matches}:${state.match?.handNo ?? "none"}:${state.actions}:${state.reset?.id ?? ""}:${view.seat ?? ""}`
			: undefined;
		if (position !== this.#position) {
			this.#position = position;
			this.#generation++;
			this.#strategyKey = undefined;
			this.#sentKey = undefined;
			this.#abort.abort();
			this.#abort = new AbortController();
		}
		if (!view.ready || !state || view.seat === null) return;
		const match = state?.match;
		if (view.outbox.length > 0) return;
		const seat = view.seat;
		const generation = this.#generation;
		const key = String(generation);
		if (this.#sentKey === key) {
			if (view.failures.length > this.#sentFailureCount)
				throw new Error("host rejected the bot's action");
			return;
		}
		if (state.reset) {
			if (
				!state.reset.required.includes(seat) ||
				state.reset.approved.includes(seat)
			)
				return;
			this.#sentKey = key;
			this.#sentFailureCount = view.failures.length;
			const result = await this.#controller.send(
				resetVotePayload(this.#controller.tableId, state.reset.id, true),
			);
			if (!result.ok && generation === this.#generation && !this.#stopped)
				throw new Error(`could not queue reset vote (${result.code})`);
			return;
		}
		if (!match || match.settled || match.winner !== null) return;
		if (this.#strategyKey === key) return;
		this.#strategyKey = key;
		const startedAt = performance.now();
		const signal = this.#abort.signal;
		const request = turnRequest(
			match,
			state.actions,
			seat,
			NODE_PROMPT_TEMPLATES,
		);
		if (!request) return;
		let choice: Awaited<ReturnType<typeof chooseTurn>>;
		try {
			choice = await chooseTurn(this.#chooser, request, this.#report);
			await waitForBotAction(startedAt, DEFAULT_BOT_ACTION_DELAY_MS, signal);
		} catch (error) {
			if (this.#stopped || generation !== this.#generation) return;
			throw error;
		}
		if (this.#stopped || generation !== this.#generation) return;
		const current = this.#controller.view();
		const currentState = current.table
			? parseCanastaState(current.table.state, this.#controller.tableId)
			: undefined;
		if (
			!current.ready ||
			current.seat !== seat ||
			!currentState?.match ||
			currentState.reset ||
			currentState.matches !== state.matches ||
			actionPositionKey(currentState.match.handNo, currentState.actions) !==
				actionPositionKey(match.handNo, state.actions)
		)
			return;
		this.#sentKey = key;
		this.#sentFailureCount = current.failures.length;
		const result = await this.#controller.send(
			actionPayload(
				this.#controller.tableId,
				match,
				state.actions,
				choice.action,
				state.matches,
			),
		);
		if (!result.ok && generation === this.#generation && !this.#stopped)
			throw new Error(`could not queue game action (${result.code})`);
		if (result.ok && !this.#stopped) this.#onAction(choice.label, seat);
	}

	stop(): void {
		this.#stopped = true;
		this.#generation++;
		this.#abort.abort();
	}
}
