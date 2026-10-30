import { playerName, unnamedPlayer } from "../players";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";

const NAME_KEY = `${STORAGE_PREFIX}player-name`;

/** A browser-local preference with no application expiry. */
export function readPersonalName(storage: MaybeStorage): string {
	const name = playerName(storage?.getItem(NAME_KEY));
	return name && !unnamedPlayer(name) ? name : "";
}

export function savePersonalName(
	storage: MaybeStorage,
	value: string,
): boolean {
	const name = playerName(value);
	if (!storage || !name || unnamedPlayer(name)) return false;
	storage.setItem(NAME_KEY, name);
	return storage.getItem(NAME_KEY) === name;
}
