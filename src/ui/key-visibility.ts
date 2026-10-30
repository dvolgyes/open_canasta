import type { Translate } from "../i18n";
import { el } from "./dom";

/** A deliberate reveal control for a secret input. */
export function keyVisibility(
	input: HTMLInputElement,
	t: Translate,
): {
	readonly element: HTMLElement;
	hide(): void;
} {
	const checkbox = el("input", { attrs: { type: "checkbox" } });
	checkbox.addEventListener("change", () => {
		input.type = checkbox.checked ? "text" : "password";
	});
	return {
		element: el("label", {}, checkbox, ` ${t("Show API key")}`),
		hide() {
			checkbox.checked = false;
			input.type = "password";
		},
	};
}
