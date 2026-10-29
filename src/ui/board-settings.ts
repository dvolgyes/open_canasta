import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { el } from "./dom";

const KEY = `${STORAGE_PREFIX}settings.baize-strength`;
const PAPER_KEY = `${STORAGE_PREFIX}settings.paper-strength`;
const STRENGTHS = ["off", "mild", "medium", "strong"] as const;
type Strength = (typeof STRENGTHS)[number];

export function readBoardTexture(storage: MaybeStorage): Strength {
	return readStrength(storage, KEY);
}

function readStrength(storage: MaybeStorage, key: string): Strength {
	const value = storage?.getItem(key);
	return STRENGTHS.find((strength) => strength === value) ?? "medium";
}

export function applyBoardTexture(storage: MaybeStorage): void {
	document.documentElement.dataset.baizeStrength = readBoardTexture(storage);
	document.documentElement.dataset.paperStrength = readStrength(
		storage,
		PAPER_KEY,
	);
}

export function boardSettings(
	storage: MaybeStorage,
	t: Translate,
): HTMLElement {
	return el(
		"div",
		{},
		textureSelect(storage, t, KEY, "Board texture", "baizeStrength"),
		textureSelect(storage, t, PAPER_KEY, "Card texture", "paperStrength"),
	);
}

function textureSelect(
	storage: MaybeStorage,
	t: Translate,
	key: string,
	label: string,
	attribute: "baizeStrength" | "paperStrength",
): HTMLElement {
	const select = el("select", { attrs: { "aria-label": t(label) } });
	for (const [value, label] of [
		["off", "Off"],
		["mild", "Mild"],
		["medium", "Medium"],
		["strong", "Strong"],
	] as const) {
		select.append(el("option", { attrs: { value } }, t(label)));
	}
	select.value = readStrength(storage, key);
	select.addEventListener("change", () => {
		const strength = STRENGTHS.find((value) => value === select.value);
		if (strength === undefined) return;
		storage?.setItem(key, strength);
		document.documentElement.dataset[attribute] = strength;
	});
	return el("label", {}, t(label), select);
}
