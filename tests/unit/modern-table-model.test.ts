import { expect, it } from "vitest";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import {
	modernSettleHand,
	modernStartMatch,
} from "../../src/canasta/modern-match";
import { modernScoreHand } from "../../src/canasta/modern-special-scoring";
import { tableSeat } from "../../src/game/canasta";
import { createModernModule, parseModernState } from "../../src/game/modern";
import { catalogKeys, translator } from "../../src/i18n";
import { SEATS } from "../../src/protocol";
import { RULE_VARIANT_TEXTS } from "../../src/ui/model";
import {
	modernSelectionOptions,
	modernTableView,
} from "../../src/ui/modern-table-model";
import { CONFIG, TABLE } from "./p2p-fixtures";

it("asks absent players to join the modern lobby", () => {
	const state = parseModernState(
		createModernModule(() => 0).initialState(TABLE, CONFIG),
		TABLE,
	);
	if (!state) throw new Error("invalid modern lobby");
	const view = modernTableView({
		config: CONFIG,
		seat: "S",
		state,
		terminal: false,
		present: new Set(["N", "S"]),
		roster: [],
		hostSeat: "N",
		outbox: [],
		failures: [],
		undone: [],
	});
	expect(view.prompt).toContain("to join");
});

it("provides the modern rules hints and controls in each supported language", () => {
	for (const locale of [
		"de",
		"hu",
		"no",
		"es",
		"pt",
		"fr",
		"it",
		"nl",
	] as const) {
		const keys = new Set(catalogKeys(locale));
		for (const text of [
			RULE_VARIANT_TEXTS.classic.summary,
			RULE_VARIANT_TEXTS.modern.name,
			RULE_VARIANT_TEXTS.modern.summary,
			"Undo the last action",
			"Complete the opening",
			"Complete the pile pickup",
			"Declare a special hand",
			"Table points exclude cards in hand and the going-out bonus.",
		])
			expect(keys.has(text), `${locale}: ${text}`).toBe(true);
	}
});

it("shows modern opening and going-out refusals in the player's language", () => {
	const started = modernStartMatch(7, 0);
	if (!started.ok) throw new Error(started.reason);
	const state = parseModernState(
		{
			...createModernModule(() => 0).initialState(TABLE, CONFIG),
			matches: 1,
			match: started.match,
		},
		TABLE,
	);
	if (!state) throw new Error("invalid modern state");
	const reasons = [
		"opening needs a clean triple",
		"opening points below minimum",
		"sevens must be natural",
		"an ace, seven, or wild meld remains incomplete",
		"the side needs two canastas to go out",
	];
	const view = modernTableView({
		config: CONFIG,
		seat: "N",
		state,
		terminal: false,
		present: new Set(SEATS),
		roster: [],
		hostSeat: "N",
		outbox: [],
		undone: [],
		t: translator("hu"),
		failures: reasons.map((reason, index) => ({
			id: `c${index}`,
			payload: {
				type: "action",
				hand: started.match.handNo,
				action: { type: "draw" },
			},
			status: "rejected" as const,
			reason,
		})),
	});
	expect(view.lines.map((line) => line.reason)).toEqual([
		"A nyitáshoz tiszta hármas kell",
		"A nyitás pontszáma nem éri el a minimumot",
		"A hetesekhez nem használható joker",
		"Egy ász-, hetes- vagy jokermeld még hiányos",
		"A kimenetelhez a párosnak két kanaszta kell",
	]);
	for (const locale of [
		"de",
		"hu",
		"no",
		"es",
		"pt",
		"fr",
		"it",
		"nl",
	] as const)
		for (const reason of reasons)
			expect(catalogKeys(locale), `${locale}: ${reason}`).toContain(reason);
});

