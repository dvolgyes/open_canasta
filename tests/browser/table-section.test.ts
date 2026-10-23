import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { Action, MatchState } from "../../src/canasta";
import { applyAction, scoreHand, startMatch } from "../../src/canasta";
import { type CanastaState, tableSeat } from "../../src/game/canasta";
import {
	catalogKeys,
	type Locale,
	type Translate,
	translator,
} from "../../src/i18n";
import { PROTOCOL_VERSION, SEATS } from "../../src/protocol";
import type { RosterRow } from "../../src/ui/model";
import "../../src/ui/style.css";
import { type TableHandlers, tableSection } from "../../src/ui/table";
import {
	type CardView,
	type MeldView,
	optionsFor,
	type SideView,
	type TableView,
	type TableViewInput,
	tableView,
} from "../../src/ui/table-model";
import { pairPickupMatch } from "../unit/canasta-fixtures";

const sections: HTMLElement[] = [];

afterEach(() => {
	for (const element of sections.splice(0)) element.remove();
});

/** The view of the seat that takes the first turn of a new match; another seat hosts. */
function firstTurnView(): TableView {
	return turnView(startMatch(7), 0);
}

/** The match after the seat on turn drew from the stock, so it can meld and discard. */
function afterDraw(): MatchState {
	const match = startMatch(7);
	const step = applyAction(match.hand, match.hand.turn, { type: "draw" });
	if (!step.ok) throw new Error(step.reason);
	return { ...match, hand: step.hand };
}

/** The view of the seat on turn; another seat hosts. */
function turnView(
	match: MatchState,
	actions: number,
	overrides: Partial<TableViewInput> = {},
): TableView {
	const seat = tableSeat(match.hand.turn);
	const host = SEATS.find((item) => item !== seat) ?? "N";
	const state: CanastaState = {
		v: PROTOCOL_VERSION,
		tableId: "table-1",
		game: "canasta",
		messages: 0,
		matches: 1,
		match,
		actions,
		reset: null,
		media: {},
	};
	const roster: RosterRow[] = SEATS.map((item) => ({
		seat: item,
		label: item,
		host: item === host,
		you: item === seat,
		state: "online",
		releasable: false,
	}));
	return tableView({
		config: { names: { N: "Ann", E: "Ben", S: "Cy", W: "Dee" } },
		seat,
		state,
		terminal: false,
		present: new Set(SEATS),
		roster,
		hostSeat: host,
		outbox: [],
		failures: [],
		undone: [],
		...overrides,
	});
}

function mount(
	acted: Action[],
	t?: Translate,
	extra: Partial<TableHandlers> = {},
) {
	const section = tableSection(
		{
			...extra,
			exit: () => {},
			shareUrl: async () => {},
			act: (action) => acted.push(action),
			selectionOptions: (view, selected) => optionsFor(view.options, selected),
			call: {
				join: () => {},
				leave: () => {},
				setSwitch: () => {},
				retry: () => {},
			},
		},
		t,
	);
	sections.push(section.element);
	document.body.append(section.element);
	return section;
}

