/** The commit on which this build was based, or unknown when Git is unavailable. */
export interface BuildInfo {
	readonly commit: string;
	readonly date: string;
}

declare const __OPEN_CANASTA_BUILD__: BuildInfo;
export const BUILD: BuildInfo = __OPEN_CANASTA_BUILD__;

/** Show the commit date in the viewer's time zone. */
export function formatBuildDate(date: string, timeZone?: string): string {
	const time = Date.parse(date);
	if (Number.isNaN(time)) return date;
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		month: "short",
		day: "numeric",
		year: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(time);
	const part = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((item) => item.type === type)?.value ?? "";
	return `${part("month")} ${part("day")},'${part("year")}, ${part("hour")}:${part("minute")}`;
}
