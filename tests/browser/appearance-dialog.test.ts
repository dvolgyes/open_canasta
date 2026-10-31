import { expect, it } from "vitest";
import {
	appearanceSaved,
	appearanceSettings,
} from "../../src/ui/appearance-dialog";

it("cancels draft settings and saves confirmed settings", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
		key: () => null,
		length: 0,
	};
	const controls = appearanceSettings(storage, (text) => text).element;
	expect(appearanceSaved(storage)).toBe(false);
	document.body.append(controls);
	try {
		const open = controls.querySelector("button");
		if (!open) throw new Error("settings button is missing");
		open.click();
		const dialog = controls.querySelector("dialog");
		const board = dialog?.querySelector<HTMLSelectElement>(
			'select[aria-label="Board texture"]',
		);
		if (!dialog || !board) throw new Error("settings dialog is missing");
		board.value = "off";
		board.dispatchEvent(new Event("change"));
		const shadow = dialog.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		if (!shadow) throw new Error("shadow slider is missing");
		shadow.value = "0";
		shadow.dispatchEvent(new Event("input"));
		expect(document.documentElement.dataset.shadowStrength).toBe("0");
		const font = dialog.querySelector<HTMLSelectElement>(
			'select[aria-label="Suit and rank font size"]',
		);
		if (!font) throw new Error("font size selector is missing");
		font.value = "S";
		font.dispatchEvent(new Event("change"));
		expect(document.documentElement.dataset.suitFontSize).toBe("S");
		const turnFrame = dialog.querySelector<HTMLInputElement>(
			'input[aria-label="Frame the player whose turn it is to play"]',
		);
		if (!turnFrame) throw new Error("turn frame setting is missing");
		turnFrame.checked = false;
		turnFrame.dispatchEvent(new Event("change"));
		expect(document.documentElement.dataset.playTurnFrame).toBe("off");
		expect(values.size).toBe(0);
		dialog.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
		expect(appearanceSaved(storage)).toBe(false);
		expect(document.documentElement.dataset.baizeStrength).toBe("medium");
		expect(document.documentElement.dataset.shadowStrength).toBe("4");
		expect(document.documentElement.dataset.suitFontSize).toBe("XXL");
		expect(document.documentElement.dataset.playTurnFrame).toBe("on");
		open.click();
		const savedBoard = dialog.querySelector<HTMLSelectElement>(
			'select[aria-label="Board texture"]',
		);
		if (!savedBoard) throw new Error("board selector is missing");
		savedBoard.value = "strong";
		savedBoard.dispatchEvent(new Event("change"));
		dialog.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
		expect(appearanceSaved(storage)).toBe(true);
		expect([...values.values()]).toContain("strong");
		expect(document.documentElement.dataset.baizeStrength).toBe("strong");
	} finally {
		controls.remove();
		delete document.documentElement.dataset.baizeStrength;
		delete document.documentElement.dataset.paperStrength;
		delete document.documentElement.dataset.theme;
		delete document.documentElement.dataset.scheme;
		delete document.documentElement.dataset.suitColors;
		delete document.documentElement.dataset.shadowStrength;
		delete document.documentElement.dataset.suitFontSize;
		delete document.documentElement.dataset.playTurnFrame;
		delete document.documentElement.dataset.playTurnText;
		delete document.documentElement.dataset.networkQuality;
	}
});

it("does not repeatedly prompt a browser without storage", () => {
	expect(appearanceSaved(undefined)).toBe(true);
});