describe("table section", () => {
	it("keeps the hand and the action buttons when a new view shows the same position", () => {
		const acted: Action[] = [];
		const section = mount(acted);
		const view = firstTurnView();
		expect(view.yourTurn).toBe(true);
		section.render(view);
		const draw = section.element.querySelector('[data-testid="action-draw"]');
		const card = section.element.querySelector(".own-hand button.card");
		expect(draw).not.toBeNull();
		expect(card).not.toBeNull();

		// A beat or a roster change renders the same position again, as a new object.
		section.render(structuredClone(view));
		expect(draw?.isConnected).toBe(true);
		expect(card?.isConnected).toBe(true);

		(draw as HTMLButtonElement).click();
		expect(acted.map((action) => action.type)).toEqual(["draw"]);
	});

	it("keeps the viewer's autoplay control when a new view shows the same seat", () => {
		const section = mount([]);
		const view = firstTurnView();
		section.render(view);
		section.setPlayerAutoplay(true, false, false, "");
		const control = () =>
			section.element.querySelector('[data-testid="player-autoplay-toggle"]');
		const before = control();
		expect(before).not.toBeNull();
		section.render(structuredClone(view));
		expect(control()).toBe(before);
		section.setPlayerAutoplay(true, true, false, "");
		expect(control()?.textContent).toBe("Stop autoplay");
	});

	it("shows a selected card at once, also after a render of the same position", () => {
		const section = mount([]);
		const view = firstTurnView();
		section.render(view);
		const pressed = () =>
			section.element
				.querySelector(".own-hand button.card")
				?.getAttribute("aria-pressed");
		section.element
			.querySelector<HTMLButtonElement>(".own-hand button.card")
			?.click();
		expect(pressed()).toBe("true");
		section.render(structuredClone(view));
		expect(pressed()).toBe("true");
	});

	it("shows the cards of an action as cards with a suit symbol, red for hearts and diamonds", () => {
		const section = mount([], translator("hu"));
		section.render(turnView(afterDraw(), 1, { t: translator("hu") }));
		const card = section.element.querySelector<HTMLButtonElement>(
			".own-hand button.card",
		);
		card?.click();
		const discard = section.element.querySelector(
			'[data-testid="action-discard"]',
		);
		const pip = discard?.querySelector(".pip");
		expect(discard?.textContent).toBe(`Eldobás: ${card?.textContent}`);
		expect(pip?.textContent).toBe(card?.textContent);
		expect(pip?.textContent).toMatch(/^(\d+|[JQKA])[♣♦♥♠]$|^Joker$/);
		expect(pip?.classList.contains("red")).toBe(
			/[♦♥]/.test(card?.textContent ?? ""),
		);
	});

	it("shows the seat letters and the side names in the viewer's language, with whose side each is", () => {
		const hu = translator("hu");
		const section = mount([], hu);
		const view = turnView(afterDraw(), 1, { t: hu });
		section.render(view);
		const avatars = [
			...section.element.querySelectorAll<HTMLElement>(".tile .avatar"),
		].map((avatar) => avatar.textContent);
		expect(avatars).toHaveLength(3);
		for (const letter of avatars)
			expect(["É", "K", "D", "Ny"]).toContain(letter);
		const texts = (selector: string): (string | null)[] =>
			[...section.element.querySelectorAll<HTMLElement>(selector)].map(
				(node) => node.textContent,
			);
		const expected = view.sides[0]?.mine
			? ["É-D (miénk)", "K-Ny (övék)"]
			: ["É-D (övék)", "K-Ny (miénk)"];
		expect(texts(".side-title").map((text) => text?.split(":")[0])).toEqual(
			expected,
		);
		expect(texts(".score-strip .side-label")).toEqual(expected);
	});

	it("shows the opponents' melds above the viewer's, each meld as columns of at most 8 cards", () => {
		const card = (index: number): CardView => ({
			id: `7C-${index}`,
			rank: "7",
			suit: "C",
			text: "7♣",
		});
		const meld = (id: string, size: number): MeldView => ({
			id,
			rank: "7",
			cards: Array.from({ length: size }, (_, index) => card(index)),
			canasta: size >= 7,
		});
		const base = turnView(afterDraw(), 1);
		for (const mineFirst of [true, false]) {
			const side = (index: 0 | 1): SideView => ({
				...base.sides[index],
				mine: (index === 0) === mineFirst,
				melds: [meld(`m${index}a`, 3), meld(`m${index}b`, 11)],
			});
			const sides = [side(0), side(1)] as const;
			const section = mount([]);
			section.render({ ...base, sides });
			const blocks = [
				...section.element.querySelectorAll<HTMLElement>(".side-block"),
			];
			expect(blocks.map((block) => block.dataset.mine)).toEqual([
				"false",
				"true",
			]);
			const [theirs, ours] = blocks.map((block) =>
				block.getBoundingClientRect(),
			);
			expect(theirs?.bottom).toBeLessThanOrEqual(ours?.top ?? 0);
			const long = section.element.querySelector('[data-meld="m0b"]');
			const columns = [...(long?.querySelectorAll(".meld-column") ?? [])];
			expect(
				columns.map((column) => column.querySelectorAll(".pip").length),
			).toEqual([8, 3]);
			const pips = [...(columns[0]?.querySelectorAll(".pip") ?? [])].map(
				(pip) => pip.getBoundingClientRect(),
			);
			for (const [index, rect] of pips.entries()) {
				const above = pips[index - 1];
				if (above !== undefined)
					expect(rect.top).toBeGreaterThanOrEqual(above.bottom - 1);
			}
			const second = columns[1]?.getBoundingClientRect();
			expect(second?.left).toBeGreaterThanOrEqual(
				columns[0]?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
			);
			section.element.remove();
		}
	});

	it("shows a side's first meld minimum until it melds, with the counting rule", () => {
		const base = turnView(afterDraw(), 1);
		const sides = [
			{ ...base.sides[0], initialMeld: "First meld: 15 of 50 points" },
			{ ...base.sides[1], initialMeld: "" },
		] as const;
		const section = mount([]);
		section.render({ ...base, sides });
		const lines = [
			...section.element.querySelectorAll<HTMLElement>(".initial-meld"),
		];
		const shown = lines.filter((line) => line.getClientRects().length > 0);
		expect(shown.map((line) => line.textContent)).toEqual([
			"First meld: 15 of 50 points",
		]);
		expect(shown[0]?.title).toContain("only the top card counts");
		section.element.remove();
	});

	it("frames new cards in gold and cards that fit a meld in red, each with a mark and a title", () => {
		const base = turnView(afterDraw(), 1);
		const [first, second] = base.own;
		if (first === undefined || second === undefined)
			throw new Error("no cards");
		const section = mount([]);
		section.render({ ...base, taken: [first.id], fits: [second.id] });
		const card = (id: string) =>
			section.element.querySelector<HTMLElement>(`[data-card="${id}"]`);
		expect(card(first.id)?.className).toContain("taken");
		expect(card(first.id)?.title).toBe("New this turn");
		expect(card(second.id)?.className).toContain("fits");
		expect(card(second.id)?.title).toBe("Fits a meld of your side");
		const frame = (id: string) => getComputedStyle(card(id) as Element);
		expect(frame(second.id).borderTopColor).not.toBe(
			frame(first.id).borderTopColor,
		);
		expect(
			getComputedStyle(card(second.id) as Element, "::after").content,
		).not.toBe("none");
		section.element.remove();
	});

	it("shows the card that freezes the pile crosswise, under the top card or as the top card", () => {
		const base = firstTurnView();
		const wild: CardView = { id: "0-2D", rank: "2", suit: "D", text: "2♦" };
		const top: CardView = { id: "0-4C", rank: "4", suit: "C", text: "4♣" };
		const section = mount([]);
		const pile = () => section.element.querySelector(".pile-top");
		const crosswise = () =>
			section.element.querySelector<HTMLElement>(".pile-top .crosswise");

		section.render({
			...base,
			pile: { top, count: 3, frozen: "Frozen", crosswise: wild },
		});
		expect(pile()?.textContent).toBe("2♦4♣");
		expect(crosswise()?.textContent).toBe("2♦");
		expect(crosswise()?.title).toBe("Crosswise: this card freezes the pile");
		expect(getComputedStyle(crosswise() as Element).transform).not.toBe("none");

		section.render({
			...base,
			pile: { top: wild, count: 3, frozen: "Frozen", crosswise: wild },
		});
		expect(pile()?.textContent).toBe("2♦");
		expect(crosswise()?.textContent).toBe("2♦");

		section.render({
			...base,
			pile: { top, count: 3, frozen: undefined, crosswise: undefined },
		});
		expect(crosswise()).toBeNull();
		section.element.remove();
	});

	it("tells that gold cards from the pile count 0 toward the first meld", () => {
		const base = turnView(afterDraw(), 1);
		const [first] = base.own;
		if (first === undefined) throw new Error("no cards");
		const section = mount([]);
		section.render({ ...base, taken: [first.id], takenCountsZero: true });
		const card = section.element.querySelector<HTMLElement>(
			`[data-card="${first.id}"]`,
		);
		expect(card?.className).toContain("taken");
		expect(card?.title).toBe("From the pile: counts 0 toward the first meld");
		section.element.remove();
	});

	it("frames the cards that can make a new meld like the cards that fit a meld, with their own title", () => {
		const base = turnView(afterDraw(), 1);
		const [first, second] = base.own;
		if (first === undefined || second === undefined)
			throw new Error("no cards");
		const section = mount([]);
		section.render({ ...base, fits: [first.id], meldable: [second.id] });
		const card = (id: string) =>
			section.element.querySelector<HTMLElement>(`[data-card="${id}"]`);
		expect(card(second.id)?.className).toContain("fits");
		expect(card(second.id)?.title).toBe("Can make a new meld");
		const frame = (id: string) => getComputedStyle(card(id) as Element);
		expect(frame(second.id).borderTopColor).toBe(
			frame(first.id).borderTopColor,
		);
		section.element.remove();
	});

	it("shows the red threes of a side as cards, with no counter", () => {
		const base = turnView(afterDraw(), 1);
		const [card] = base.own;
		if (card === undefined) throw new Error("no cards");
		const section = mount([]);
		section.render({
			...base,
			sides: [{ ...base.sides[0], redThrees: [card, card] }, base.sides[1]],
		});
		const lines = [
			...section.element.querySelectorAll<HTMLElement>(".red-threes"),
		];
		expect(lines).toHaveLength(2);
		expect(lines[0]?.querySelectorAll(".red-three-cards .pip")).toHaveLength(2);
		for (const line of lines) expect(line.textContent).not.toContain("Red 3s");
		section.element.remove();
	});

	it("colours the heart of the red 3s in the points of a side red", () => {
		const base = turnView(afterDraw(), 1);
		const [first, second] = base.sides;
		const section = mount([]);
		section.render({
			...base,
			sides: [{ ...first, handPoints: "N-S: 185 (+800 ♥)" }, second],
		});
		const title = section.element.querySelector(".side-block .side-title");
		expect(title?.textContent).toBe("N-S: 185 (+800 ♥)");
		const heart = [...(title?.querySelectorAll("span") ?? [])].find(
			(span) => span.textContent === "♥",
		);
		// The colour of the red suits, --red-suit.
		expect(heart && getComputedStyle(heart).color).toBe("rgb(192, 38, 45)");
		section.element.remove();
	});

	it("shows the points of each side in this hand as the title of its melds, before its red 3s, with the parts as tooltip", () => {
		const base = turnView(afterDraw(), 1);
		const [first, second] = base.sides;
		const section = mount([]);
		section.render({
			...base,
			sides: [
				{ ...first, handPoints: "first 10", handPointsDetail: "first parts" },
				{
					...second,
					handPoints: "second 20",
					handPointsDetail: "second parts",
				},
			],
		});
		const titles = [
			...section.element.querySelectorAll<HTMLElement>(
				".side-block .side-title",
			),
		];
		expect(titles.map((title) => title.textContent)).toEqual([
			"first 10",
			"second 20",
		]);
		expect(titles.map((title) => title.title)).toEqual([
			"first parts",
			"second parts",
		]);
		for (const title of titles) {
			const block = title.parentElement;
			const children = [...(block?.children ?? [])];
			expect(
				children.indexOf(title) <
					children.findIndex((child) => child.className === "red-threes"),
			).toBe(true);
		}
		expect(
			section.element.querySelector(".seat-bottom")?.textContent,
		).not.toContain("first 10");
		section.element.remove();
	});

	it("offers to take the pile with a pair from the hand before any card is selected", () => {
		const acted: Action[] = [];
		const section = mount(acted);
		section.render(turnView(pairPickupMatch(), 0));
		const pickup = section.element.querySelector<HTMLButtonElement>(
			'[data-testid="action-takePile"]',
		);
		expect(pickup).not.toBeNull();
		expect(
			section.element.querySelector(".own-hand button.card.selected"),
		).toBeNull();
		pickup?.click();
		expect(acted.map((action) => action.type)).toEqual(["takePile"]);
	});

	it("frames the cards that this turn drew or took, and only those", () => {
		const hu = translator("hu");
		const section = mount([], hu);
		const match = afterDraw();
		const view = turnView(match, 1, { t: hu });
		const drawnId = match.hand.turnTaken?.[0];
		expect(drawnId).toBeDefined();
		section.render(view);
		const cards = [
			...section.element.querySelectorAll<HTMLButtonElement>(
				".own-hand button.card",
			),
		];
		const marked = cards.filter((card) => card.classList.contains("taken"));
		expect(marked.map((card) => card.dataset.card)).toEqual([drawnId]);
		expect(marked[0]?.title).toBe("Új ebben a körben");
		const plain = cards.find((card) => !card.classList.contains("taken"));
		expect(plain).toBeDefined();
		const frame = (card: Element | undefined) =>
			card === undefined ? "" : getComputedStyle(card).boxShadow;
		expect(frame(marked[0])).not.toBe(frame(plain));
		expect(getComputedStyle(marked[0] as Element, "::after").content).not.toBe(
			"none",
		);
	});

	it("shows who went out and the hand score over the felt until the next hand", () => {
		const section = mount([]);
		const drawn = afterDraw();
		const summary = () =>
			section.element.querySelector<HTMLElement>(
				'[data-testid="hand-summary"]',
			);
		section.render(turnView(drawn, 1));
		expect(summary()?.checkVisibility()).toBe(false);

		const hand = {
			...drawn.hand,
			outcome: { kind: "out" as const, seat: 1 as const, concealed: false },
		};
		const [first, second] = scoreHand(hand);
		const ended = {
			...drawn,
			hand,
			settled: true,
			scores: [first.total, second.total] as const,
		};
		section.render(turnView(ended, 2, { seat: "E" }));
		section.setCountdown(7);
		const shown = summary();
		expect(shown?.checkVisibility()).toBe(true);
		expect(shown?.closest(".felt")).not.toBeNull();
		expect(shown?.querySelector("h3")?.textContent).toBe("Ben (E-W) went out.");
		const cells = (row: Element | undefined) =>
			[...(row?.children ?? [])].map((cell) => cell.textContent);
		const rows = [...(shown?.querySelectorAll("tr") ?? [])];
		expect(cells(rows[0])).toEqual(["", "N-S (theirs)", "E-W (ours)"]);
		expect(rows.map(cells).find((row) => row[0] === "Hand score")).toEqual([
			"Hand score",
			String(first.total),
			String(second.total),
		]);
		expect(shown?.textContent).toContain("Next hand in 7 seconds");
	});

	it("announces the result of the match over the felt and offers a new game", () => {
		let newGames = 0;
		const section = mount([], undefined, {
			newGame: () => {
				newGames += 1;
			},
		});
		const drawn = afterDraw();
		const summary = () =>
			section.element.querySelector<HTMLElement>(
				'[data-testid="hand-summary"]',
			);
		const newGame = () =>
			summary()?.querySelector<HTMLButtonElement>('[data-testid="new-game"]');
		const ended = {
			...drawn,
			hand: {
				...drawn.hand,
				outcome: { kind: "out" as const, seat: 1 as const, concealed: false },
			},
			settled: true,
		};
		section.render(turnView(ended, 2, { seat: "E" }));
		expect(newGame()?.checkVisibility()).toBeFalsy();

		section.render(turnView({ ...ended, winner: 1 }, 2, { seat: "E" }));
		expect(summary()?.checkVisibility()).toBe(true);
		expect(summary()?.querySelector(".winner")?.textContent).toBe(
			"Your side (E-W) won the match.",
		);
		expect(newGame()?.checkVisibility()).toBe(true);
		newGame()?.click();
		expect(newGames).toBe(1);
	});

	it("always orders the hand by rank, with no control for another order", () => {
		const section = mount([]);
		const view = firstTurnView();
		section.render(view);
		const ranks = [
			...section.element.querySelectorAll<HTMLElement>(".own-hand button.card"),
		].map(
			(node) => view.own.find((card) => card.id === node.dataset.card)?.rank,
		);
		const ranksInOrder = [
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
			"J",
			"Q",
			"K",
			"A",
			"2",
			"JK",
		];
		const place = (rank = "") => ranksInOrder.indexOf(rank);
		expect(ranks.length).toBe(view.own.length);
		expect(ranks.map(place)).toEqual(ranks.map(place).sort((a, b) => a - b));
		expect(section.element.querySelector(".sort-toggle")).toBeNull();
		expect(section.element.textContent).not.toMatch(/Sort by/);
	});

	it("asks only for messages that every language translates", () => {
		const asked = new Set<string>();
		const english = translator("en");
		const t: Translate = (message, values) => {
			asked.add(message);
			return english(message, values);
		};
		const section = mount([], t);
		const drawn = afterDraw();
		const refused = {
			id: "c1",
			payload: { type: "action", hand: 1, action: { type: "draw" } },
			status: "rejected" as const,
		};
		section.render(turnView(startMatch(7), 0, { t }));
		section.render(
			turnView(startMatch(7), 0, {
				t,
				failures: [
					refused,
					{ ...refused, id: "c2", reason: "draw before melding" },
				],
			}),
		);
		section.render(turnView(drawn, 1, { t }));
		section.element
			.querySelector<HTMLButtonElement>(".own-hand button.card")
			?.click();
		section.element.querySelector<HTMLButtonElement>(".sort-toggle")?.click();
		section.setBotControls(true, ["E", "W"]);
		section.setPlayerAutoplay(true, false, false, "");
		section.setPlayerAutoplay(true, true, false, "");
		section.setCountdown(1);
		section.setCountdown(5);
		const ended = {
			...drawn,
			hand: { ...drawn.hand, outcome: { kind: "stock" as const } },
		};
		section.render(turnView(ended, 2, { t }));
		section.render(turnView({ ...ended, winner: 0 }, 2, { t }));
		expect(asked.size).toBeGreaterThan(20);
		const locales = [
			"de",
			"hu",
			"no",
			"es",
			"pt",
			"fr",
			"it",
			"nl",
		] as const satisfies readonly Exclude<Locale, "en">[];
		for (const locale of locales) {
			const known = new Set(catalogKeys(locale));
			expect(
				[...asked].filter((message) => !known.has(message)),
				locale,
			).toEqual([]);
		}
	});
});

