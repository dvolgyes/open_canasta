import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { el } from "./dom";

const THEMES = ["selenized", "normal", "solarized", "gruvbox"] as const;
const SCHEMES = ["auto", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];
type Scheme = (typeof SCHEMES)[number];
const THEME_KEY = `${STORAGE_PREFIX}settings.theme`;
const SCHEME_KEY = `${STORAGE_PREFIX}settings.scheme`;

export function applyTheme(
	root: HTMLElement,
	theme: Theme,
	scheme: Scheme,
	prefersDark: boolean,
): void {
	root.dataset.theme = theme;
	root.dataset.scheme =
		scheme === "auto" ? (prefersDark ? "dark" : "light") : scheme;
}

function chosen(storage: MaybeStorage): { theme: Theme; scheme: Scheme } {
	return {
		theme:
			THEMES.find((value) => value === storage?.getItem(THEME_KEY)) ??
			"selenized",
		scheme:
			SCHEMES.find((value) => value === storage?.getItem(SCHEME_KEY)) ?? "auto",
	};
}

export function watchTheme(storage: MaybeStorage): () => void {
	const system = window.matchMedia("(prefers-color-scheme: dark)");
	const apply = () => {
		const { theme, scheme } = chosen(storage);
		applyTheme(document.documentElement, theme, scheme, system.matches);
	};
	apply();
	system.addEventListener("change", apply);
	return () => system.removeEventListener("change", apply);
}

export function applySavedTheme(storage: MaybeStorage): void {
	const { theme, scheme } = chosen(storage);
	applyTheme(
		document.documentElement,
		theme,
		scheme,
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
}

export function themeSettings(
	storage: MaybeStorage,
	t: Translate,
): HTMLElement {
	const initial = chosen(storage);
	const theme = el("select", { attrs: { "aria-label": t("Theme") } });
	for (const value of THEMES)
		theme.append(el("option", { attrs: { value } }, value));
	theme.value = initial.theme;
	const scheme = el("select", { attrs: { "aria-label": t("Appearance") } });
	for (const [value, label] of [
		["auto", "Automatic"],
		["light", "Light"],
		["dark", "Dark"],
	] as const)
		scheme.append(el("option", { attrs: { value } }, t(label)));
	scheme.value = initial.scheme;
	const update = () => {
		const selectedTheme = THEMES.find((value) => value === theme.value);
		const selectedScheme = SCHEMES.find((value) => value === scheme.value);
		if (!selectedTheme || !selectedScheme) return;
		storage?.setItem(THEME_KEY, selectedTheme);
		storage?.setItem(SCHEME_KEY, selectedScheme);
		applyTheme(
			document.documentElement,
			selectedTheme,
			selectedScheme,
			window.matchMedia("(prefers-color-scheme: dark)").matches,
		);
	};
	theme.addEventListener("change", update);
	scheme.addEventListener("change", update);
	return el(
		"div",
		{},
		el("label", {}, t("Theme"), theme),
		el("label", {}, t("Appearance"), scheme),
	);
}
