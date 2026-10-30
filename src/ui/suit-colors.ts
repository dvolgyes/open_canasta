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
const COLOR_NAMES = {
	standard: ["Black", "Red", "Red", "Black"],
	"green-blue": ["Green", "Blue", "Red", "Black"],
	"black-yellow": ["Black", "Yellow", "Red", "Green"],
	"purple-orange": ["Purple", "Orange", "Red", "Black"],
	"blue-yellow": ["Blue", "Yellow", "Red", "Black"],
	"green-orange": ["Green", "Orange", "Red", "Black"],
	"green-yellow-blue": ["Green", "Yellow", "Red", "Blue"],
	"pink-orange": ["Pink", "Orange", "Red", "Black"],
	"pink-yellow-cyan": ["Pink", "Yellow", "Orange", "Cyan"],
} as const satisfies Record<
	(typeof SCHEMES)[number],
	readonly [string, string, string, string]
>;

export function applySuitColors(storage: MaybeStorage): void {
	const value = storage?.getItem(KEY);
	document.documentElement.dataset.suitColors =
		SCHEMES.find((scheme) => scheme === value) ?? DEFAULT_SCHEME;
}

export function suitColorSettings(
	storage: MaybeStorage,
	t: Translate,
): HTMLElement {
	const selected =
		SCHEMES.find((scheme) => scheme === storage?.getItem(KEY)) ??
		DEFAULT_SCHEME;
	return el(
		"fieldset",
		{ className: "suit-color-settings" },
		el("legend", {}, t("Suit colors")),
		...SCHEMES.map((scheme, index) => {
			const names = COLOR_NAMES[scheme];
			const input = el("input", {
				attrs: {
					type: "radio",
					name: "settings-suit-colors",
					value: scheme,
					"aria-label": t(
						"Set {number}: clubs {clubs}, diamonds {diamonds}, hearts {hearts}, spades {spades}",
						{
							number: index + 1,
							clubs: t(names[0]),
							diamonds: t(names[1]),
							hearts: t(names[2]),
							spades: t(names[3]),
						},
					),
				},
			});
			input.checked = scheme === selected;
			input.addEventListener("change", () => {
				if (!input.checked) return;
				storage?.setItem(KEY, scheme);
				document.documentElement.dataset.suitColors = scheme;
			});
			const preview = el(
				"span",
				{
					className: "suit-color-preview",
					attrs: { "data-suit-colors": scheme, "aria-hidden": "true" },
				},
				...(
					[
						["C", "♣"],
						["D", "♦"],
						["H", "♥"],
						["S", "♠"],
					] as const
				).map(([suit, symbol]) =>
					el("span", { attrs: { "data-suit": suit } }, symbol),
				),
			);
			return el(
				"label",
				{},
				input,
				` ${t("Set {number}", { number: index + 1 })} `,
				preview,
			);
		}),
	);
}
