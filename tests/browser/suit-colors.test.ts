import { expect, it } from "vitest";
import "../../src/ui/style.css";
import { translator } from "../../src/i18n";
import { applySuitColors, suitColorSettings } from "../../src/ui/suit-colors";
import { applyTheme } from "../../src/ui/theme";

function luminance(color: string): number {
	const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
	if (!channels) throw new Error(`invalid color: ${color}`);
	const [r = 0, g = 0, b = 0] = channels.slice(1).map((raw) => {
		const value = Number(raw) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

it("shows each suit-color choice with a translated description and preview", () => {
	const control = suitColorSettings(undefined, translator("de"));
	const choices = control.querySelectorAll<HTMLInputElement>(
		'input[type="radio"]',
	);
	expect(choices).toHaveLength(9);
	const choice = [...choices].find((input) => input.value === "green-orange");
	if (!choice) throw new Error("four-color choice is missing");
	expect(choice.getAttribute("aria-label")).toBe(
		"Satz 6: Kreuz Grün, Karo Orange, Herz Rot, Pik Schwarz",
	);
	const preview = choice.closest("label")?.querySelector(".suit-color-preview");
	expect(preview?.textContent).toBe("♣♦♥♠");
	expect(preview?.getAttribute("data-suit-colors")).toBe("green-orange");
});

it("uses the reference four-color palette unless a player saved a choice", () => {
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
	try {
		applySuitColors(storage);
		expect(document.documentElement.dataset.suitColors).toBe("green-orange");
		const control = suitColorSettings(storage, (text) => text);
		document.body.append(control);
		const selected = control.querySelector<HTMLInputElement>("input:checked");
		const standard = control.querySelector<HTMLInputElement>(
			'input[value="standard"]',
		);
		if (!selected || !standard) throw new Error("suit selector is missing");
		expect(selected.value).toBe("green-orange");
		standard.click();
		applySuitColors(storage);
		expect(document.documentElement.dataset.suitColors).toBe("standard");
		control.remove();
	} finally {
		delete document.documentElement.dataset.suitColors;
	}
});

it("persists suit colors and keeps all suit inks legible on cards", () => {
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
	const root = document.documentElement;
	const control = suitColorSettings(storage, (text) => text);
	document.body.append(control);
	const choices = control.querySelectorAll<HTMLInputElement>(
		'input[type="radio"]',
	);
	const greenBlue = control.querySelector<HTMLInputElement>(
		'input[value="green-blue"]',
	);
	if (!greenBlue) throw new Error("suit selector is missing");
	try {
		greenBlue.click();
		const club = document.createElement("span");
		const diamond = document.createElement("span");
		club.className = diamond.className = "card";
		club.dataset.suit = "C";
		diamond.dataset.suit = "D";
		document.body.append(club, diamond);
		expect(getComputedStyle(club).color).not.toBe(
			getComputedStyle(diamond).color,
		);
		club.remove();
		diamond.remove();
		for (const option of choices) {
			option.click();
			for (const theme of [
				"selenized",
				"normal",
				"solarized",
				"gruvbox",
			] as const) {
				for (const scheme of ["light", "dark"] as const) {
					applyTheme(root, theme, scheme, false);
					for (const suit of ["C", "D", "H", "S"]) {
						const card = document.createElement("span");
						card.className = "card";
						card.dataset.suit = suit;
						document.body.append(card);
						const style = getComputedStyle(card);
						const preview = option
							.closest("label")
							?.querySelector(`.suit-color-preview [data-suit="${suit}"]`);
						if (!preview) throw new Error("suit preview is missing");
						expect(getComputedStyle(preview).color).toBe(style.color);
						const [light = 0, dark = 0] = [
							luminance(style.color),
							luminance(style.backgroundColor),
						].sort((a, b) => b - a);
						expect(
							(light + 0.05) / (dark + 0.05),
							`${option.value} ${theme} ${scheme} ${suit}`,
						).toBeGreaterThanOrEqual(3);
						card.remove();
					}
				}
			}
		}
		expect(
			suitColorSettings(
				storage,
				(text) => text,
			).querySelector<HTMLInputElement>("input:checked")?.value,
		).toBe([...choices].at(-1)?.value);
	} finally {
		control.remove();
		delete root.dataset.theme;
		delete root.dataset.scheme;
		delete root.dataset.suitColors;
	}
});
