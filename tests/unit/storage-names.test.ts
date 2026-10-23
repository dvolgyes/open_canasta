import { describe, expect, it } from "vitest";
import { writeHostApiKey } from "../../src/bot/host-key";
import { tableIdentity } from "../../src/p2p/table";

// Every project on dvolgyes.github.io shares one origin, and so one localStorage.
const PREFIX = "dvolgyes-open_canasta.";
const KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => void values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
}

function keys(storage: Storage): string[] {
	return Array.from({ length: storage.length }, (_, index) =>
		storage.key(index),
	).filter((key) => key !== null);
}

describe("browser storage names", () => {
	it("stores the client identifier of a table under the project prefix", async () => {
		const storage = memoryStorage();
		const identity = await tableIdentity(KEY, storage);
		expect(keys(storage)).toEqual([`${PREFIX}client.${identity.tableId}`]);
		expect((await tableIdentity(KEY, storage)).client).toBe(identity.client);
	});

	it("stores the OpenRouter key under the project prefix", () => {
		const storage = memoryStorage();
		writeHostApiKey(storage, "key");
		expect(keys(storage)).toEqual([`${PREFIX}openrouter-api-key`]);
	});
});
