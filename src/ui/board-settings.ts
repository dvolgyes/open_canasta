import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { el } from "./dom";

const KEY = `${STORAGE_PREFIX}settings.baize-strength`;
const STRENGTHS = ["off", "mild", "medium", "strong"] as const;
type Strength = (typeof STRENGTHS)[number];

export function readBoardTexture(storage: MaybeStorage): Strength {
	const value = storage?.getItem(KEY);
	return STRENGTHS.find((strength) => strength === value) ?? "medium";
}

export function applyBoardTexture(storage: MaybeStorage): void {
	document.documentElement.dataset.baizeStrength = readBoardTexture(storage);
}

export function boardSettings(
	storage: MaybeStorage,
	t: Translate,
): HTMLElement {
	const select = el("select", { attrs: { "aria-label": t("Board texture") } });
	for (const [value, label] of [
		["off", "Off"],
		["mild", "Mild"],
		["medium", "Medium"],
		["strong", "Strong"],
	] as const) {
		select.append(el("option", { attrs: { value } }, t(label)));
	}
	select.value = readBoardTexture(storage);
	select.addEventListener("change", () => {
		const strength = STRENGTHS.find((value) => value === select.value);
		if (strength === undefined) return;
		storage?.setItem(KEY, strength);
		document.documentElement.dataset.baizeStrength = strength;
	});
	return el("label", {}, t("Board texture"), select);
}
