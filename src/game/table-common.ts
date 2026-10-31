import { applyCallRecord, type CallRecords } from "../call/record";
import { isCommandId } from "../ids";
import {
	isObject,
	isSeat,
	type JsonObject,
	SEAT_NAMES,
	SEATS,
	type Seat,
} from "../protocol";
import { checkMessageText } from "./chat";
import type { ApplyContext, ApplyResult } from "./module";

export interface ResetRequest {
	readonly id: string;
	readonly requester: Seat;
	readonly required: readonly Seat[];
	readonly approved: readonly Seat[];
}

interface SharedTable {
	readonly match: unknown;
	readonly messages: number;
	readonly actions: number;
	readonly reset: ResetRequest | null;
	readonly media: CallRecords;
}

export const RESET_WAITING: ApplyResult = {
	ok: false,
	reason: "a reset request is waiting for answers",
};

export function waitingText(
	needed: readonly Seat[],
	present: readonly Seat[],
): string | undefined {
	const names = needed
		.filter((seat) => !present.includes(seat))
		.map((seat) => SEAT_NAMES[seat]);
	const last = names.pop();
	if (last === undefined) return undefined;
	const list = names.length > 0 ? `${names.join(", ")} and ${last}` : last;
	return `Waiting for ${list} to come back`;
}

export function absence(
	needed: readonly Seat[],
	present: readonly Seat[],
): ApplyResult | undefined {
	const reason = waitingText(needed, present);
	return reason === undefined
		? undefined
		: { ok: false, reason, waiting: true };
}

function isSeatList(value: unknown): value is Seat[] {
	return (
		Array.isArray(value) &&
		value.every(isSeat) &&
		new Set(value).size === value.length
	);
}

export function parseResetRequest(
	value: unknown,
): ResetRequest | null | undefined {
	if (value === null) return null;
	if (!isObject(value)) return undefined;
	const { id, requester, required, approved } = value;
	if (!isCommandId(id) || !isSeat(requester)) return undefined;
	if (!isSeatList(required) || required.length === 0) return undefined;
	if (required.includes(requester) || !isSeatList(approved)) return undefined;
	if (!approved.every((seat) => required.includes(seat))) return undefined;
	if (approved.length === required.length) return undefined;
	return { id, requester, required, approved };
}

function accept(event: JsonObject, state: SharedTable): ApplyResult {
	return { ok: true, event, state: state as unknown as JsonObject };
}

/** Apply chat, call, and reset commands identically for both rulesets. */
export function applyCommonTableCommand(
	table: SharedTable,
	context: ApplyContext,
	payload: JsonObject,
): ApplyResult | undefined {
	const reject = (reason: string): ApplyResult => ({ ok: false, reason });
	switch (payload.type) {
		case "chat": {
			const check = checkMessageText(payload.text);
			if (!check.ok) return check;
			return accept(
				{ fromName: context.config.names[context.seat], text: check.text },
				{ ...table, messages: table.messages + 1 },
			);
		}
		case "media": {
			const applied = applyCallRecord(
				table.media,
				context.seat,
				context.holder,
				payload,
			);
			if (!applied.ok) return reject(applied.reason);
			return accept(
				{ kind: "media", seat: context.seat, version: applied.record.version },
				{ ...table, media: applied.records },
			);
		}
		case "reset-request": {
			if (table.reset) return RESET_WAITING;
			if (table.match === null) return reject("the match has not started");
			const present = [...new Set(context.present)];
			if (!present.includes(context.seat))
				return reject("your seat is not present at the table");
			const required = SEATS.filter(
				(seat) => seat !== context.seat && present.includes(seat),
			);
			if (required.length === 0)
				return accept(
					{ kind: "reset-applied", requester: context.seat },
					{ ...table, match: null, actions: 0, reset: null },
				);
			const reset: ResetRequest = {
				id: context.commandId,
				requester: context.seat,
				required,
				approved: [],
			};
			return accept(
				{ kind: "reset-requested", requester: context.seat, required },
				{ ...table, reset },
			);
		}
		case "reset-vote": {
			const pending = table.reset;
			if (!pending || payload.requestId !== pending.id)
				return reject("there is no matching reset request");
			if (!pending.required.includes(context.seat))
				return reject("your seat is not asked to approve this reset");
			if (typeof payload.approve !== "boolean")
				return reject("reset decision must accept or reject");
			if (pending.approved.includes(context.seat))
				return reject("your seat has already approved this reset");
			if (!payload.approve)
				return accept(
					{ kind: "reset-rejected", by: context.seat },
					{ ...table, reset: null },
				);
			const approved = [...pending.approved, context.seat];
			if (pending.required.every((seat) => approved.includes(seat)))
				return accept(
					{ kind: "reset-applied", requester: pending.requester },
					{ ...table, match: null, actions: 0, reset: null },
				);
			return accept(
				{ kind: "reset-approved", by: context.seat },
				{ ...table, reset: { ...pending, approved } },
			);
		}
		case "reset-cancel": {
			const pending = table.reset;
			if (!pending || payload.requestId !== pending.id)
				return reject("there is no matching reset request");
			if (pending.requester !== context.seat)
				return reject("only the requester can cancel this reset");
			return accept({ kind: "reset-cancelled" }, { ...table, reset: null });
		}
		default:
			return undefined;
	}
}
