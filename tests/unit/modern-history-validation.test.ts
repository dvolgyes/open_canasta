import { expect, it } from "vitest";
import { parseModernPublicHistory } from "../../src/game/modern-history";

it("validates public transfer counts and rejects malformed or impossible history", () => {
	const history = {
		initialCounts: [13, 13, 13, 13, 0, 0, 0, 0],
		events: [{ player: 0, drawn: 1, gained: [], removed: ["4C"] }],
	};
	expect(parseModernPublicHistory(history)).toEqual(history);
	expect(
		parseModernPublicHistory({ ...history, initialCounts: [13] }),
	).toBeUndefined();
	expect(
		parseModernPublicHistory({
			...history,
			events: [{ player: 8, drawn: 0, gained: [], removed: [] }],
		}),
	).toBeUndefined();
	expect(
		parseModernPublicHistory({
			...history,
			events: [{ player: 0, drawn: 0, gained: [], removed: ["secret"] }],
		}),
	).toBeUndefined();
	expect(
		parseModernPublicHistory({
			...history,
			events: [
				{ player: 4, drawn: 0, gained: [], removed: [], unknownRemoved: 1 },
			],
		}),
	).toBeUndefined();
});
