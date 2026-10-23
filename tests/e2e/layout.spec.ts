import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	CONNECT_MS,
	createTableLink,
	pick,
	type SeatKey,
	turnOrder,
} from "./pages";
import { Player } from "./player";

/**
 * Player-relative layout (call/layout plan C3). Four desktop browsers check the rotation, the tiles and the free
 * space between the table parts; a phone-sized browser checks the compact layout at a second table. A deal needs
 * all four seats, so three of the desktop browsers also sit at the second table.
 */
test.describe.configure({ mode: "serial" });

const SEATS = ["N", "E", "S", "W"] as const satisfies readonly SeatKey[];
const SEAT_NAMES: Readonly<Record<SeatKey, string>> = {
	N: "North",
	E: "East",
	S: "South",
	W: "West",
};
/** Play goes clockwise, so the next seat sits on the viewer's left. */
const AROUND: Readonly<
	Record<SeatKey, { left: SeatKey; partner: SeatKey; right: SeatKey }>
> = {
	N: { left: "E", partner: "S", right: "W" },
	E: { left: "S", partner: "W", right: "N" },
	S: { left: "W", partner: "N", right: "E" },
	W: { left: "N", partner: "E", right: "S" },
};
/** Half a pixel absorbs subpixel rounding of the layout. */
const SUBPIXEL = 0.5;
/** The call controls; each name spells out the way and the medium. */
const DESKTOP_TOGGLES = [
	"Send mic audio",
	"Hear others: receive audio",
	"Send camera video",
	"See cameras: receive video",
] as const;
const COMPACT_TOGGLES = ["Send mic audio", "Hear others: receive audio"];
/** A 1366×768 laptop screen less the browser's own bars. */
const LOW_LAPTOP = { width: 1366, height: 650 };
/** Phone viewports for the compact layout, portrait and landscape. */
const PHONE_VIEWPORTS = [
	{ width: 320, height: 568 },
	{ width: 390, height: 664 },
	{ width: 844, height: 390 },
] as const;

const players = {} as Record<SeatKey, Player>;
const tab = {} as Record<SeatKey, Page>;
let phone: Player | undefined;
let phoneTab: Page | undefined;

const table = (page: Page): Locator => page.getByTestId("table");
const tile = (page: Page, seat: SeatKey): Locator =>
	page.getByTestId(`tile-${seat}`);

interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

const right = (rect: Rect): number => rect.x + rect.width;
const bottom = (rect: Rect): number => rect.y + rect.height;
const middle = (rect: Rect): { x: number; y: number } => ({
	x: rect.x + rect.width / 2,
	y: rect.y + rect.height / 2,
});

/**
 * The boxes, in viewport pixels, of the first element that each CSS selector finds. Each render can replace
 * the table's elements, so all boxes are read in one page call, from one layout. A missing or undisplayed
 * element has no box.
 */
