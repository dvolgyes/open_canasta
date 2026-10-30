import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";

const STORAGE_KEY = `${STORAGE_PREFIX}openrouter-api-key`;
const KEY_START = "sk-or-v1-";
const KEY_HASH = /^[0-9a-f]{64}$/i;

export function normalizeHostApiKey(apiKey: string): string {
	const trimmed = apiKey.trim();
	const prefix = trimmed.slice(0, -64);
	const hash = trimmed.slice(-64);
	let position = 0;
	for (const character of prefix) {
		position = KEY_START.indexOf(character, position) + 1;
		if (position === 0) return trimmed;
	}
	return KEY_HASH.test(hash) ? `${KEY_START}${hash}` : trimmed;
}

/** The key stays in this browser's local storage and is never part of the table setup. */
export function readHostApiKey(storage: MaybeStorage): string {
	return normalizeHostApiKey(storage?.getItem(STORAGE_KEY) ?? "");
}

export function writeHostApiKey(storage: MaybeStorage, apiKey: string): void {
	if (!storage) throw new Error("local storage is not available");
	const normalized = normalizeHostApiKey(apiKey);
	if (normalized === "") storage.removeItem(STORAGE_KEY);
	else storage.setItem(STORAGE_KEY, normalized);
}
