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
	} finally {
		control.remove();
		delete document.documentElement.dataset.baizeStrength;
		vi.restoreAllMocks();
	}
});
