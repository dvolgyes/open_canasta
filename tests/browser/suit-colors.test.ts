import { expect, it } from "vitest";
import "../../src/ui/style.css";
import { suitColorSettings } from "../../src/ui/suit-colors";
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
	const select = control.querySelector("select");
	if (!select) throw new Error("suit selector is missing");
	try {
		select.value = "green-blue";
		select.dispatchEvent(new Event("change"));
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
		for (const option of select.options) {
			select.value = option.value;
			select.dispatchEvent(new Event("change"));
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
			suitColorSettings(storage, (text) => text).querySelector("select")?.value,
		).toBe(select.value);
	} finally {
		delete root.dataset.theme;
		delete root.dataset.scheme;
		delete root.dataset.suitColors;
	}
});
