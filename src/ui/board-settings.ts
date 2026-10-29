import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { el } from "./dom";

const KEY = `${STORAGE_PREFIX}settings.baize-strength`;
const PAPER_KEY = `${STORAGE_PREFIX}settings.paper-strength`;
const PANEL_KEY = `${STORAGE_PREFIX}settings.panel-texture`;
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
	document.documentElement.dataset.panelTexture =
		storage?.getItem(PANEL_KEY) === "off" ? "off" : "on";
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
		panelTextureSetting(storage, t),
	);
}

function panelTextureSetting(storage: MaybeStorage, t: Translate): HTMLElement {
	const input = el("input", {
		attrs: { type: "checkbox", "aria-label": t("Side panel texture") },
	});
	input.checked = storage?.getItem(PANEL_KEY) !== "off";
	input.addEventListener("change", () => {
		const value = input.checked ? "on" : "off";
		storage?.setItem(PANEL_KEY, value);
		document.documentElement.dataset.panelTexture = value;
	});
	return el("label", {}, input, t("Side panel texture"));
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
