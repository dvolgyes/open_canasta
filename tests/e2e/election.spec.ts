import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import {
	BUTTON_MS,
	CLAIM_PULL_MS,
	HOST_LOST_MS,
	STAGGER_MS,
	VOLUNTEER_MS,
} from "../../src/p2p/limits";
import { freeze } from "./lifecycle";
import {
	CONNECT_MS,
	createTableLink,
	expectBanner,
	expectSeat,
	hostRows,
	MESSAGE,
	openDrawer,
	ownLink,
	pick,
	type SeatKey,
	sendDraft,
	texts,
} from "./pages";
import { Player, reportNetwork } from "./player";

/**
 * Host election on the peer-to-peer table. The owner's numbers: the "Make me the host" button
 * after 10 s without a host, and an automatic volunteer after 30 s. A new term needs a witness: another browser
 * at the table. Each test has its own table and its own browsers.
 */

/**
 * The latest time for the automatic host after the host leaves: the host counts as lost HOST_LOST_MS after its
 * last beat, then the volunteer wait, the stagger of the three seats, the claim pull, and slack.
 */
const VOLUNTEER_LATEST_MS =
	HOST_LOST_MS + VOLUNTEER_MS + 3 * STAGGER_MS + CLAIM_PULL_MS + 15_000;
/** The host counts as lost HOST_LOST_MS after its last beat; then the button needs BUTTON_MS more, with slack. */
const BUTTON_LATEST_MS = HOST_LOST_MS + BUTTON_MS + 10_000;
const SEATS = ["W", "N", "E", "S"] as const satisfies readonly SeatKey[];

/** Every browser of every test, for the final error check. */
const all: Player[] = [];
/** The browsers of the running test; closed after it. */
const current: Player[] = [];
let openBrowser: (name: string) => Promise<Player>;

interface SeatedTable {
	readonly link: string;
	readonly tab: Partial<Record<SeatKey, Page>>;
	/** The creator's browser. */
	readonly west: Player;
}

/** West creates a table and hosts it; each other seat takes its place from the link in its own browser. */
async function seatTable(
	seats: readonly Exclude<SeatKey, "W">[],
): Promise<SeatedTable> {
	const west = await openBrowser("west");
	const tab: Partial<Record<SeatKey, Page>> = {};
	const creator = await west.page("./");
	tab.W = creator;
	const link = await createTableLink(creator);
	for (const seat of seats) {
		const page = await (await openBrowser(seat)).page(link);
		await expect(page.getByTestId(`pick-${seat}`)).toBeVisible({
			timeout: CONNECT_MS,
		});
		await pick(page, seat);
		await expect(hostRows(page)).toHaveAttribute("data-seat", "W", {
			timeout: CONNECT_MS,
		});
		// The host row can show before the host's binding reaches the page, and a page without it cannot host.
		// The send note, in the closed drawer, is empty once the page is bound and in sync.
		await expect(page.locator("form.send [role=status]")).toHaveText("", {
			timeout: CONNECT_MS,
		});
		tab[seat] = page;
	}
	return { link, tab, west };
}

function tabOf(tab: Partial<Record<SeatKey, Page>>, seat: SeatKey): Page {
	const page = tab[seat];
	if (!page) throw new Error(`no tab for ${seat}`);
	return page;
}

/** Each page names the same host, in exactly one roster row. Returns its seat. */
async function commonHost(
	pages: readonly Page[],
	timeout = CONNECT_MS,
): Promise<SeatKey> {
	if (pages.length === 0) throw new Error("no page");
	let common: SeatKey | undefined;
	await expect
		.poll(
			async () => {
				const seats = await Promise.all(
					pages.map(async (page) => {
						const rows = hostRows(page);
						return (await rows.count()) === 1
							? rows.getAttribute("data-seat")
							: null;
					}),
				);
				const found = SEATS.find((seat) =>
					seats.every((value) => value === seat),
				);
				if (found === undefined) return false;
				common = found;
				return true;
			},
			{ timeout, message: "the pages agree on one host" },
		)
		.toBe(true);
	if (common === undefined) throw new Error("no common host");
	return common;
}