it("shows a modern deal, the acting player's hand, and its legal draw", () => {
	const started = modernStartMatch(7, 0);
	if (!started.ok) throw new Error(started.reason);
	const state = parseModernState(
		{
			...createModernModule(() => 0).initialState(TABLE, CONFIG),
			matches: 1,
			match: started.match,
		},
		TABLE,
	);
	if (!state) throw new Error("invalid modern state");
	const seat = tableSeat(started.match.hand.turn);
	const view = modernTableView({
		config: CONFIG,
		seat,
		state,
		terminal: false,
		present: new Set(SEATS),
		roster: [],
		hostSeat: "N",
		outbox: [],
		failures: [],
		undone: [],
	});
	expect(view.phase).toBe("play");
	expect(view.target).toBe(8500);
	expect(view.sides[0].handPoints).toContain("N-S");
	expect(view.sides[1].handPoints).toContain("E-W");
	expect(view.sides[0].handSum).toContain("N-S");
	expect(view.sides[1].handSum).toContain("E-W");
	expect(view.own.map((card) => card.id)).toEqual(
		started.match.hand.hands[started.match.hand.turn].map((card) => card.id),
	);
	expect(view.options.some((option) => option.action.type === "draw")).toBe(
		true,
	);
});

it("offers only engine-approved actions for the selected cards", () => {
	const started = modernStartMatch(9, 0);
	if (!started.ok) throw new Error(started.reason);
	const actor = started.match.hand.turn;
	const drawn = modernApplyAction(started.match.hand, actor, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const state = parseModernState(
		{
			...createModernModule(() => 0).initialState(TABLE, CONFIG),
			matches: 1,
			match: { ...started.match, hand: drawn.hand },
			actions: 1,
		},
		TABLE,
	);
	if (!state) throw new Error("invalid modern state");
	const input = {
		config: CONFIG,
		seat: tableSeat(actor),
		state,
		terminal: false,
		present: new Set(SEATS),
		roster: [],
		hostSeat: "N" as const,
		outbox: [],
		failures: [],
		undone: [],
	};
	const view = modernTableView(input);
	for (const card of drawn.hand.hands[actor]) {
		const offered = modernSelectionOptions(input, view, [card.id]);
		for (const item of offered)
			expect(
				modernApplyAction(
					drawn.hand,
					actor,
					item.action as import("../../src/canasta/modern-hand").ModernAction,
				).ok,
			).toBe(true);
	}
});

it("shows the modern scoring breakdown after a complete hand", () => {
	const started = modernStartMatch(3, 0);
	if (!started.ok) throw new Error(started.reason);
	let hand = started.match.hand;
	for (let i = 0; i < 200 && !hand.outcome; i++) {
		const action =
			hand.phase === "draw"
				? { type: "draw" as const }
				: hand.hands[hand.turn]
						.map((card) => ({ type: "discard" as const, card: card.id }))
						.find(
							(candidate) => modernApplyAction(hand, hand.turn, candidate).ok,
						);
		if (!action) throw new Error("no legal action");
		const step = modernApplyAction(hand, hand.turn, action);
		if (!step.ok) throw new Error(step.reason);
		hand = step.hand;
	}
	const settled = modernSettleHand({ ...started.match, hand });
	if (!settled.ok) throw new Error(settled.reason);
	const score = modernScoreHand(hand);
	if (!score) throw new Error("no score");
	const state = parseModernState(
		{
			...createModernModule(() => 0).initialState(TABLE, CONFIG),
			matches: 1,
			match: settled.match,
		},
		TABLE,
	);
	if (!state) throw new Error("invalid settled state");
	const view = modernTableView({
		config: CONFIG,
		seat: "S",
		state,
		terminal: false,
		present: new Set(SEATS),
		roster: [],
		hostSeat: "N",
		outbox: [],
		failures: [],
		undone: [],
	});
	expect(view.phase).toBe("hand-over");
	expect(
		view.scoring?.rows.find((row) => row.label === "Hand score")?.values,
	).toEqual([score[0].total, score[1].total]);
	expect(
		view.scoring?.rows.find((row) => row.label === "Match score")?.values,
	).toEqual(settled.match.scores);
});
