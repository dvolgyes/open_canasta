import {
	isObject,
	MAX_NAME_LENGTH,
	SEATS,
	type Seat,
	type TableConfig,
} from "./protocol";

/** A display name is never an identity or authorization credential. */
export function playerName(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const name = value.trim().normalize("NFC");
	return name.length > 0 &&
		Array.from(name).length <= MAX_NAME_LENGTH &&
		!/\p{Cc}/u.test(name)
		? name
		: undefined;
}

export function unnamedPlayer(name: string): boolean {
	return name.trim() === "" || name.trim().toLowerCase() === "player";
}

export interface PlayerProfile {
	readonly name: string;
	readonly askOnEntry: boolean;
	readonly rev: number;
}

export type PlayerProfiles = Readonly<Record<Seat, PlayerProfile>>;

export function initialPlayers(config: TableConfig): PlayerProfiles {
	return Object.fromEntries(
		SEATS.map((seat) => [
			seat,
			{
				name: config.names[seat],
				askOnEntry: unnamedPlayer(config.names[seat]),
				rev: 0,
			},
		]),
	) as PlayerProfiles;
}

export function parsePlayers(
	value: unknown,
	config: TableConfig,
	rev: number,
): PlayerProfiles | undefined {
	if (!isObject(value)) return undefined;
	const profiles: Partial<Record<Seat, PlayerProfile>> = {};
	for (const seat of SEATS) {
		const item = value[seat];
		if (
			!isObject(item) ||
			typeof item.name !== "string" ||
			typeof item.askOnEntry !== "boolean" ||
			typeof item.rev !== "number" ||
			!Number.isSafeInteger(item.rev) ||
			item.rev < 0 ||
			item.rev > rev ||
			(item.rev === 0
				? item.name !== config.names[seat] ||
					item.askOnEntry !== unnamedPlayer(item.name)
				: playerName(item.name) !== item.name)
		)
			return undefined;
		profiles[seat] = {
			name: item.name,
			askOnEntry: item.askOnEntry,
			rev: item.rev,
		};
	}
	return profiles as PlayerProfiles;
}

export function playersFor(table: {
	readonly config: TableConfig;
	readonly players?: PlayerProfiles;
}): PlayerProfiles {
	return table.players ?? initialPlayers(table.config);
}

export function playerConfig(table: {
	readonly config: TableConfig;
	readonly players?: PlayerProfiles;
}): TableConfig {
	const players = playersFor(table);
	return {
		...table.config,
		names: Object.fromEntries(
			SEATS.map((seat) => [seat, players[seat].name]),
		) as Record<Seat, string>,
	};
}
