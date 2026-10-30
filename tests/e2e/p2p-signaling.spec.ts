import {
	type Browser,
	type BrowserContext,
	expect,
	type Page,
	test,
} from "@playwright/test";
import type { Harness } from "./harness/main";
import { RelayHub } from "./relay-hub";

const TRACKER = "wss://tracker.signaling.test";
const MQTT = "wss://mqtt.signaling.test/mqtt";
const NOSTR = "wss://nostr.signaling.test";
const CONNECT_MS = 30_000;

interface Relays {
	readonly tracker?: RelayHub;
	readonly mqtt?: RelayHub;
	readonly nostr?: RelayHub;
}

interface Player {
	readonly label: string;
	readonly page: Page;
}

const contexts: BrowserContext[] = [];
const errors: string[] = [];

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern as the first parameter.
test.afterEach(async ({}) => {
	for (const context of contexts.splice(0)) await context.close();
	expect(errors.splice(0), "uncaught page errors").toEqual([]);
});

/** Count only links to other pages, not the page's own WebRTC self-check. */
function countLinks(): void {
	const Native = window.RTCPeerConnection;
	const made: RTCPeerConnection[] = [];
	const connected = new Set<RTCPeerConnection>();
	const fingerprint = (description: RTCSessionDescription | null) =>
		/^a=fingerprint:(.+)$/m.exec(description?.sdp ?? "")?.[1];
	window.RTCPeerConnection = class extends Native {
		constructor(configuration?: RTCConfiguration) {
			super(configuration);
			made.push(this);
			this.addEventListener("connectionstatechange", () => {
				if (this.connectionState !== "connected") return;
				const remote = fingerprint(this.remoteDescription);
				if (
					remote === undefined ||
					!made.some(
						(other) =>
							other !== this && fingerprint(other.localDescription) === remote,
					)
				)
					connected.add(this);
			});
		}
	};
	const counters = window as unknown as {
		links: () => number;
		everConnected: () => number;
	};
	counters.links = () =>
		[...connected].filter((link) => link.connectionState === "connected")
			.length;
	counters.everConnected = () => connected.size;
}

async function player(
	browser: Browser,
	label: string,
	relays: Relays,
	bad: boolean,
): Promise<Player> {
	const context = await browser.newContext();
	contexts.push(context);
	await context.addInitScript(countLinks);
	await context.routeWebSocket(
		/^wss:\/\/fail-(tracker|mqtt|nostr)\.test\//,
		(socket) => {
			void socket.close();
		},
	);
	await context.routeWebSocket(
		/^wss:\/\/silent-(tracker|mqtt|nostr)\.test\//,
		() => {},
	);
	await relays.tracker?.install(context, label);
	await relays.mqtt?.install(context, label);
	await relays.nostr?.install(context, label);
	const list = (kind: "tracker" | "mqtt" | "nostr"): string => {
		const failures = bad
			? [`wss://fail-${kind}.test/`, `wss://silent-${kind}.test/`]
			: [];
		const urls = [...failures, ...(relays[kind]?.urls ?? [])];
		return urls.length ? urls.join(",") : "none";
	};
	const query = new URLSearchParams({
		trackers: list("tracker"),
		mqtt: list("mqtt"),
		nostr: list("nostr"),
		stun: "none",
	});
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(
		`http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?${query}`,
	);
	await page.waitForFunction(() => window.ocHarness !== undefined);
	return { label, page };
}

async function measures(
	page: Page,
): Promise<readonly [number, number, number]> {
	return page.evaluate(() => {
		const counters = window as unknown as {
			links: () => number;
			everConnected: () => number;
		};
		return [
			(window.ocHarness as Harness).view()?.peers.length ?? 0,
			counters.links(),
			counters.everConnected(),
		] as const;
	});
}

async function connect(browser: Browser, relays: Relays, bad = false) {
	const host = await player(browser, "host", relays, bad);
	const guest = await player(browser, "guest", relays, bad);
	const { key } = await host.page.evaluate(() =>
		(window.ocHarness as Harness).createTable("N"),
	);
	await guest.page.evaluate(
		(link) => (window.ocHarness as Harness).openTable(link),
		key,
	);
	for (const current of [host, guest])
		await expect
			.poll(async () => (await measures(current.page)).slice(0, 2), {
				message: `${current.label} connects`,
				timeout: CONNECT_MS,
			})
			.toEqual([1, 1]);
	return { host, guest, key };
}

const makeRelays = (
	kind: "tracker" | "mqtt" | "nostr" | "both" | "all",
): Relays => ({
	...(["tracker", "both", "all"].includes(kind)
		? { tracker: new RelayHub("tracker", [TRACKER]) }
		: {}),
	...(["mqtt", "both", "all"].includes(kind)
		? { mqtt: new RelayHub("mqtt", [MQTT]) }
		: {}),
	...(["nostr", "all"].includes(kind)
		? { nostr: new RelayHub("nostr", [NOSTR], true) }
		: {}),
});

for (const kind of ["tracker", "mqtt", "nostr", "both", "all"] as const) {
	test(`${kind} discovery connects through a working relay`, async ({
		browser,
	}) => {
		const relays = makeRelays(kind);
		const { host, guest } = await connect(browser, relays);
		for (const current of [host, guest])
			for (const hub of Object.values(relays))
				expect(hub.received(current.label), hub.kind).toBeGreaterThan(0);
		expect(relays.nostr?.invalidEvents() ?? 0).toBe(0);
		if (kind === "both" || kind === "all") {
			await host.page.waitForTimeout(10_000);
			for (const current of [host, guest])
				expect(await measures(current.page)).toEqual([1, 1, 1]);
		}
	});

	test(`${kind} discovery connects when other relays fail or stay silent`, async ({
		browser,
	}) => {
		const relays = makeRelays(kind);
		const { host, guest } = await connect(browser, relays, true);
		for (const current of [host, guest])
			for (const hub of Object.values(relays))
				expect(hub.received(current.label), hub.kind).toBeGreaterThan(0);
	});
}

