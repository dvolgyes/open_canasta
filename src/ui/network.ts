import { englishTranslator, type Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { FREQUENT_NETWORK_CHECKS_KEY } from "../storage-names";
import { el } from "./dom";
import type { NetworkLine } from "./model";

export interface NetworkPanel {
	readonly element: HTMLElement;
	render(lines: readonly NetworkLine[]): void;
}

/** A "Network" section that keeps its open state while its lines update. */
export function networkPanel(
	t: Translate = englishTranslator,
	open = false,
	storage?: MaybeStorage,
): NetworkPanel {
	const list = el("dl", {});
	const frequent = el("input", { attrs: { type: "checkbox" } });
	frequent.checked = storage?.getItem(FREQUENT_NETWORK_CHECKS_KEY) === "on";
	frequent.disabled = storage === undefined;
	frequent.addEventListener("change", () => {
		storage?.setItem(
			FREQUENT_NETWORK_CHECKS_KEY,
			frequent.checked ? "on" : "off",
		);
	});
	const element = el(
		"details",
		{ className: "network", attrs: { "data-testid": "network" } },
		el("summary", {}, t("Network")),
		list,
		el("label", {}, frequent, ` ${t("Check the connection more often")}`),
	);
	element.open = open;
	return {
		element,
		render(lines) {
			list.replaceChildren(
				...lines.flatMap((line) => [
					el("dt", {}, line.label),
					el("dd", {}, line.value),
				]),
			);
		},
	};
}
