import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { el } from "./dom";

const KEY = `${STORAGE_PREFIX}settings.suit-colors`;
const DEFAULT_SCHEME = "green-orange";
const SCHEMES = [
	"standard",
	"green-blue",
	"black-yellow",
	"purple-orange",
	"blue-yellow",
	"green-orange",
	"green-yellow-blue",
	"pink-orange",
	"pink-yellow-cyan",
] as const;

export function applySuitColors(storage: MaybeStorage): void {
	const value = storage?.getItem(KEY);
	document.documentElement.dataset.suitColors =
		SCHEMES.find((scheme) => scheme === value) ?? DEFAULT_SCHEME;
}

export function suitColorSettings(
	storage: MaybeStorage,
	t: Translate,
): HTMLElement {
	const select = el("select", { attrs: { "aria-label": t("Suit colors") } });
	for (const scheme of SCHEMES)
		select.append(el("option", { attrs: { value: scheme } }, scheme));
	select.value =
		SCHEMES.find((scheme) => scheme === storage?.getItem(KEY)) ??
		DEFAULT_SCHEME;
	select.addEventListener("change", () => {
		const scheme = SCHEMES.find((value) => value === select.value);
		if (scheme === undefined) return;
		storage?.setItem(KEY, scheme);
		document.documentElement.dataset.suitColors = scheme;
	});
	return el("label", {}, t("Suit colors"), select);
}