test("Nostr alone connects four pages", async ({ browser }) => {
	const relays = makeRelays("nostr");
	const { host, guest, key } = await connect(browser, relays);
	const third = await player(browser, "third", relays, false);
	const fourth = await player(browser, "fourth", relays, false);
	for (const current of [third, fourth])
		await current.page.evaluate(
			(link) => (window.ocHarness as Harness).openTable(link),
			key,
		);
	for (const current of [host, guest, third, fourth])
		await expect
			.poll(async () => (await measures(current.page)).slice(0, 2), {
				message: `${current.label} connects to the other three pages`,
				timeout: CONNECT_MS,
			})
			.toEqual([3, 3]);
	expect(relays.nostr?.invalidEvents()).toBe(0);
});

test("a wrong password cannot join a table through Nostr", async ({
	browser,
}) => {
	const relays = makeRelays("nostr");
	const host = await player(browser, "host", relays, false);
	const stranger = await player(browser, "stranger", relays, false);
	const { key } = await host.page.evaluate(() =>
		(window.ocHarness as Harness).createTable("N"),
	);
	await stranger.page.evaluate(
		(link) => (window.ocHarness as Harness).wrongKeyJoin(link),
		key,
	);
	await expect
		.poll(
			async () => {
				const hostView = await host.page.evaluate(() =>
					(window.ocHarness as Harness).view(),
				);
				const other = await stranger.page.evaluate(() =>
					(window.ocHarness as Harness).strangerView(),
				);
				return (
					(hostView?.network?.wrongKey ?? 0) + (other?.network.wrongKey ?? 0)
				);
			},
			{ timeout: CONNECT_MS },
		)
		.toBeGreaterThanOrEqual(1);
	expect((await measures(host.page))[0]).toBe(0);
	expect(
		await stranger.page.evaluate(
			() => (window.ocHarness as Harness).strangerView()?.peers,
		),
	).toBe(0);
});

for (const change of ["online", "resume"] as const) {
	test(`${change} repairs half-open tracker, Nostr and MQTT relays`, async ({
		browser,
	}) => {
		const relays = makeRelays("all");
		const { host, guest } = await connect(browser, relays);
		for (const hub of Object.values(relays)) hub.silence(guest.label);
		await guest.page.evaluate(() =>
			(window.ocHarness as Harness).dropLinks({ keepRelays: true }),
		);
		await guest.page.waitForTimeout(12_000);
		expect((await measures(guest.page))[0]).toBe(0);
		const changedAt = Date.now();
		await guest.page.evaluate((event) => {
			(event === "online" ? window : document).dispatchEvent(new Event(event));
		}, change);
		await expect
			.poll(async () => (await measures(guest.page)).slice(0, 2), {
				timeout: CONNECT_MS,
			})
			.toEqual([1, 1]);
		for (const hub of Object.values(relays))
			expect(hub.lastOpened(guest.label) ?? 0, hub.kind).toBeGreaterThanOrEqual(
				changedAt,
			);
		expect(await measures(host.page)).toEqual([1, 1, 2]);
	});
}

test("a latecomer connects after failed and silent relays have retried", async ({
	browser,
}) => {
	test.setTimeout(150_000);
	const relays = makeRelays("both");
	const { host, guest, key } = await connect(browser, relays, true);
	await host.page.waitForTimeout(50_000);
	const late = await player(browser, "late", relays, true);
	await late.page.evaluate(
		(link) => (window.ocHarness as Harness).openTable(link),
		key,
	);
	for (const current of [host, guest, late])
		await expect
			.poll(async () => (await measures(current.page)).slice(0, 2), {
				message: `${current.label} sees both peers`,
				timeout: CONNECT_MS,
			})
			.toEqual([2, 2]);
	expect((await measures(guest.page))[2]).toBe(2);
});

test("pages do not connect when every configured relay fails or stays silent", async ({
	browser,
}) => {
	const host = await player(browser, "host", {}, true);
	const guest = await player(browser, "guest", {}, true);
	const { key } = await host.page.evaluate(() =>
		(window.ocHarness as Harness).createTable("N"),
	);
	await guest.page.evaluate(
		(link) => (window.ocHarness as Harness).openTable(link),
		key,
	);
	await guest.page.waitForTimeout(15_000);
	expect((await measures(host.page))[0]).toBe(0);
	expect((await measures(guest.page))[0]).toBe(0);
});

test("disabling all three discovery transports opens no relay sockets", async ({
	browser,
}) => {
	const context = await browser.newContext();
	contexts.push(context);
	await context.addInitScript(() => {
		const Native = window.WebSocket;
		const relaySockets: string[] = [];
		(window as unknown as { relaySockets: string[] }).relaySockets =
			relaySockets;
		window.WebSocket = class extends Native {
			constructor(url: string | URL, protocols?: string | string[]) {
				if (String(url).startsWith("wss:")) relaySockets.push(String(url));
				super(url, protocols);
			}
		};
	});
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(
		`http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?trackers=none&nostr=none&mqtt=none&stun=none`,
	);
	await page.waitForFunction(() => window.ocHarness !== undefined);
	await page.evaluate(() => (window.ocHarness as Harness).createTable("N"));
	await page.waitForTimeout(1_000);
	expect(
		await page.evaluate(
			() => (window as unknown as { relaySockets: string[] }).relaySockets,
		),
	).toEqual([]);
});
