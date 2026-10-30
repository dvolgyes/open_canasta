import { SEAT_GRACE_MS } from "../p2p/limits";
import type { Seat } from "../protocol";

/** Both counters identify a hand because the hand number restarts with each match. */
export interface HandPosition {
	readonly match: number;
	readonly hand: number;
}

/** Policy input only; these fields are not part of the table wire protocol. */
export interface CoverSeat {
	readonly seat: Seat;
	readonly holder: string | null;
	readonly gen: number;
	readonly coverHand?: HandPosition;
	readonly communityBot?: true;
	readonly recruiting?: "invited" | "online";
}

export interface CoverChange {
	readonly seat: Seat;
	readonly hand: HandPosition | null;
	readonly recruitment?: "invited" | "online" | null;
}

/** The hand boundary returns control; neither a reconnect nor a new host ends cover in mid-hand. */
export class CommunityCover {
	readonly #missing = new Map<
		Seat,
		{ holder: string; gen: number; since: number }
	>();
	changes(input: {
		readonly now: number;
		readonly hand: HandPosition | null;
		readonly complete: boolean;
		readonly humans: readonly Seat[];
		readonly online: ReadonlySet<Seat>;
		readonly seats: readonly CoverSeat[];
		readonly permanentBots?: ReadonlySet<Seat>;
		readonly recruitment?: Readonly<
			Partial<Record<Seat, "invited" | "online">>
		>;
	}): readonly CoverChange[] {
		const result: CoverChange[] = [];
		for (const seat of this.#missing.keys())
			if (!input.humans.includes(seat)) this.#missing.delete(seat);
		for (const seat of input.humans) {
			const row = input.seats.find((item) => item.seat === seat);
			if (!row?.holder || input.online.has(seat)) {
				this.#missing.delete(seat);
				continue;
			}
			const missing = this.#missing.get(seat);
			if (!missing || missing.holder !== row.holder || missing.gen !== row.gen)
				this.#missing.set(seat, {
					holder: row.holder,
					gen: row.gen,
					since: input.now,
				});
		}
		const alreadyRecruiting = input.humans.find(
			(seat) =>
				input.seats.find((row) => row.seat === seat)?.recruiting !== undefined,
		);
		const nextRecruitment =
			alreadyRecruiting ??
			input.humans.find((seat) => {
				const row = input.seats.find((item) => item.seat === seat);
				return (
					row?.holder !== null &&
					row?.holder !== undefined &&
					!input.online.has(seat) &&
					input.now - (this.#missing.get(seat)?.since ?? input.now) >=
						SEAT_GRACE_MS
				);
			});
		for (const seat of input.humans) {
			const row = input.seats.find((row) => row.seat === seat);
			const online = input.online.has(seat);
			if (!row?.holder || input.hand === null) continue;
			if (input.permanentBots?.has(seat) || row.communityBot) {
				if (row.recruiting !== undefined)
					result.push({
						seat,
						hand: row.coverHand ?? null,
						recruitment: null,
					});
				continue;
			}
			if (row.coverHand !== undefined) {
				if (input.complete)
					result.push({
						seat,
						hand: null,
						...(seat === nextRecruitment && !online
							? { recruitment: input.recruitment?.[seat] ?? "online" }
							: online
								? { recruitment: null }
								: {}),
					});
				else if (
					row.coverHand.match !== input.hand.match ||
					row.coverHand.hand !== input.hand.hand
				)
					result.push({
						seat,
						hand: null,
						...(seat === nextRecruitment
							? { recruitment: input.recruitment?.[seat] ?? "online" }
							: {}),
					});
				else if (seat === nextRecruitment && row.recruiting === undefined)
					result.push({
						seat,
						hand: row.coverHand,
						recruitment: input.recruitment?.[seat] ?? "online",
					});
			} else if (
				!online &&
				input.now - (this.#missing.get(seat)?.since ?? input.now) >=
					SEAT_GRACE_MS
			) {
				result.push({
					seat,
					hand: input.complete ? null : input.hand,
					...(seat === nextRecruitment
						? { recruitment: input.recruitment?.[seat] ?? "online" }
						: {}),
				});
			} else if (
				!online &&
				seat === nextRecruitment &&
				row.recruiting === undefined
			) {
				result.push({
					seat,
					hand: row.coverHand ?? null,
					recruitment: input.recruitment?.[seat] ?? "online",
				});
			} else if (online && row.recruiting !== undefined && input.complete) {
				result.push({ seat, hand: null, recruitment: null });
			}
		}
		return result;
	}
	reset(): void {
		this.#missing.clear();
	}
}