function measure(
	page: Page,
	selectors: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, Rect>>> {
	return page.evaluate((entries) => {
		const rects: Record<string, Rect> = {};
		for (const [name, selector] of entries) {
			const node = document.querySelector(selector);
			if (!node?.checkVisibility()) continue;
			const { x, y, width, height } = node.getBoundingClientRect();
			rects[name] = { x, y, width, height };
		}
		return rects;
	}, Object.entries(selectors));
}

function shown(rects: Readonly<Record<string, Rect>>, name: string): Rect {
	const rect = rects[name];
	if (!rect) throw new Error(`${name} is not displayed`);
	return rect;
}

/** The area two rectangles share, ignoring a shared edge. */
function overlap(a: Rect, b: Rect): number {
	const width = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
	const height = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
	return width > SUBPIXEL && height > SUBPIXEL ? width * height : 0;
}

/** The displayed parts must not overlap pairwise. */
function expectApart(
	rects: Readonly<Record<string, Rect>>,
	names: readonly string[],
): void {
	const parts = names.filter((name) => rects[name]);
	for (const [index, name] of parts.entries())
		for (const other of parts.slice(index + 1))
			expect(
				overlap(shown(rects, name), shown(rects, other)),
				`${name} overlaps ${other}`,
			).toBe(0);
}

/**
 * The parts of the table that must keep apart: the four places, the parts of the centre and the call dock. On a
 * phone the centre has no box of its own, so its piles and its two sides are measured.
 */
const TABLE_PARTS: Readonly<Record<string, string>> = {
	top: ".seat-top",
	left: ".seat-left",
	right: ".seat-right",
	bottom: ".seat-bottom",
	piles: '[data-testid="centre"] > .piles',
	theirs: '[data-testid="centre"] > .side-block:nth-child(2)',
	ours: '[data-testid="centre"] > .side-block:nth-child(3)',
	dock: ".dock",
};

/**
 * Own place lowest, partner highest, left opponent leftmost, right opponent rightmost; a tile in each other
 * place and none for the viewer; no two parts of the table overlap. In the one-row form the partner shares the
 * top row with the opponents, between them.
 */
async function expectRotation(
	page: Page,
	viewer: SeatKey,
	form: "row" | "around",
): Promise<void> {
	const around = AROUND[viewer];
	for (const [place, seat] of [
		["top", around.partner],
		["left", around.left],
		["right", around.right],
	] as const) {
		await expect(
			page.locator(`.seat-${place}`).getByTestId(`tile-${seat}`),
			`${SEAT_NAMES[seat]} sits ${place}`,
		).toHaveCount(1);
		await expect(tile(page, seat).locator(".avatar")).toHaveText(seat);
	}
	await expect(tile(page, viewer)).toHaveCount(0);
	await expect(page.locator(".seat-bottom .own-hand")).toHaveCount(1);

	const rects = await measure(page, TABLE_PARTS);
	const at = (name: string): { x: number; y: number } =>
		middle(shown(rects, name));
	for (const other of ["top", "left", "right"])
		expect(at("bottom").y, `own place below ${other}`).toBeGreaterThan(
			at(other).y,
		);
	expect(at("left").x, "left opponent left of the right one").toBeLessThan(
		at("right").x,
	);
	expectApart(rects, Object.keys(TABLE_PARTS));
	if (form === "around") {
		for (const other of ["left", "right", "bottom"])
			expect(at("top").y, `partner above ${other}`).toBeLessThan(at(other).y);
		return;
	}
	const tiles = await measure(page, {
		top: ".seat-top .tile",
		left: ".seat-left .tile",
		right: ".seat-right .tile",
	});
	for (const side of ["left", "right"])
		expect(
			Math.abs(shown(tiles, side).y - shown(tiles, "top").y),
			`${side} tile in the partner's row`,
		).toBeLessThanOrEqual(1);
	expect(at("top").x, "partner right of the left opponent").toBeGreaterThan(
		at("left").x,
	);
	expect(at("top").x, "partner left of the right opponent").toBeLessThan(
		at("right").x,
	);
}

/** The page does not scroll sideways, and the named parts show inside the window without page scroll. */
async function expectFit(
	page: Page,
	parts: Readonly<Record<string, string>>,
): Promise<void> {
	// The canvas scale follows the window's resize event, which can arrive after a viewport change.
	await expect(async () => {
		await page.evaluate(() => window.scrollTo(0, 0));
		const view = await page.evaluate(() => ({
			innerWidth: window.innerWidth,
			innerHeight: window.innerHeight,
			scrollWidth: document.documentElement.scrollWidth,
		}));
		expect(view.scrollWidth, "sideways page scroll").toBeLessThanOrEqual(
			view.innerWidth,
		);
		const rects = await measure(page, parts);
		for (const name of Object.keys(parts)) {
			const rect = shown(rects, name);
			expect(rect.x, `${name} left edge`).toBeGreaterThanOrEqual(-SUBPIXEL);
			expect(rect.y, `${name} top edge`).toBeGreaterThanOrEqual(-SUBPIXEL);
			expect(right(rect), `${name} right edge`).toBeLessThanOrEqual(
				view.innerWidth + SUBPIXEL,
			);
			expect(bottom(rect), `${name} bottom edge`).toBeLessThanOrEqual(
				view.innerHeight + SUBPIXEL,
			);
		}
	}).toPass({ timeout: 5_000 });
}

/** The parts that are not seats: the scores, the call dock, the screen controls, the drawer and the language. */
const SIDE_PARTS: Readonly<Record<string, string>> = {
	scores: '[data-testid="score-strip"]',
	dock: ".dock",
	controls: '[data-testid="screen-controls"]',
	drawer: '[data-testid="screen-drawer"]',
	language: ".table-screen .language-control",
};

/** How near to its corner of the canvas a corner part must be, as a part of the canvas size. */
const CORNER = 0.03;

/**
 * On a wide landscape window the table screen is one 16:9 felt canvas, scaled to fit the window: every part is on the
 * felt, the call dock is in its bottom-left corner, and the screen controls with the language are in its
 * bottom-right corner. On a phone the felt is at the top: the status, the scores, the dock and the screen controls sit
 * below it.
 */
async function expectSideParts(
	page: Page,
	form: "canvas" | "below",
): Promise<void> {
	const rects = await measure(page, {
		felt: ".felt",
		screen: ".table-screen",
		status: ".table-status",
		...SIDE_PARTS,
	});
	if (form === "below") {
		const felt = shown(rects, "felt");
		for (const name of ["status", "scores", "dock", "controls"])
			expect(shown(rects, name).y, `${name} below the felt`).toBeGreaterThan(
				bottom(felt) - SUBPIXEL,
			);
		return;
	}
	const view = await page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
	const screen = shown(rects, "screen");
	expect(screen.width / screen.height, "16:9 canvas").toBeCloseTo(16 / 9, 2);
	expect(
		Math.max(screen.width / view.width, screen.height / view.height),
		"the canvas fills the window in one direction",
	).toBeCloseTo(1, 2);
	for (const name of Object.keys(SIDE_PARTS)) {
		const part = shown(rects, name);
		expect(part.x, `${name} on the felt`).toBeGreaterThanOrEqual(
			screen.x - SUBPIXEL,
		);
		expect(part.y, `${name} on the felt`).toBeGreaterThanOrEqual(
			screen.y - SUBPIXEL,
		);
		expect(right(part), `${name} on the felt`).toBeLessThanOrEqual(
			right(screen) + SUBPIXEL,
		);
		expect(bottom(part), `${name} on the felt`).toBeLessThanOrEqual(
			bottom(screen) + SUBPIXEL,
		);
	}
	const dock = shown(rects, "dock");
	expect(dock.x - screen.x, "call dock at the left edge").toBeLessThan(
		screen.width * CORNER,
	);
	expect(bottom(screen) - bottom(dock), "call dock at the bottom").toBeLessThan(
		screen.height * CORNER,
	);
	const controls = shown(rects, "controls");
	expect(
		right(screen) - right(controls),
		"screen controls at the right edge",
	).toBeLessThan(screen.width * CORNER);
	expect(
		bottom(screen) - bottom(controls),
		"screen controls at the bottom",
	).toBeLessThan(screen.height * CORNER);
	expect(
		overlap(shown(rects, "language"), controls),
		"the language with the screen controls",
	).toBeGreaterThan(0);
	expectApart(rects, ["scores", "dock", "controls", "drawer"]);
}

/** The two boxes share a part of their height, and the first is left of the second. */
function expectInOneRow(
	rects: Readonly<Record<string, Rect>>,
	first: string,
	second: string,
): void {
	const a = shown(rects, first);
	const b = shown(rects, second);
	expect(
		Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y),
		`${first} and ${second} in one row`,
	).toBeGreaterThan(SUBPIXEL);
	expect(right(a), `${first} left of ${second}`).toBeLessThanOrEqual(
		b.x + SUBPIXEL,
	);
}

