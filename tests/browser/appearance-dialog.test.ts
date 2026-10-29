import { expect, it } from "vitest";
import { appearanceSettings } from "../../src/ui/appearance-dialog";

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
	const controls = appearanceSettings(storage, (text) => text);
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
		expect(values.size).toBe(0);
		dialog.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
		expect(document.documentElement.dataset.baizeStrength).toBe("medium");
		open.click();
		const savedBoard = dialog.querySelector<HTMLSelectElement>(
			'select[aria-label="Board texture"]',
		);
		if (!savedBoard) throw new Error("board selector is missing");
		savedBoard.value = "strong";
		savedBoard.dispatchEvent(new Event("change"));
		dialog.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
		expect([...values.values()]).toContain("strong");
		expect(document.documentElement.dataset.baizeStrength).toBe("strong");
	} finally {
		controls.remove();
		delete document.documentElement.dataset.baizeStrength;
		delete document.documentElement.dataset.paperStrength;
		delete document.documentElement.dataset.theme;
		delete document.documentElement.dataset.scheme;
		delete document.documentElement.dataset.suitColors;
	}
});
