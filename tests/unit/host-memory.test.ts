import { expect, it } from "vitest";
import { SeatMemory } from "../../src/session";

it("remembers the last host separately from tab seats and expires it", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
	let now = 1_000;
	const first = new SeatMemory(undefined, storage, () => now);
	first.rememberHost("table", "S");
	const later = new SeatMemory(undefined, storage, () => now);
	expect(later.hostSeat("table")).toBe("S");
	expect(later.tabSeat("table")).toBeUndefined();
	now += 365 * 24 * 60 * 60 * 1000;
	expect(later.hostSeat("table")).toBeUndefined();
});

it("ignores malformed or future-dated host records", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
	const memory = new SeatMemory(undefined, storage, () => 100);
	const key = "dvolgyes-open_canasta.host.table";
	for (const value of [
		"{",
		JSON.stringify({ seat: "invalid", savedAt: 1 }),
		JSON.stringify({ seat: "N", savedAt: 101 }),
	]) {
		values.set(key, value);
		expect(memory.hostSeat("table")).toBeUndefined();
	}
});
