import type { Translate } from "../i18n";
import { button, el } from "./dom";

/** A peer's date is only a report; the player chooses whether to reload. */
export function buildNotice(t: Translate, reload: () => void) {
	const element = el(
		"div",
		{
			className: "build-notice",
			attrs: { role: "status", "data-testid": "build-notice" },
		},
		el("span", {}, t("A player reports a newer build.")),
		button(t("Reload"), reload),
	);
	element.hidden = true;
	return {
		element,
		update: (date: string | undefined) => {
			element.hidden = date === undefined;
		},
	};
}
