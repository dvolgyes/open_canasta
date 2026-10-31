import { expect, it } from "vitest";
import { HOST_MEMORY_TTL_MS, SeatMemory } from "../../src/session";

it("removes expired host markers and preserves current markers and preferences", () => {
	const values = new Map<string, string>();
	const storage = {
		get length() {
			return values.size;
		},
		key: (index: number) => [...values.keys()][index] ?? null,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
	let now = 1_000;
	const memory = new SeatMemory(undefined, storage, () => now);
	memory.rememberHost("old", "N");
	now += HOST_MEMORY_TTL_MS;
	memory.rememberHost("new", "S");
	values.set("dvolgyes-open_canasta.settings.theme", "dark");
	memory.pruneHosts();
	expect(values.has("dvolgyes-open_canasta.host.old")).toBe(false);
	expect(memory.hostSeat("new")).toBe("S");
	expect(values.get("dvolgyes-open_canasta.settings.theme")).toBe("dark");
});
