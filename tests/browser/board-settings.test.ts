import { expect, it, vi } from "vitest";
import { boardSettings, readBoardTexture } from "../../src/ui/board-settings";
import "../../src/ui/style.css";

it("scales rank and suit text without clipping a ten", () => {
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
	const table = document.createElement("div");
	table.className = "canasta-table";
	const card = document.createElement("button");
	card.className = "card";
	card.textContent = "10♠";
	table.append(card);
	document.body.append(control, table);
	try {
		const select = control.querySelector<HTMLSelectElement>(
			'select[aria-label="Suit and rank font size"]',
		);
		if (!select) throw new Error("rank and suit size control is missing");
		select.value = "S";
		select.dispatchEvent(new Event("change"));
		const small = Number.parseFloat(getComputedStyle(card).fontSize);
		select.value = "XXXL";
		select.dispatchEvent(new Event("change"));
		expect(Number.parseFloat(getComputedStyle(card).fontSize)).toBeGreaterThan(
			small,
		);
		expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
		expect(
			boardSettings(storage, (text) => text).querySelector<HTMLSelectElement>(
				'select[aria-label="Suit and rank font size"]',
			)?.value,
		).toBe("XXXL");
	} finally {
		control.remove();
		table.remove();
		delete document.documentElement.dataset.suitFontSize;
	}
});

it("previews and restores the chosen board card shadow strength", () => {
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
	const card = document.createElement("div");
	card.className = "card";
	document.body.append(control, card);
	try {
		const slider = control.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		if (!slider) throw new Error("shadow slider is missing");
		const original = getComputedStyle(card).boxShadow;
		slider.value = "0";
		slider.dispatchEvent(new Event("input"));
		expect(getComputedStyle(card).boxShadow).not.toBe(original);
		expect(
			boardSettings(storage, (text) => text).querySelector<HTMLInputElement>(
				'input[type="range"]',
			)?.value,
		).toBe("0");
	} finally {
		control.remove();
		card.remove();
		delete document.documentElement.dataset.shadowStrength;
	}
});

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