/**
 * The phone felt fills the width of the window from its top edge. The stock and the discard pile share one row, and
 * so do the partner's name and card backs. The own cards are 30% smaller than the card height of the table, but
 * their text keeps the size of 0.3 card heights, and it fits in the card.
 */
async function expectCompactFelt(page: Page): Promise<void> {
	await page.evaluate(() => window.scrollTo(0, 0));
	const rects = await measure(page, {
		felt: ".felt",
		stock: ".piles .stock",
		pile: ".piles .pile",
		partner: ".seat-top .seat-label",
		backs: ".seat-top .backs",
	});
	const width = await page.evaluate(() => window.innerWidth);
	const felt = shown(rects, "felt");
	expect(Math.abs(felt.x), "felt at the left edge").toBeLessThanOrEqual(
		SUBPIXEL,
	);
	expect(
		Math.abs(right(felt) - width),
		"felt at the right edge",
	).toBeLessThanOrEqual(SUBPIXEL);
	expect(Math.abs(felt.y), "felt at the top edge").toBeLessThanOrEqual(
		SUBPIXEL,
	);
	expectInOneRow(rects, "stock", "pile");
	expectInOneRow(rects, "partner", "backs");
	const boxes = await page
		.locator(".piles > .stock, .piles > .pile")
		.evaluateAll((nodes) =>
			nodes.map((node) => ({
				name: node.className,
				lines: [...node.children]
					.filter((child) => child.checkVisibility())
					.map((child) => child.getBoundingClientRect()),
				overflow: node.scrollWidth - node.clientWidth,
			})),
		);
	expect(boxes.length, "stock and pile").toBe(2);
	for (const box of boxes) {
		const top = Math.max(...box.lines.map((line) => line.y));
		const end = Math.min(...box.lines.map((line) => line.y + line.height));
		expect(end - top, `${box.name}: its text in one line`).toBeGreaterThan(
			SUBPIXEL,
		);
		expect(box.overflow, `${box.name}: its text in sight`).toBeLessThanOrEqual(
			0,
		);
	}
	const frozen = page.locator(".piles .pile-frozen");
	if (await frozen.isVisible()) {
		const reason = await frozen.boundingBox();
		expect(
			reason?.y ?? 0,
			"frozen reason below the piles",
		).toBeGreaterThanOrEqual(
			Math.max(bottom(shown(rects, "stock")), bottom(shown(rects, "pile"))) -
				SUBPIXEL,
		);
	}
	const cards = await page.locator(".own-hand .card").evaluateAll((nodes) =>
		nodes.map((node) => ({
			text: node.textContent ?? "",
			joker: node.classList.contains("joker"),
			height: node.getBoundingClientRect().height,
			fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
			overflow: node.scrollWidth - node.clientWidth,
		})),
	);
	expect(cards.length, "own cards").toBeGreaterThan(0);
	for (const card of cards) {
		// A joker's text is 0.2 card heights, so only the other cards give the card height.
		if (!card.joker)
			expect(
				card.height / (card.fontSize / 0.3),
				`${card.text}: 0.7 card heights`,
			).toBeCloseTo(0.7, 1);
		expect(
			card.overflow,
			`${card.text}: text inside the card`,
		).toBeLessThanOrEqual(0);
	}
}

