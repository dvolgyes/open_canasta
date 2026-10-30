import { isSeat, type Seat } from "./protocol";
import { STORAGE_PREFIX } from "./storage-names";

// ---------------------------------------------------------------------------------------------------------------
// Seat memory

const TAB_PREFIX = `${STORAGE_PREFIX}tab.`;

/** Storage that may be missing, for example when the browser blocks site data. */
export type MaybeStorage =
	| Pick<Storage, "getItem" | "setItem" | "removeItem">
	| undefined;

/**
 * Web storage throws a DOMException when the browser blocks site data (on access) or the quota is full
 * (on write). Seat memory is a convenience, so such a storage acts as empty and read-only.
 */
export function guardedStorage(open: () => Storage): MaybeStorage {
	const attempt = <T>(call: () => T, fallback: T): T => {
		try {
			return call();
		} catch (error) {
			if (error instanceof DOMException) return fallback;
			throw error;
		}
	};
	const storage = attempt<Storage | undefined>(open, undefined);
	if (!storage) return undefined;
	return {
		getItem: (key) => attempt(() => storage.getItem(key), null),
		setItem: (key, value) =>
			attempt(() => storage.setItem(key, value), undefined),
		removeItem: (key) => attempt(() => storage.removeItem(key), undefined),
	};
}

/**
 * sessionStorage holds this tab's seat (survives reload and an Android tab restore).
 */
export class SeatMemory {
	readonly #tab: MaybeStorage;
	constructor(tab: MaybeStorage) {
		this.#tab = tab;
	}

	tabSeat(tableId: string): Seat | undefined {
		const value = this.#tab?.getItem(TAB_PREFIX + tableId);
		return isSeat(value) ? value : undefined;
	}

	remember(tableId: string, seat: Seat): void {
		this.#tab?.setItem(TAB_PREFIX + tableId, seat);
	}

	/** Clears this tab's seat after the table expires. */
	forget(tableId: string): void {
		this.#tab?.removeItem(TAB_PREFIX + tableId);
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Seat locks: which seats another live tab of this browser holds

export interface HoldOptions {
	/** Refuses at once when another tab holds the lock instead of waiting for it. */
	readonly ifAvailable?: boolean;
	/** Runs once when this tab loses the lock before it releases it, for example if the page can no longer hold it. */
	readonly onLost?: () => void;
	/** Runs once when this tab holds the lock; never when it releases the lock before the grant. */
	readonly onAcquired?: () => void;
}

export interface SeatLocks {
	heldElsewhere(tableId: string): Promise<ReadonlySet<Seat>>;
	/** Holds the seat's lock until the returned function runs or the tab closes. */
	hold(tableId: string, seat: Seat, options?: HoldOptions): () => void;
}

const LOCK_PREFIX = `${STORAGE_PREFIX}seat.`;

function lockName(tableId: string, seat: Seat): string {
	return `${LOCK_PREFIX}${tableId}.${seat}`;
}

/**
 * Web Locks are released when a tab closes or crashes, and kept while a tab is only suspended.
 * Without the API (old browsers), no seat counts as held elsewhere.
 */
export function webSeatLocks(locks: LockManager | undefined): SeatLocks {
	return {
		async heldElsewhere(tableId) {
			const held = new Set<Seat>();
			if (!locks) return held;
			const snapshot = await locks.query();
			for (const lock of snapshot.held ?? []) {
				const prefix = `${LOCK_PREFIX}${tableId}.`;
				const seat = lock.name?.startsWith(prefix)
					? lock.name.slice(prefix.length)
					: undefined;
				if (isSeat(seat)) held.add(seat);
			}
			return held;
		},
		hold(tableId, seat, options = {}) {
			if (!locks) {
				let released = false;
				queueMicrotask(() => {
					if (!released) options.onAcquired?.();
				});
				return () => {
					released = true;
				};
			}
			let ended = false;
			let release: () => void = () => {};
			const released = new Promise<void>((resolve) => {
				release = () => {
					ended = true;
					resolve();
				};
			});
			const requestOptions = options.ifAvailable ? { ifAvailable: true } : {};
			// The request rejects when the page can no longer hold the lock.
			locks
				.request(lockName(tableId, seat), requestOptions, (lock) => {
					if (lock === null) {
						ended = true;
						options.onLost?.();
						return;
					}
					if (!ended) options.onAcquired?.();
					return released;
				})
				.catch(() => {
					if (ended) return;
					ended = true;
					options.onLost?.();
				});
			return release;
		},
	};
}