/** The number of text lines in a node: the distinct tops of its text's line boxes. */
function lineCount(node: Element): number {
	const range = document.createRange();
	range.selectNodeContents(node);
	return new Set(
		[...range.getClientRects()]
			.filter((rect) => rect.width > 0)
			.map((rect) => Math.round(rect.top)),
	).size;
}

function box(root: HTMLElement, selector: string): DOMRect {
	const node = root.querySelector(selector);
	if (!node?.checkVisibility()) throw new Error(`${selector} is not displayed`);
	return node.getBoundingClientRect();
}

/** Each box's vertical middle is inside the other boxes' vertical extent. */
function expectOneRow(rects: readonly DOMRect[]): void {
	for (const rect of rects)
		for (const other of rects) {
			const middle = rect.top + rect.height / 2;
			expect(middle).toBeGreaterThanOrEqual(other.top);
			expect(middle).toBeLessThanOrEqual(other.bottom);
		}
}

/**
 * Each part is inside the felt. Here the felt is in the body, without the page's padding, so its phone margin
 * puts it wider than the window; the end-to-end layout test checks the window.
 */
function expectInFelt(root: HTMLElement, selectors: readonly string[]): void {
	const felt = box(root, ".felt");
	for (const selector of selectors) {
		const rect = box(root, selector);
		expect(rect.left, selector).toBeGreaterThanOrEqual(felt.left - 0.5);
		expect(rect.right, selector).toBeLessThanOrEqual(felt.right + 0.5);
	}
}