/** The viewer's own hand and its action buttons. */
const OWN_PARTS = {
	"own hand": ".own-hand",
	"action bar": '[data-testid="action-bar"]',
};

test.beforeAll(async ({ browser, baseURL }) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	for (const [seat, identity] of [
		["W", "identity-9"],
		["N", "identity-6"],
		["S", "identity-7"],
		["E", "identity-8"],
	] as const)
		players[seat] = await Player.open(browser, baseURL, identity);
	phone = await Player.open(browser, baseURL, "identity-4", {
		viewport: { width: 390, height: 664 },
		isMobile: true,
		hasTouch: true,
	});
});

test.afterAll(async () => {
	for (const player of Object.values(players)) await player.close();
	await phone?.close();
});

test("1: desktop, first hand: each of the four viewers sits at the bottom, with tiles in the other places", async () => {
	tab.W = await players.W.page("./");
	const link = await createTableLink(tab.W);
	for (const seat of ["N", "S", "E"] as const) {
		tab[seat] = await players[seat].page(link);
		await pick(tab[seat], seat);
	}
	// The hosting page deals the first hand by itself once all four seats are present.
	for (const seat of SEATS) {
		await expect(table(tab[seat])).toHaveAttribute("data-phase", "play", {
			timeout: CONNECT_MS,
		});
		await expectRotation(tab[seat], seat, "row");
	}

	// The window of the first player shows the hand and the action buttons without page scroll, also on a low
	// laptop window.
	const [first] = await turnOrder(tab);
	if (first === undefined) throw new Error("nobody plays first");
	await expect(tab[first].getByTestId("action-draw")).toBeVisible();
	await expectFit(tab[first], OWN_PARTS);
	await expectSideParts(tab[first], "canvas");
	await tab[first].setViewportSize(LOW_LAPTOP);
	await expectFit(tab[first], OWN_PARTS);
	await expectSideParts(tab[first], "canvas");
	await tab[first].setViewportSize({ width: 1280, height: 720 });
});

