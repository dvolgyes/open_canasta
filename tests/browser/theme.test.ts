import { expect, it } from "vitest";
import "../../src/ui/style.css";
import { applyTheme, themeSettings } from "../../src/ui/theme";

function color(name: string): number[] {
	const probe = document.createElement("span");
	probe.style.color = `var(--${name})`;
	document.body.append(probe);
	const value = getComputedStyle(probe).color;
	probe.remove();
	const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
	if (!match) throw new Error(`invalid color for ${name}: ${value}`);
	return match.slice(1).map(Number);
}

function luminance(channels: number[]): number {
	const [r = 0, g = 0, b = 0] = channels.map((channel) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const values = [luminance(color(a)), luminance(color(b))].sort(
		(x, y) => y - x,
	);
	return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

it("applies distinct light and dark palettes while keeping card text readable", () => {
	const root = document.documentElement;
	try {
		applyTheme(root, "selenized", "light", false);
		const light = getComputedStyle(root).getPropertyValue("--bg").trim();
		applyTheme(root, "selenized", "dark", false);
		const style = getComputedStyle(root);
		expect(style.getPropertyValue("--bg").trim()).not.toBe(light);
		expect(style.getPropertyValue("--card-bg").trim()).not.toBe(
			style.getPropertyValue("--card-fg").trim(),
		);
	} finally {
		delete root.dataset.theme;
		delete root.dataset.scheme;
	}
});

it("keeps page, card and button text readable in each palette", () => {
	try {
		for (const theme of [
			"selenized",
			"normal",
			"solarized",
			"gruvbox",
		] as const) {
			for (const scheme of ["light", "dark"] as const) {
				applyTheme(document.documentElement, theme, scheme, false);
				for (const [foreground, background] of [
					["fg", "bg"],
					["card-fg", "card-bg"],
					["accent-fg", "accent"],
					["turn-name", "felt-fg"],
					["alert-fg", "alert-bg"],
				] as const)
					expect(
						contrast(foreground, background),
						`${theme} ${scheme} ${foreground}/${background}`,
					).toBeGreaterThanOrEqual(4.5);
				const banner = document.createElement("div");
				banner.className = "banner";
				document.body.append(banner);
				expect(getComputedStyle(banner).backgroundColor).toBe(
					`rgb(${color("alert-bg").join(", ")})`,
				);
				expect(getComputedStyle(banner).color).toBe(
					`rgb(${color("alert-fg").join(", ")})`,
				);
				banner.remove();
				expect(
					contrast("card-red", "card-bg"),
					`${theme} ${scheme} red cards`,
				).toBeGreaterThanOrEqual(3);
				const card = document.createElement("span");
				card.className = "card red";
				document.body.append(card);
				expect(getComputedStyle(card).color).toBe(
					`rgb(${color("card-red").join(", ")})`,
				);
				card.remove();
			}
		}
	} finally {
		delete document.documentElement.dataset.theme;
		delete document.documentElement.dataset.scheme;
	}
});

it("uses each theme's sheet colors for the call panel and table controls", () => {
	const table = document.createElement("div");
	table.className = "table-screen";
	table.dataset.layout = "desktop";
	for (const name of ["call-panel", "screen-controls", "score-strip"]) {
		const panel = document.createElement("section");
		panel.className = name;
		if (name === "call-panel") {
			const join = document.createElement("button");
			join.className = "call-join";
			join.textContent = "Join call";
			panel.append(join);
		}
		if (name === "score-strip") {
			const mine = document.createElement("span");
			mine.className = "side";
			mine.dataset.mine = "true";
			panel.append(mine);
		}
		table.append(panel);
	}
	document.body.append(table);
	try {
		for (const theme of [
			"selenized",
			"normal",
			"solarized",
			"gruvbox",
		] as const) {
			for (const scheme of ["light", "dark"] as const) {
				applyTheme(document.documentElement, theme, scheme, false);
				const background = `rgb(${color("sheet-bg").join(", ")})`;
				const foreground = `rgb(${color("sheet-fg").join(", ")})`;
				expect(contrast("sheet-fg", "sheet-bg")).toBeGreaterThanOrEqual(4.5);
				const mine = table.querySelector(".side[data-mine]");
				if (!mine) throw new Error("score highlight is missing");
				const mineStyle = getComputedStyle(mine);
				const channels = (value: string) => {
					const canvas = document.createElement("canvas");
					canvas.width = canvas.height = 1;
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Canvas is unavailable");
					context.fillStyle = value;
					context.fillRect(0, 0, 1, 1);
					return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
				};
				const colors = [
					luminance(channels(mineStyle.color)),
					luminance(channels(mineStyle.backgroundColor)),
				].sort((a, b) => b - a);
				expect(
					((colors[0] ?? 0) + 0.05) / ((colors[1] ?? 0) + 0.05),
					`${theme} ${scheme} highlighted score`,
				).toBeGreaterThanOrEqual(4.5);
				const join = table.querySelector(".call-join");
				if (!join) throw new Error("call action is missing");
				const joinStyle = getComputedStyle(join);
				const joinColors = [
					luminance(channels(joinStyle.color)),
					luminance(channels(joinStyle.backgroundColor)),
				].sort((a, b) => b - a);
				expect(
					((joinColors[0] ?? 0) + 0.05) / ((joinColors[1] ?? 0) + 0.05),
					`${theme} ${scheme} join action`,
				).toBeGreaterThanOrEqual(4.5);
				(join as HTMLElement).dataset.inCall = "true";
				const leaveStyle = getComputedStyle(join);
				const leaveColors = [
					luminance(channels(leaveStyle.color)),
					luminance(channels(leaveStyle.backgroundColor)),
				].sort((a, b) => b - a);
				expect(
					((leaveColors[0] ?? 0) + 0.05) / ((leaveColors[1] ?? 0) + 0.05),
					`${theme} ${scheme} leave action`,
				).toBeGreaterThanOrEqual(4.5);
				delete (join as HTMLElement).dataset.inCall;
				for (const panel of table.children) {
					const style = getComputedStyle(panel);
					if (panel.className !== "screen-controls")
						expect(
							style.backgroundColor,
							`${theme} ${scheme} ${panel.className}`,
						).toBe(background);
					else
						expect(style.getPropertyValue("--panel").trim()).toBe(
							getComputedStyle(document.documentElement)
								.getPropertyValue("--sheet-bg")
								.trim(),
						);
					expect(style.color, `${theme} ${scheme} ${panel.className}`).toBe(
						foreground,
					);
				}
			}
		}
	} finally {
		table.remove();
		delete document.documentElement.dataset.theme;
		delete document.documentElement.dataset.scheme;
	}
});

it("keeps side panel text readable over the darkest part of the paper texture", async () => {
	const image = new Image();
	image.src = new URL(
		"../../src/ui/assets/panel-parchment.webp",
		import.meta.url,
	).href;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is unavailable");
	context.drawImage(image, 0, 0);
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
	let darkest = 1;
	for (let i = 0; i < pixels.length; i += 4)
		darkest = Math.min(
			darkest,
			luminance([pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0]),
		);
	try {
		for (const theme of [
			"selenized",
			"normal",
			"solarized",
			"gruvbox",
		] as const) {
			applyTheme(document.documentElement, theme, "light", false);
			expect(
				(darkest + 0.05) / (luminance(color("sheet-fg")) + 0.05),
				theme,
			).toBeGreaterThanOrEqual(4.5);
		}
	} finally {
		delete document.documentElement.dataset.theme;
		delete document.documentElement.dataset.scheme;
	}
});

it("saves theme and appearance selections for later controls", () => {
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
	try {
		const control = themeSettings(storage, (text) => text);
		const [theme, scheme] = control.querySelectorAll("select");
		if (!theme || !scheme) throw new Error("theme controls are missing");
		theme.value = "gruvbox";
		theme.dispatchEvent(new Event("change"));
		scheme.value = "dark";
		scheme.dispatchEvent(new Event("change"));
		expect(document.documentElement.dataset.theme).toBe("gruvbox");
		expect(document.documentElement.dataset.scheme).toBe("dark");
		const restored = themeSettings(storage, (text) => text).querySelectorAll(
			"select",
		);
		expect([...restored].map((select) => select.value)).toEqual([
			"gruvbox",
			"dark",
		]);
	} finally {
		delete document.documentElement.dataset.theme;
		delete document.documentElement.dataset.scheme;
	}
});
