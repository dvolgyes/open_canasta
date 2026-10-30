import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";

const RELOAD_COOLDOWN_MS = 30_000;

/** Requires per-tab storage so the cooldown also survives the requested reload. */
export function allowRemoteReload(
	storage: MaybeStorage,
	tableId: string,
	now: number,
): boolean {
	if (!storage || !Number.isSafeInteger(now) || now < 0) return false;
	const key = `${STORAGE_PREFIX}remote-reload.${tableId}`;
	const raw = storage.getItem(key);
	const last = raw === null ? undefined : Number(raw);
	if (
		last !== undefined &&
		Number.isSafeInteger(last) &&
		now - last < RELOAD_COOLDOWN_MS
	)
		return false;
	storage.setItem(key, String(now));
	return storage.getItem(key) === String(now);
}