/** Sets the viewport and waits for the window's resize event. */
async function resizeTo(width: number, height: number): Promise<void> {
	if (innerWidth === width && innerHeight === height) return;
	const resized = new Promise((resolve) =>
		addEventListener("resize", resolve, { once: true }),
	);
	await page.viewport(width, height);
	await resized;
}

describe("table section on a 320 px phone, in the compact form", () => {
	beforeAll(() => resizeTo(320, 568));
	afterAll(() => resizeTo(414, 896));

	it("puts the stock left of the opponents' melds and the discard pile right of them, each with its label above its cards", () => {
		const section = mount([]);
		section.setForm("compact");
		const view = turnView(afterDraw(), 1);
		expect(view.pile.count).toBeGreaterThan(0);
		section.render({
			...view,
			pile: {
				...view.pile,
				frozen: "Frozen for both sides: a wild card is in the pile",
				crosswise: { id: "JK-0", rank: "JK", suit: null, text: "Joker" },
			},
		});
		const root = section.element;
		const theirs = box(root, ".centre > .side-block:nth-child(2)");
		const ours = box(root, ".centre > .side-block:nth-child(3)");
		const stock = box(root, ".stock");
		const pile = box(root, ".pile");
		expect(stock.right).toBeLessThanOrEqual(theirs.left);
		expect(pile.left).toBeGreaterThanOrEqual(theirs.right);
		for (const rect of [stock, pile]) {
			expect(Math.abs(rect.top - theirs.top)).toBeLessThanOrEqual(1);
			expect(rect.bottom).toBeLessThanOrEqual(ours.top);
		}
		expect(box(root, ".stock .label").bottom).toBeLessThanOrEqual(
			box(root, ".stock-count").top + 0.5,
		);
		const pileLabel = box(root, ".pile .label");
		for (const part of [".pile-top", ".pile-count", ".pile-top .crosswise"])
			expect(pileLabel.bottom, part).toBeLessThanOrEqual(
				box(root, part).top + 0.5,
			);
		// The crosswise card is turned in its layout too, so it covers neither the count nor the top card.
		const crosswise = box(root, ".pile-top .crosswise");
		for (const part of [".pile-count", ".pile-top .pip:not(.crosswise)"]) {
			const rect = box(root, part);
			const width =
				Math.min(crosswise.right, rect.right) -
				Math.max(crosswise.left, rect.left);
			const height =
				Math.min(crosswise.bottom, rect.bottom) -
				Math.max(crosswise.top, rect.top);
			expect(Math.min(width, height), part).toBeLessThanOrEqual(0.5);
		}
		expect(crosswise.bottom).toBeLessThanOrEqual(pile.bottom);
		const frozen = box(root, ".pile-frozen");
		expect(frozen.top).toBeGreaterThanOrEqual(pile.bottom);
		expect(frozen.left).toBeGreaterThanOrEqual(theirs.right - 0.5);
		expectOneRow([box(root, ".seat-left"), ours, box(root, ".seat-right")]);
		expectInFelt(root, [
			".stock",
			".pile",
			".pile-frozen",
			".seat-left",
			".seat-right",
		]);
	});

	it("shows a side seat narrow: the seat over the name, the switch word by word, the backs in a column; the partner in one row", () => {
		const section = mount([]);
		section.setForm("compact");
		section.setBotControls(true, []);
		section.render(turnView(afterDraw(), 1));
		const root = section.element;
		const rem = Number.parseFloat(
			getComputedStyle(document.documentElement).fontSize,
		);
		for (const place of [".seat-left", ".seat-right"]) {
			expect(box(root, place).width).toBeLessThanOrEqual(5 * rem);
			const name = root.querySelector<HTMLElement>(
				`${place} .seat-label .name`,
			);
			expect(name?.innerText).not.toMatch(/-/);
			expect(box(root, `${place} .seat-letter`).bottom).toBeLessThanOrEqual(
				box(root, `${place} .player-name`).top + 0.5,
			);
			const control = root.querySelector(`${place} .tile-bot-control`);
			expect(control?.textContent).toMatch(/^🤖 Switch to bot$/);
			expect(control ? lineCount(control) : 0).toBe(4);
			const backs = [...root.querySelectorAll(`${place} .card-back`)].map(
				(back) => back.getBoundingClientRect(),
			);
			expect(backs.length).toBeGreaterThan(1);
			for (const [index, back] of backs.entries()) {
				expect(Math.abs(back.left - (backs[0]?.left ?? 0))).toBeLessThanOrEqual(
					0.5,
				);
				const above = backs[index - 1];
				if (above !== undefined) expect(back.top).toBeGreaterThan(above.top);
			}
		}
		const label = box(root, ".seat-top .seat-label");
		const control = box(root, ".seat-top .tile-bot-control");
		const backs = box(root, ".seat-top .backs");
		expect(label.right).toBeLessThanOrEqual(control.left);
		expect(control.right).toBeLessThanOrEqual(backs.left);
		expectOneRow([label, control, backs]);
		expectInFelt(root, [
			".seat-left",
			".seat-right",
			".seat-top .seat-label",
			".seat-top .backs",
		]);
	});

	it("keeps each side's melds in one row inside its box, smaller when they do not fit, and fits them again after a resize", async () => {
		const card = (index: number): CardView => ({
			id: `7C-${index}`,
			rank: "7",
			suit: "C",
			text: "7♣",
		});
		const meld = (id: string, size: number): MeldView => ({
			id,
			rank: "7",
			cards: Array.from({ length: size }, (_, index) => card(index)),
			canasta: size >= 7,
		});
		const base = turnView(afterDraw(), 1);
		const crowded = Array.from({ length: 9 }, (_, index) =>
			meld(`c${index}`, index === 0 ? 11 : 3 + (index % 5)),
		);
		const sides = [
			{ ...base.sides[0], mine: false, melds: crowded },
			{ ...base.sides[1], mine: true, melds: [meld("s0", 3)] },
		] as const;
		const section = mount([]);
		section.setForm("compact");
		section.render({ ...base, sides });
		const zoomOf = (block: Element): number =>
			Number(getComputedStyle(block.querySelector(".melds") ?? block).zoom);
		const expectOneRowInside = (block: Element): void => {
			const outer = block.getBoundingClientRect();
			const melds = [...block.querySelectorAll(".meld")].map((node) =>
				node.getBoundingClientRect(),
			);
			expect(melds.length).toBeGreaterThan(0);
			for (const rect of melds) {
				expect(Math.abs(rect.top - (melds[0]?.top ?? 0))).toBeLessThanOrEqual(
					0.5,
				);
				expect(rect.left).toBeGreaterThanOrEqual(outer.left);
				expect(rect.right).toBeLessThanOrEqual(outer.right);
			}
		};
		const [theirs, ours] = [
			...section.element.querySelectorAll(".centre > .side-block"),
		];
		if (theirs === undefined || ours === undefined)
			throw new Error("two side blocks");
		expectOneRowInside(theirs);
		expectOneRowInside(ours);
		const narrow = zoomOf(theirs);
		expect(narrow).toBeLessThan(1);
		expect(zoomOf(ours)).toBe(1);

		await resizeTo(390, 664);
		section.fitRows();
		expectOneRowInside(theirs);
		expect(zoomOf(theirs)).toBeGreaterThan(narrow);
		await resizeTo(320, 568);
	});
});

