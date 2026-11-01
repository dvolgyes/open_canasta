import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import { modernStartMatch } from "../../src/canasta/modern-match";
import { createModernModule, parseModernState } from "../../src/game/modern";
import { SEATS } from "../../src/protocol";
import {
	modernSelectionOptions,
	modernTableView,
} from "../../src/ui/modern-table-model";
import { tableSection } from "../../src/ui/table";
import { CONFIG, TABLE } from "../unit/p2p-fixtures";
import "../../src/ui/style.css";

it("shows why the opening is incomplete and lets the player meld three aces", async () => {
	const started = modernStartMatch(2652, 3);
	if (!started.ok) throw new Error(started.reason);
	const drawn = modernApplyAction(started.match.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const jokers = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["1-JK1", "1-JK0", "0-JK0"],
	});
	if (!jokers.ok) throw new Error(jokers.reason);
	const state = parseModernState(
		{
			...createModernModule(() => 0).initialState(TABLE, CONFIG),
			matches: 1,
			match: { ...started.match, hand: jokers.hand },
			actions: 2,
		},
		TABLE,
	);
	if (!state) throw new Error("invalid modern state");
	const input = {
		config: CONFIG,
		seat: "N" as const,
		state,
		terminal: false,
		present: new Set(SEATS),
		roster: [],
		hostSeat: "N" as const,
		outbox: [],
		failures: [],
		undone: [],
	};
	const actions: unknown[] = [];
	const section = tableSection({
		exit: () => {},
		reload: () => {},
		shareUrl: async () => {},
		act: (action) => actions.push(action),
		selectionOptions: (view, selected) =>
			modernSelectionOptions(input, view, selected),
		call: {
			join: () => {},
			leave: () => {},
			setSwitch: () => {},
			retry: () => {},
		},
	});
	document.body.append(section.element);
	try {
		section.render(modernTableView(input));
		expect(section.element.textContent).toContain(
			"Your opening needs a meld with at least three matching natural cards",
		);
		const opening = [
			...section.element.querySelectorAll<HTMLElement>(".initial-meld"),
		].find((element) => element.textContent?.includes("150 of 125 points"));
		expect(opening?.title).toBe(
			"Only card values count toward the first meld. Cards from the discard pile do not count.",
		);
		for (const id of ["0-AC", "1-AC", "1-AD"]) {
			const card = section.element.querySelector<HTMLElement>(
				`[data-card="${id}"]`,
			);
			if (!card) throw new Error(`missing card ${id}`);
			await userEvent.click(card);
		}
		const meld = [...section.element.querySelectorAll("button")].find(
			(button) => button.textContent?.includes("Lay down a meld"),
		);
		if (!meld) throw new Error("missing meld action");
		await userEvent.click(meld);
		expect(actions).toEqual([
			{ type: "meld", cards: ["0-AC", "1-AC", "1-AD"] },
		]);
	} finally {
		section.dispose();
		section.element.remove();
	}
});
