import type { Translate } from "../i18n";
import type { Seat } from "../protocol";

/** Identify the local player and current host in the browser tab. */
export function pageTitle(
	t: Translate,
	seated: {
		name: string;
		seat: Seat;
		turn: boolean;
		host: boolean;
		bot: boolean;
	},
): string {
	const title = t(
		seated.host ? "{game}: {name} ({seat}, host)" : "{game}: {name} ({seat})",
		{
			game: "Open Canasta",
			name: seated.bot ? t("bot") : seated.name,
			seat: t(seated.seat),
		},
	);
	return seated.turn ? t("TURN - {title}", { title }) : title;
}
