import { describe, expect, it } from "vitest";
import {
	normalizeHostApiKey,
	readHostApiKey,
	writeHostApiKey,
} from "../../src/bot/host-key";

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

describe("host OpenRouter API key", () => {
	it("completes a partial OpenRouter prefix for a 64-digit hexadecimal key", () => {
		const hash = "a".repeat(64);
		for (const prefix of ["", "or-v1-", "sk-or-v1-"]) {
			expect(normalizeHostApiKey(` ${prefix}${hash} `)).toBe(
				`sk-or-v1-${hash}`,
			);
		}
		const storage = memoryStorage();
		writeHostApiKey(storage, hash);
		expect(readHostApiKey(storage)).toBe(`sk-or-v1-${hash}`);
	});
	it("leaves other credential shapes as entered after trimming", () => {
		for (const key of [
			`other-${"a".repeat(64)}`,
			"a".repeat(63),
			`sk-or-v1-${"z".repeat(64)}`,
		]) {
			expect(normalizeHostApiKey(` ${key} `)).toBe(key);
		}
	});
	it("trims the key when saving and when reading older stored values", () => {
		const storage = memoryStorage();
		writeHostApiKey(storage, "  fresh-key\n");
		expect(readHostApiKey(storage)).toBe("fresh-key");

		storage.setItem(
			"dvolgyes-open_canasta.openrouter-api-key",
			"\tlegacy-key  ",
		);
		expect(readHostApiKey(storage)).toBe("legacy-key");
	});

	it("removes a saved key when the input contains only whitespace", () => {
		const storage = memoryStorage();
		writeHostApiKey(storage, "  key  ");
		writeHostApiKey(storage, " \n\t ");
		expect(readHostApiKey(storage)).toBe("");
	});
});
