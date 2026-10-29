import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { STORAGE_PREFIX } from "../storage-names";
import { el } from "./dom";

const KEY = `${STORAGE_PREFIX}settings.baize-strength`;
const PAPER_KEY = `${STORAGE_PREFIX}settings.paper-strength`;
const PANEL_KEY = `${STORAGE_PREFIX}settings.panel-texture`;
const SHADOW_KEY = `${STORAGE_PREFIX}settings.shadow-strength`;
const SHADOWS = ["0", "1", "2", "3", "4"] as const;
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
	document.documentElement.dataset.shadowStrength = readShadow(storage);
}

function readShadow(storage: MaybeStorage): string {
	return SHADOWS.find((value) => value === storage?.getItem(SHADOW_KEY)) ?? "4";
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
		shadowSetting(storage, t),
	);
}

function shadowSetting(storage: MaybeStorage, t: Translate): HTMLElement {
	const input = el("input", {
		attrs: {
			type: "range",
			min: "0",
			max: "4",
			step: "1",
			"aria-label": t("Shadow intensity and distance"),
		},
	});
	const output = el("output", {});
	input.value = readShadow(storage);
	const update = () => {
		const value = SHADOWS.find((choice) => choice === input.value);
		if (value === undefined) return;
		output.textContent = `${Number(value) * 25}%`;
		input.setAttribute("aria-valuetext", output.textContent);
		document.documentElement.dataset.shadowStrength = value;
	};
	update();
	input.addEventListener("input", () => {
		update();
		storage?.setItem(SHADOW_KEY, input.value);
	});
	return el("label", {}, t("Shadow intensity and distance"), input, output);
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
