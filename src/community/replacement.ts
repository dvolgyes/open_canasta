import { isTableKey } from "../p2p/link";
import { isObject, isSeat, type Seat } from "../protocol";
import { isPlayerName } from "./formation";

export const REPLACEMENT_OFFER_TTL_MS = 20_000;

export interface ReplacementOffer {
	readonly key: string;
	readonly seat: Seat;
	readonly host: string;
	readonly receivedAt: number;
}

export function parseReplacementOffer(
	value: unknown,
	now: number,
): ReplacementOffer | undefined {
	if (
		!isObject(value) ||
		value.k !== "replacement-offer" ||
		!isTableKey(value.key) ||
		!isSeat(value.seat) ||
		!isPlayerName(value.host)
	)
		return undefined;
	return {
		key: value.key,
		seat: value.seat,
		host: value.host,
		receivedAt: now,
	};
}
