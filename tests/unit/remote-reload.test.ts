import { expect, it } from "vitest";
import { allowRemoteReload } from "../../src/ui/remote-reload";

it("limits host-triggered reloads across reloads of a tab", () => {
	const data = new Map<string, string>();
	const storage = {
		get length() {
			return data.size;
		},
		key: (index: number) => [...data.keys()][index] ?? null,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
		removeItem: (key: string) => {
			data.delete(key);
		},
	};
	expect(allowRemoteReload(storage, "table", 100_000)).toBe(true);
	expect(allowRemoteReload(storage, "table", 100_001)).toBe(false);
	expect(allowRemoteReload(storage, "table", 130_000)).toBe(true);
	expect(allowRemoteReload(undefined, "table", 200_000)).toBe(false);
	expect(
		allowRemoteReload({ ...storage, setItem: () => {} }, "other", 200_000),
	).toBe(false);
	expect(allowRemoteReload(storage, "table", 129_999)).toBe(false);
});
