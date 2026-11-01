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
			"Your opening needs a meld with at least three matching natural cards and no wild cards. Cards from the pile do not count.",
			"Only card values count toward the first meld. Cards from the discard pile do not count.",
			"Complete the pile pickup",
			"Declare a special hand",
			"Table points exclude cards in hand and the going-out bonus.",
		])
			expect(keys.has(text), `${locale}: ${text}`).toBe(true);
	}
});

it("shows modern rule refusals in the player's language", () => {
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
		"threes cannot be discarded",
		"sevens, wild cards, aces, and dead cards cannot be discarded on an empty pile",
		"a wild card can be discarded only when forced or going out",
		"aces may become mixed only when first melded during the opening",
		"at least five naturals are needed before adding wild cards",
		"a meld needs three to seven cards",
		"a mixed meld needs two naturals and at most two wild cards",
		"the side already has an incomplete wild meld",
		"finish the wild meld before adding wild cards elsewhere",
		"a wild meld cannot become a natural meld",
		"the pile can only be taken at the start of a turn",
		"the pile has no eligible top card",
		"select two different matching natural cards",
		"two matching natural cards are required",
		"the pile top must be natural",
		"draw or take the pile before melding",
		"invalid selected cards",
		"a selected card is not in the hand",
		"keep a card for the final discard",
		"no such meld on your side",
		"the cards do not match the existing meld",
		"extend the existing meld of this rank",
		"nothing to undo this turn",
		"the side has already opened",
		"finish drawing and opening before discarding",
		"a special hand must follow a stock draw before the team opens",
		"the cards do not form that special hand",
		"the opening cannot be committed now",
		"undo the latest turn action first",
		"the latest action did not meld cards",
		"the latest meld cannot be retracted one card at a time",
		"no pile opening is in progress",
		"the side cannot go out",
		"a mixed canasta cannot be part of the initial meld",
		"the rank is closed by a canasta",
		"invalid modern hand setup",
		"the deck ran out during the deal",
		"the deck ran out replacing threes",
		"unsupported modern rules version",
		"invalid modern action",
		"unknown modern action",
		"invalid stock",
		"invalid discard",
		"the selected card is not in the hand",
		"invalid bonus or stock",
		"invalid team score",
		"a card appears more than once",
		"multiple incomplete wild melds",
		"duplicate meld rank",
		"add at least one card",
		"the existing meld is incomplete",
		"natural cards must share a permitted rank",
		"a card appears twice in the hand",
		"invalid match seed",
		"the hand cannot be scored",
		"table state is not a modern canasta game",
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
		"Hármast nem lehet eldobni",
		"Üres dobópaklira nem dobható hetes, joker, ász vagy lezárt értékű lap",
		"Joker csak kényszerből vagy kimenetelkor dobható el",
		"Ászok csak a nyitás során való első lerakáskor alkothatnak vegyes meldet",
		"Joker hozzáadásához legalább öt természetes lap kell",
		"Egy meld három-hét lapból állhat",
		"A vegyes meldhez két természetes lap és legfeljebb két joker kell",
		"A párosnak már van hiányos jokermeldje",
		"Más meldhez csak a jokermeld befejezése után adhatsz jokert",
		"Jokermeld nem alakítható természetes melddé",
		"A dobópaklit csak a kör elején lehet felvenni",
		"A dobópakli felső lapja nem vehető fel",
		"Válassz két különböző, azonos értékű természetes lapot",
		"Két azonos értékű természetes lap szükséges",
		"A dobópakli felső lapjának természetesnek kell lennie",
		"Lerakás előtt húzz vagy vedd fel a dobópaklit",
		"Érvénytelen lapokat választottál",
		"Egy kiválasztott lap nincs a kezedben",
		"Tarts meg egy lapot az utolsó dobáshoz",
		"A párosnak nincs ilyen meldje",
		"A lapok nem illenek a meglévő meldhez",
		"A meglévő, azonos értékű meldet bővítsd",
		"Ebben a körben nincs mit visszavonni",
		"A páros már nyitott",
		"Dobás előtt fejezd be a húzást és a nyitást",
		"Speciális kéz csak a húzópakliból húzás után, a páros nyitása előtt jelenthető be",
		"A lapok nem alkotják ezt a speciális kezet",
		"A nyitás most nem véglegesíthető",
		"Először a kör utolsó lépését vond vissza",
		"Az utolsó lépés nem rakott le lapokat",
		"Az utolsó meld nem vonható vissza laponként",
		"Nincs folyamatban dobópakli-felvétel",
		"A páros nem mehet ki",
		"Vegyes kanaszta nem lehet a nyitás része",
		"Ezt az értéket egy kanaszta lezárta",
		"Érvénytelen modern leosztás",
		"Osztás közben elfogyott a pakli",
		"A hármasok cseréje közben elfogyott a pakli",
		"A modern szabályok verziója nem támogatott",
		"Érvénytelen modern lépés",
		"Ismeretlen modern lépés",
		"Érvénytelen húzópakli",
		"Érvénytelen dobás",
		"A kiválasztott lap nincs a kezedben",
		"Érvénytelen bónuszlapok vagy húzópakli",
		"Érvénytelen csapatpontszám",
		"Egy lap többször szerepel",
		"Több hiányos jokermeld van",
		"Egy értékhez több meld tartozik",
		"Adj hozzá legalább egy lapot",
		"A meglévő meld hiányos",
		"A természetes lapok értékének azonosnak és megengedettnek kell lennie",
		"Egy lap kétszer szerepel a kézben",
		"Érvénytelen meccskezdeti véletlen érték",
		"A leosztás nem pontozható",
		"Az asztal állapota nem modern kanasztajáték",
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

it("explains a missing clean opening and allows a natural triple to complete it", () => {
	const started = modernStartMatch(2652, 3);
	if (!started.ok) throw new Error(started.reason);
	const drawn = modernApplyAction(started.match.hand, 0, { type: "draw" });
	if (!drawn.ok) throw new Error(drawn.reason);
	const jokers = modernApplyAction(drawn.hand, 0, {
		type: "meld",
		cards: ["1-JK1", "1-JK0", "0-JK0"],
	});
	if (!jokers.ok) throw new Error(jokers.reason);
	const makeInput = (hand: typeof jokers.hand) => {
		const state = parseModernState(
			{
				...createModernModule(() => 0).initialState(TABLE, CONFIG),
				matches: 1,
				match: { ...started.match, hand },
				actions: 2,
			},
			TABLE,
		);
		if (!state) throw new Error("invalid modern state");
		return {
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
	};
	const input = makeInput(jokers.hand);
	const view = modernTableView(input);
	expect(view.sides[0].initialMeld).toContain("150 of 125 points");
	expect(view.sides[0].initialMeld).toContain(
		"Your opening needs a meld with at least three matching natural cards and no wild cards. Cards from the pile do not count.",
	);
	expect(
		view.options.some((option) => option.action.type === "commit-opening"),
	).toBe(false);
	const aces = ["0-AC", "1-AC", "1-AD"];
	expect(
		modernSelectionOptions(input, view, aces).some(
			(option) => option.action.type === "meld",
		),
	).toBe(true);
	const melded = modernApplyAction(jokers.hand, 0, {
		type: "meld",
		cards: aces,
	});
	if (!melded.ok) throw new Error(melded.reason);
	const completed = modernTableView(makeInput(melded.hand));
	expect(completed.sides[0].initialMeld).not.toContain("Your opening needs");
	expect(
		completed.options.some((option) => option.action.type === "commit-opening"),
	).toBe(true);
	const opened = modernApplyAction(melded.hand, 0, { type: "commit-opening" });
	if (!opened.ok) throw new Error(opened.reason);
	const openedInput = makeInput(opened.hand);
	const openedView = modernTableView(openedInput);
	expect(openedView.sides[0].initialMeld).toBe("");
	const discard = opened.hand.hands[0][0];
	if (!discard) throw new Error("missing discard");
	expect(
		modernSelectionOptions(openedInput, openedView, [discard.id]).some(
			(option) => option.action.type === "discard",
		),
	).toBe(true);
	expect(
		modernApplyAction(opened.hand, 0, { type: "discard", card: discard.id }).ok,
	).toBe(true);
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
