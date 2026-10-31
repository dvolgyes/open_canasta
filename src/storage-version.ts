import type { MaybeStorage } from "./session";
import { STORAGE_PREFIX, STORAGE_VERSION } from "./storage-names";

const VERSION_KEY = `${STORAGE_PREFIX}storage-version`;
const GAME_PREFIXES = [
	"client.",
	"host.",
	"tab.",
	"community.room.",
	"community.transfers.",
].map((suffix) => STORAGE_PREFIX + suffix);

/** Remove only older game state; names, preferences, other applications and newer data stay. */
export function dropOldGameData(
	browser: MaybeStorage,
	tab: MaybeStorage,
	version = STORAGE_VERSION,
): void {
	if (
		!browser ||
		browser.key === undefined ||
		browser.length === undefined ||
		(tab && (tab.key === undefined || tab.length === undefined))
	)
		return;
	const text = browser.getItem(VERSION_KEY);
	const parsed = text === null ? 1 : Number(text);
	const stored = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
	if (stored < version) {
		for (const storage of [browser, tab]) {
			if (!storage || storage.key === undefined || storage.length === undefined)
				continue;
			const keys: string[] = [];
			for (let index = 0; index < storage.length; index++) {
				const key = storage.key(index);
				if (key && GAME_PREFIXES.some((prefix) => key.startsWith(prefix)))
					keys.push(key);
			}
			for (const key of keys) storage.removeItem(key);
		}
	}
	if (stored < version || text === null)
		browser.setItem(VERSION_KEY, String(version));
}
