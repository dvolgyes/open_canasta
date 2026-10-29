import { expect, it } from "vitest";
import { englishTranslator } from "../../src/i18n";
import { pageTitle } from "../../src/ui/page-title";

it("identifies the host, bot, and active turn in the tab title", () => {
	expect(
		pageTitle(englishTranslator, {
			name: "Alex",
			seat: "W",
			turn: false,
			host: true,
			bot: false,
		}),
	).toBe("Open Canasta: Alex (W, host)");
	expect(
		pageTitle(englishTranslator, {
			name: "Alex",
			seat: "W",
			turn: true,
			host: true,
			bot: true,
		}),
	).toBe("TURN - Open Canasta: bot (W, host)");
	expect(
		pageTitle(englishTranslator, {
			name: "Bee",
			seat: "N",
			turn: false,
			host: false,
			bot: false,
		}),
	).toBe("Open Canasta: Bee (N)");
});
