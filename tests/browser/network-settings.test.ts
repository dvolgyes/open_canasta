import { expect, it } from "vitest";
import { englishTranslator } from "../../src/i18n";
import { networkPanel } from "../../src/ui/network";

it("keeps frequent connection checks off until the player enables them", () => {
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
	const first = networkPanel(englishTranslator, true, storage);
	document.body.append(first.element);
	const option = first.element.querySelector<HTMLInputElement>(
		'input[type="checkbox"]',
	);
	if (!option) throw new Error("missing frequent connection checks option");
	expect(option.checked).toBe(false);
	option.click();
	expect(option.checked).toBe(true);
	const reopened = networkPanel(englishTranslator, true, storage);
	expect(
		reopened.element.querySelector<HTMLInputElement>('input[type="checkbox"]')
			?.checked,
	).toBe(true);
	first.element.remove();
});
