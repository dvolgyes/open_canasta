import type { Translate } from "../i18n";
import type { MaybeStorage } from "../session";
import { applyBoardTexture, boardSettings } from "./board-settings";
import { button, el } from "./dom";
import { applySuitColors, suitColorSettings } from "./suit-colors";
import { applySavedTheme, themeSettings } from "./theme";

/** Appearance choices remain a draft until Save. */
export function appearanceSettings(
	storage: MaybeStorage,
	t: Translate,
): HTMLElement {
	const dialog = el("dialog", {
		className: "appearance-dialog",
		attrs: { "aria-label": t("Appearance settings") },
	});
	const restore = () => {
		applyBoardTexture(storage);
		applySuitColors(storage);
		applySavedTheme(storage);
	};
	dialog.addEventListener("cancel", restore);
	const open = button(t("Appearance settings"), () => {
		const pending = new Map<string, string>();
		const draft = {
			getItem: (key: string) =>
				pending.get(key) ?? storage?.getItem(key) ?? null,
			setItem: (key: string, value: string) => {
				pending.set(key, value);
			},
			removeItem: (key: string) => {
				pending.delete(key);
			},
			key: () => null,
			length: 0,
		};
		const cancel = button(
			t("Cancel"),
			() => {
				restore();
				dialog.close();
			},
			{ attrs: { "data-action": "cancel" } },
		);
		const save = button(
			t("Save"),
			() => {
				for (const [key, value] of pending) storage?.setItem(key, value);
				dialog.close();
			},
			{ attrs: { "data-action": "save" } },
		);
		dialog.replaceChildren(
			el(
				"div",
				{ className: "appearance-content" },
				el("h2", {}, t("Appearance settings")),
				themeSettings(draft, t),
				boardSettings(draft, t),
				suitColorSettings(draft, t),
			),
			el("div", { className: "appearance-actions" }, cancel, save),
		);
		dialog.showModal();
	});
	return el("div", {}, open, dialog);
}
