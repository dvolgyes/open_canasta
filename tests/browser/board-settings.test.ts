import { expect, it, vi } from "vitest";
import { boardSettings, readBoardTexture } from "../../src/ui/board-settings";
import "../../src/ui/style.css";

it("saves the board texture, applies it and restores it from storage", () => {
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
	const control = boardSettings(storage, (text) => text);
	document.body.append(control);
	try {
		const select = control.querySelector("select");
		if (!select) throw new Error("board texture selector is missing");
		select.value = "strong";
		select.dispatchEvent(new Event("change"));
		expect(document.documentElement.dataset.baizeStrength).toBe("strong");
		expect(readBoardTexture(storage)).toBe("strong");
		const board = document.createElement("div");
		board.className = "felt";
		document.body.append(board);
		expect(getComputedStyle(board).backgroundImage).toContain(
			"bridge-baize-strong",
		);
		select.value = "off";
		select.dispatchEvent(new Event("change"));
		expect(getComputedStyle(board).backgroundImage).toBe("none");
		board.remove();
		const selects = control.querySelectorAll("select");
		const paper = selects[1];
		if (!paper) throw new Error("card texture selector is missing");
		const card = document.createElement("div");
		card.className = "card";
		document.body.append(card);
		paper.value = "strong";
		paper.dispatchEvent(new Event("change"));
		expect(getComputedStyle(card).backgroundImage).toContain(
			"card-paper-strong",
		);
		expect(
			boardSettings(storage, (text) => text).querySelectorAll("select")[1]
				?.value,
		).toBe("strong");
		paper.value = "off";
		paper.dispatchEvent(new Event("change"));
		expect(getComputedStyle(card).backgroundImage).toBe("none");
		card.remove();
	} finally {
		control.remove();
		delete document.documentElement.dataset.baizeStrength;
		delete document.documentElement.dataset.paperStrength;
		vi.restoreAllMocks();
	}
});
