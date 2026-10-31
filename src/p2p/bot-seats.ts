import { SEATS, type Seat, type TableConfig } from "../protocol";
import { deriveHolder } from "./keys";

/** A queued local action belongs to an earlier period of bot control. */
export const BOT_CONTROL_CHANGED = "bot control changed";

export interface BotSeatClaim {
	readonly seat: Seat;
	readonly holder: string;
	readonly id: string;
}

export function botSeats(config: TableConfig): Seat[] {
	return SEATS.filter((seat) => config.botSetup?.seats.includes(seat) === true);
}

/** The one human seat in a solo setup, if the other three are bots. */
export function soloSeat(config: TableConfig): Seat | undefined {
	const bots = botSeats(config);
	const humans = SEATS.filter((seat) => !bots.includes(seat));
	return humans.length === 1 ? humans[0] : undefined;
}

export function botSeatHolder(tableId: string, seat: Seat): Promise<string> {
	return deriveHolder(tableId, `open_canasta|host-bot|${seat}`);
}

export async function botSeatClaims(
	tableId: string,
	config: TableConfig,
	newId: () => string,
	exclude?: Seat,
): Promise<BotSeatClaim[]> {
	return Promise.all(
		botSeats(config)
			.filter((seat) => seat !== exclude)
			.map(async (seat) => ({
				seat,
				holder: await botSeatHolder(tableId, seat),
				id: newId(),
			})),
	);
}
