import { expect, it } from "vitest";
import "../../src/ui/style.css";

it("loads a repeating texture on the playing surface", async () => {
	const board = document.createElement("div");
	board.className = "felt";
	document.body.append(board);
	try {
		const style = getComputedStyle(board);
		const url = /^url\("(.+)"\)$/.exec(style.backgroundImage)?.[1];
		expect(url).toBeDefined();
		expect(style.backgroundRepeat).toBe("repeat");
		const image = new Image();
		image.src = url ?? "";
		await image.decode();
		expect(image.naturalWidth).toBeGreaterThan(0);
	} finally {
		board.remove();
	}
});