test("2: a phone shows the table without sideways scroll, with the own hand and the actions in reach", async () => {
	if (!phone) throw new Error("the phone browser is not open");
	const host = await players.W.page("./");
	const link = await createTableLink(host);
	phoneTab = await phone.page(link);
	await pick(phoneTab, "N");
	for (const seat of ["S", "E"] as const)
		await pick(await players[seat].page(link), seat);
	await expect(table(phoneTab)).toHaveAttribute("data-phase", "play", {
		timeout: CONNECT_MS,
	});
	for (const size of PHONE_VIEWPORTS) {
		await phoneTab.setViewportSize(size);
		await test.step(`${size.width}×${size.height}`, async () => {
			const page = phoneTab as Page;
			await expectRotation(page, "N", "around");
			await expectSideParts(page, "below");
			// A phone has no video, so each other seat shows its name and no tile.
			for (const seat of ["E", "S", "W"] as const) {
				await expect(tile(page, seat)).toBeHidden();
				await expect(
					page
						.locator(".seat")
						.filter({ has: tile(page, seat) })
						.locator(".seat-label .name"),
				).toBeVisible();
			}
			await expectCompactFelt(page);
			await page.locator(".own-hand").scrollIntoViewIfNeeded();
			const view = await page.evaluate(() => ({
				innerWidth: window.innerWidth,
				scrollWidth: document.documentElement.scrollWidth,
			}));
			expect(view.scrollWidth, "sideways page scroll").toBeLessThanOrEqual(
				view.innerWidth,
			);
		});
	}
	await phoneTab.setViewportSize({ width: 390, height: 664 });
});

test("3: the call controls have names that spell out the way and the medium, and their off state has a slash", async () => {
	if (!phoneTab) throw new Error("the phone tab is not open");
	const forms = [
		[tab.W, DESKTOP_TOGGLES],
		[phoneTab, COMPACT_TOGGLES],
	] as const;
	// Outside the call the switches choose what Join starts with (call-video test 1), so a switch that is on is
	// turned off for the check and then on again.
	for (const [page, toggles] of forms) {
		for (const name of toggles) {
			const toggle = page.getByRole("button", { name, exact: true });
			await expect(toggle).toHaveCount(1);
			const on = (await toggle.getAttribute("aria-pressed")) === "true";
			if (on) await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "false");
			await expect(toggle.locator(".icon-slash")).toHaveCount(1);
			if (!on) continue;
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "true");
			await expect(toggle.locator(".icon-slash")).toHaveCount(0);
		}
		await expect(
			page.getByRole("button", { name: "Join call", exact: true }),
		).toHaveCount(1);
	}
	// The phone shows the video switches too, but it cannot turn them on.
	for (const name of ["Send camera video", "See cameras: receive video"]) {
		const toggle = phoneTab.getByRole("button", { name, exact: true });
		await expect(toggle).toBeDisabled();
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await expect(toggle.locator(".icon-slash")).toHaveCount(1);
	}
});
