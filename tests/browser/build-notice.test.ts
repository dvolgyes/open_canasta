import { expect, it } from "vitest";
import { englishTranslator } from "../../src/i18n";
import { buildNotice } from "../../src/ui/build-notice";

it("shows a peer build report without reloading until the player chooses", () => {
	let reloads = 0;
	const notice = buildNotice(englishTranslator, () => {
		reloads++;
	});
	expect(notice.element.hidden).toBe(true);
	notice.update("9999-12-31T23:59:59Z");
	expect(notice.element.hidden).toBe(false);
	expect(reloads).toBe(0);
	notice.element.querySelector("button")?.click();
	expect(reloads).toBe(1);
	notice.update(undefined);
	expect(notice.element.hidden).toBe(true);
});
