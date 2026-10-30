import { expect, it } from "vitest";
import { readPersonalName, savePersonalName } from "../../src/ui/personal-name";

it("stores a valid personal name and rejects invalid replacements", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
		key: () => null,
		length: 0,
	};
	expect(readPersonalName(storage)).toBe("");
	expect(savePersonalName(storage, " Ce\u0301line ")).toBe(true);
	expect(readPersonalName(storage)).toBe("Céline");
	for (const invalid of ["player", "", "Alice\u0007Bob", "x".repeat(41)])
		expect(savePersonalName(storage, invalid)).toBe(false);
	expect(readPersonalName(storage)).toBe("Céline");
	expect(savePersonalName(undefined, "Alice")).toBe(false);
});