describe("own hand on a 320 px phone, in the compact form", () => {
	beforeAll(() => resizeTo(320, 568));
	afterAll(() => resizeTo(414, 896));

	const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
	const hand = (size: number): CardView[] =>
		Array.from({ length: size }, (_, index) => {
			const rank = ranks[index % ranks.length] ?? "3";
			return { id: `${rank}H-${index}`, rank, suit: "H", text: `${rank}♥` };
		});
	const cardsOf = (section: { element: HTMLElement }): DOMRect[] =>
		[...section.element.querySelectorAll(".own-hand button.card")].map((node) =>
			node.getBoundingClientRect(),
		);
	const expectOneRowInHand = (section: { element: HTMLElement }): void => {
		expectInFelt(section.element, [".own-hand"]);
		const outer = box(section.element, ".own-hand");
		const cards = cardsOf(section);
		for (const card of cards) {
			expect(Math.abs(card.top - (cards[0]?.top ?? 0))).toBeLessThanOrEqual(
				0.5,
			);
			expect(card.left).toBeGreaterThanOrEqual(outer.left);
			expect(card.right).toBeLessThanOrEqual(outer.right);
		}
	};

	it("keeps a short hand in one row with its gaps", () => {
		const section = mount([]);
		section.setForm("compact");
		section.render({ ...turnView(afterDraw(), 1), own: hand(5) });
		expectOneRowInHand(section);
		const cards = cardsOf(section);
		for (const [index, card] of cards.entries()) {
			const before = cards[index - 1];
			if (before !== undefined)
				expect(card.left - before.right).toBeGreaterThan(2);
		}
	});

	it("keeps a long hand in one row inside its box: the cards overlap, and a wider window fits them again", async () => {
		const section = mount([]);
		section.setForm("compact");
		section.render({ ...turnView(afterDraw(), 1), own: hand(22) });
		expectOneRowInHand(section);
		const step = (): number => {
			const cards = cardsOf(section);
			return (
				((cards.at(-1)?.left ?? 0) - (cards[0]?.left ?? 0)) / (cards.length - 1)
			);
		};
		const narrow = step();
		const widest = Math.max(...cardsOf(section).map((card) => card.width));
		expect(narrow).toBeLessThan(widest);

		await resizeTo(390, 664);
		section.fitRows();
		expectOneRowInHand(section);
		expect(step()).toBeGreaterThan(narrow);
		await resizeTo(320, 568);
	});
});

describe("side points on a phone", () => {
	it("shows only the sum of a side's points and a heart for each red 3 in the compact form, and the parts on a desktop", () => {
		const base = turnView(afterDraw(), 1);
		const [first, second] = base.sides;
		const section = mount([]);
		section.render({
			...base,
			sides: [
				{
					...first,
					handPoints: "N-S: 95 (+300 canasta, +200 ♥)",
					handSum: "N-S: 595 ♥♥",
				},
				second,
			],
		});
		const title = (): Element | null =>
			section.element.querySelector(".side-block .side-title");
		expect(title()?.textContent).toBe("N-S: 95 (+300 canasta, +200 ♥)");
		section.setForm("compact");
		expect(title()?.textContent).toBe("N-S: 595 ♥♥");
		expect(
			[...(title()?.querySelectorAll(".heart") ?? [])].map(
				(heart) => heart.textContent,
			),
		).toEqual(["♥", "♥"]);
		section.setForm("desktop");
		expect(title()?.textContent).toBe("N-S: 95 (+300 canasta, +200 ♥)");
	});
});