async function expectHost(
	pages: readonly Page[],
	seat: SeatKey,
): Promise<void> {
	for (const page of pages)
		await expect(hostRows(page)).toHaveAttribute("data-seat", seat, {
			timeout: CONNECT_MS,
		});
}

/** Checks the condition every 250 ms until the deadline (`Date.now()` value); fails at the first miss. */
async function holdsUntil(
	until: number,
	what: string,
	check: () => Promise<boolean>,
): Promise<void> {
	while (Date.now() < until) {
		expect(await check(), what).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

/**
 * Clicks the page's host button at the wall-clock time `at` from inside the page, so that two pages click within
 * the same time, before either can hear the other's claim. Captures when each callback ran and the button state.
 */
type HostClick = {
	ready: boolean;
	firedAt: number;
	button: string;
	host: string | null;
	banner: string | null;
};

/** Hold outgoing data until both pages have clicked, then deliver it in order. */
async function holdElectionFrames(page: Page): Promise<void> {
	await page.evaluate(() => {
		const prototype = RTCDataChannel.prototype;
		const send = prototype.send;
		const pending: { channel: RTCDataChannel; data: unknown }[] = [];
		prototype.send = function (this: RTCDataChannel, data: unknown): void {
			pending.push({ channel: this, data });
		} as typeof prototype.send;
		const scope = globalThis as typeof globalThis & {
			__releaseElectionFrames?: () => number;
		};
		scope.__releaseElectionFrames = () => {
			prototype.send = send;
			delete scope.__releaseElectionFrames;
			for (const frame of pending)
				Reflect.apply(send, frame.channel, [frame.data]);
			return pending.length;
		};
	});
}

async function releaseElectionFrames(page: Page): Promise<number> {
	return page.evaluate(() => {
		const scope = globalThis as typeof globalThis & {
			__releaseElectionFrames?: () => number;
		};
		if (!scope.__releaseElectionFrames)
			throw new Error("election frame hold is missing");
		return scope.__releaseElectionFrames();
	});
}

function clickHostAt(page: Page, at: number): Promise<HostClick> {
	return page.evaluate(
		(time) =>
			new Promise<HostClick>((resolve) => {
				setTimeout(
					() => {
						const firedAt = Date.now();
						const node = document.querySelector('[data-testid="become-host"]');
						const ready =
							node instanceof HTMLButtonElement &&
							!node.disabled &&
							node.checkVisibility();
						const button =
							node instanceof HTMLButtonElement
								? node.disabled
									? "disabled"
									: node.checkVisibility()
										? "enabled"
										: "hidden"
								: "absent";
						const hostRows = [
							...document.querySelectorAll('[data-testid="roster"] li'),
						].filter((row) =>
							[...row.querySelectorAll(".tag")].some(
								(tag) => tag.textContent?.trim() === "Host",
							),
						);
						const host =
							hostRows.length === 1
								? (hostRows[0]?.getAttribute("data-seat") ?? null)
								: null;
						const banner =
							document.querySelector('[data-testid="banner"]')
								?.firstElementChild?.textContent ?? null;
						if (ready) node.click();
						resolve({ ready, firedAt, button, host, banner });
					},
					Math.max(0, time - Date.now()),
				);
			}),
		at,
	);
}

test.beforeAll(({ browser, baseURL }) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	openBrowser = async (name) => {
		const player = await Player.open(browser, baseURL, name);
		all.push(player);
		current.push(player);
		return player;
	};
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern as the first parameter.
test.afterEach(async ({}, testInfo) => {
	if (testInfo.status !== testInfo.expectedStatus) await reportNetwork(current);
	for (const player of current.splice(0)) await player.close();
});

/** West leaves a table where only North sits. North's page waits for a host and shows the disabled button. */
async function northAlone(): Promise<{
	readonly link: string;
	readonly north: Page;
	readonly westBrowser: Player;
	readonly since: number;
	/** When the disabled button showed: BUTTON_MS into North's absence clock. */
	readonly shownAt: number;
}> {
	const { link, tab, west: westBrowser } = await seatTable(["N"]);
	const north = tabOf(tab, "N");
	await tabOf(tab, "W").close({ runBeforeUnload: false });
	const since = Date.now();

	// The banner reads "unreachable" until West's last beat is HOST_LOST_MS old.
	await expectBanner(north, "waiting-for-host", {
		timeout: HOST_LOST_MS + 10_000,
	});
	const become = north.getByTestId("become-host");
	await expect(become).toBeVisible({ timeout: BUTTON_LATEST_MS });
	const shownAt = Date.now();
	const shownAfter = shownAt - since;
	test.info().annotations.push({
		type: "button shown after (ms)",
		description: String(shownAfter),
	});
	expect(shownAfter).toBeGreaterThanOrEqual(BUTTON_MS);
	await expect(become).toBeDisabled();
	await expect(north.getByTestId("banner")).toContainText(
		"Another player must be online to confirm",
	);
	return { link, north, westBrowser, since, shownAt };
}

/** The old host reopens and takes the preferred host role; West's message reaches every page. */
async function westFollowsNorth(
	link: string,
	westBrowser: Player,
	north: Page,
	visitor: Page,
): Promise<void> {
	await expect(visitor.getByTestId("pick-E")).toBeVisible({
		timeout: CONNECT_MS,
	});
	await pick(visitor, "E");
	const west = await westBrowser.page(ownLink(link, "W"));
	await expectSeat(west, "W", {
		timeout: CONNECT_MS,
	});
	await expectHost([north, visitor, west], "W");
	await sendDraft(west);
	for (const page of [north, visitor, west])
		await expect(texts(page)).toHaveText([MESSAGE.W]);
}

test("the button shows after 10 s without a host; it waits for a witness, and a click gives one host", async () => {
	test.setTimeout(180_000);
	const { link, north, westBrowser, shownAt } = await northAlone();
	const become = north.getByTestId("become-host");

	// A visitor in another browser is a witness. It must connect before the automatic volunteer at 30 s.
	const visitor = await (await openBrowser("visitor")).page(link);
	await expect(become).toBeEnabled({ timeout: CONNECT_MS });
	// North's absence clock was at BUTTON_MS when the button showed.
	const absentAtEnable = BUTTON_MS + Date.now() - shownAt;
	test.info().annotations.push({
		type: "absence when the button was enabled (ms)",
		description: String(absentAtEnable),
	});
	expect(
		absentAtEnable,
		"the witness came before the automatic volunteer",
	).toBeLessThan(VOLUNTEER_MS);
	await become.click();
	await expect(hostRows(north)).toHaveAttribute("data-seat", "N", {
		timeout: CONNECT_MS,
	});
	await expect(north.getByTestId("banner")).toBeHidden();
	await westFollowsNorth(link, westBrowser, north, visitor);
});

test("alone, a seated player never becomes the host; after 30 s it volunteers as soon as a witness comes", async () => {
	test.setTimeout(180_000);
	const { link, north, westBrowser, since } = await northAlone();
	const become = north.getByTestId("become-host");
	// Alone, North never volunteers: no new term without a witness.
	await holdsUntil(
		since + HOST_LOST_MS + VOLUNTEER_MS + 10_000,
		"North stays without a host and its button stays disabled",
		async () =>
			(await hostRows(north).count()) === 0 &&
			(await become.isVisible()) &&
			(await become.isDisabled()),
	);

	// The 30 s are over, so the witness's arrival is enough: North volunteers without a click (rule 8).
	const visitor = await (await openBrowser("visitor")).page(link);
	await expect(hostRows(north)).toHaveAttribute("data-seat", "N", {
		timeout: CONNECT_MS,
	});
	await expect(north.getByTestId("banner")).toBeHidden();
	await westFollowsNorth(link, westBrowser, north, visitor);
});

test("with four seats, a player volunteers after the host leaves; the preferred host takes over on return", async () => {
	test.setTimeout(180_000);
	const { link, tab, west: westBrowser } = await seatTable(["N", "E"]);
	// "All players connected" needs the other three seats.
	await openDrawer(tabOf(tab, "W"));
	await expect(tabOf(tab, "W").getByTestId("all-connected")).toBeHidden();
	const south = await (await openBrowser("S")).page(link);
	await expect(south.getByTestId("pick-S")).toBeVisible({
		timeout: CONNECT_MS,
	});
	await pick(south, "S");
	tab.S = south;
	for (const seat of SEATS) {
		await openDrawer(tabOf(tab, seat));
		await expect(tabOf(tab, seat).getByTestId("all-connected")).toBeVisible({
			timeout: CONNECT_MS,
		});
	}

	await tabOf(tab, "W").close({ runBeforeUnload: false });
	const since = Date.now();
	const guests = (["N", "E", "S"] as const).map((seat) => tabOf(tab, seat));
	for (const page of guests)
		await expect(page.getByTestId("become-host")).toBeEnabled({
			timeout: BUTTON_LATEST_MS,
		});
	// Nobody clicks.
	await expect(hostRows(guests[0] as Page)).toHaveCount(1, {
		timeout: since + VOLUNTEER_LATEST_MS - Date.now(),
	});
	const hostAfter = Date.now() - since;
	test.info().annotations.push({
		type: "automatic host after (ms)",
		description: String(hostAfter),
	});
	expect(hostAfter).toBeGreaterThanOrEqual(VOLUNTEER_MS);
	const host = await commonHost(guests);
	expect(host).not.toBe("W");
	for (const page of guests)
		await expect(page.getByTestId("banner")).toBeHidden();

	const west = await westBrowser.page(ownLink(link, "W"));
	await expectSeat(west, "W", {
		timeout: CONNECT_MS,
	});
	await expectHost([...guests, west], "W");
	await sendDraft(west);
	for (const page of [...guests, west])
		await expect(texts(page)).toHaveText([MESSAGE.W]);
});

test("two players who click at the same moment get exactly one host", async () => {
	const { tab } = await seatTable(["N", "E"]);
	const north = tabOf(tab, "N");
	const east = tabOf(tab, "E");
	await tabOf(tab, "W").close({ runBeforeUnload: false });
	const closedAt = Date.now();
	for (const page of [north, east])
		await expect(page.getByTestId("become-host")).toBeEnabled({
			timeout: BUTTON_LATEST_MS,
		});

	await Promise.all([holdElectionFrames(north), holdElectionFrames(east)]);
	const at = Date.now() + 1_000;
	let clicks: HostClick[];
	let heldFrames: number[];
	try {
		clicks = await Promise.all([clickHostAt(north, at), clickHostAt(east, at)]);
		await new Promise((resolve) => setTimeout(resolve, 250));
	} finally {
		heldFrames = await Promise.all([
			releaseElectionFrames(north),
			releaseElectionFrames(east),
		]);
	}
	const timingPath = test.info().outputPath("election-click-timing.json");
	await writeFile(
		timingPath,
		JSON.stringify({ closedAt, scheduledAt: at, clicks, heldFrames }),
	);
	await test.info().attach("election-click-timing", {
		path: timingPath,
		contentType: "application/json",
	});
	expect(
		heldFrames.every((count) => count > 0),
		"both pages sent data while the frame hold was active",
	).toBe(true);
	expect(
		clicks.map((click) => click.ready),
		"both clicks reached an enabled button",
	).toEqual([true, true]);
	// East may lead briefly, but North is closer to West in the setup's clockwise priority.
	const host: SeatKey = "N";
	await expectHost([north, east], host);
	test.info().annotations.push({ type: "host", description: host });
	const observations: { at: number; hosts: (string | null)[] }[] = [];
	const observe = async (): Promise<boolean> => {
		const hosts = await Promise.all(
			[north, east].map((page) =>
				page.evaluate(() => {
					const rows = document.querySelectorAll('[data-testid="roster"] li');
					const hosts = [...rows].filter((row) =>
						[...row.querySelectorAll(".tag")].some(
							(tag) => tag.textContent?.trim() === "Host",
						),
					);
					return hosts.length === 1
						? (hosts[0]?.getAttribute("data-seat") ?? null)
						: null;
				}),
			),
		);
		observations.push({ at: Date.now(), hosts });
		return hosts.every((value) => value === host);
	};
	try {
		await holdsUntil(
			Date.now() + 8_000,
			"both pages keep one and the same host",
			observe,
		);
	} catch (error) {
		const until = Date.now() + 10_000;
		while (Date.now() < until) {
			await observe();
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		const historyPath = test.info().outputPath("election-host-history.json");
		await writeFile(
			historyPath,
			JSON.stringify({ expected: host, observations }),
		);
		await test.info().attach("election-host-history", {
			path: historyPath,
			contentType: "application/json",
		});
		throw error;
	}

	await sendDraft(north);
	await expect(texts(east)).toHaveText([MESSAGE.N]);
	await sendDraft(east);
	for (const page of [north, east])
		await expect(texts(page)).toHaveText([MESSAGE.N, MESSAGE.E]);
});

test("a host that reloads resumes its term, and no page shows the button", async () => {
	const { tab } = await seatTable(["N", "E"]);
	const west = tabOf(tab, "W");
	const guests = [tabOf(tab, "N"), tabOf(tab, "E")];
	const noButton = async (pages: readonly Page[]): Promise<boolean> => {
		for (const page of pages)
			if (await page.getByTestId("become-host").isVisible()) return false;
		return true;
	};
	const watching = holdsUntil(
		Date.now() + 20_000,
		"no guest shows the host button",
		() => noButton(guests),
	);
	await west.reload();
	await expectSeat(west, "W", {
		timeout: CONNECT_MS,
	});
	await holdsUntil(
		Date.now() + 5_000,
		"the reloaded host shows no button",
		() => noButton([west]),
	);
	await watching;
	expect(await commonHost([west, ...guests])).toBe("W");

	await sendDraft(tabOf(tab, "N"));
	for (const page of [west, ...guests])
		await expect(texts(page)).toHaveText([MESSAGE.N]);
});

test("a thawed old host steps down, and its later message still goes through", async () => {
	const { tab } = await seatTable(["N", "E"]);
	const west = tabOf(tab, "W");
	const north = tabOf(tab, "N");
	const east = tabOf(tab, "E");
	const thaw = await freeze(west);
	const become = north.getByTestId("become-host");
	await expect(become).toBeEnabled({ timeout: BUTTON_LATEST_MS });
	await become.click();
	expect(await commonHost([north, east])).toBe("N");

	await thaw();
	await expectHost([west, north, east], "W");
	await expect(west.getByTestId("banner")).toBeHidden({ timeout: CONNECT_MS });
	await expectSeat(west, "W");
	await sendDraft(west);
	for (const page of [west, north, east])
		await expect(texts(page)).toHaveText([MESSAGE.W]);
	await expect(west.getByTestId("pending").locator("li")).toHaveCount(0);
});

test("a second tab cannot take the host's active seat", async () => {
	const { link, tab, west: westBrowser } = await seatTable(["N"]);
	const old = tabOf(tab, "W");
	const north = tabOf(tab, "N");
	const west = await westBrowser.page(link);
	await expect(
		west.getByRole("heading", { name: "Choose your seat" }),
	).toBeVisible({ timeout: CONNECT_MS });
	await expect(west.getByTestId("pick-W")).toBeDisabled();
	await expectSeat(old, "W");
	await expect(old.getByTestId("send")).toBeEnabled();

	expect(await commonHost([old, north])).toBe("W");
	await sendDraft(old);
	await expect(texts(north)).toHaveText([MESSAGE.W]);
});

test("no uncaught errors", () => {
	expect(all.flatMap((player) => player.errors)).toEqual([]);
});
