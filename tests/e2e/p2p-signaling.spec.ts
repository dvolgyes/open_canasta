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
const CONNECT_MS = 30_000;

interface Relays {
	readonly tracker?: RelayHub;
	readonly mqtt?: RelayHub;
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
		/^wss:\/\/fail-(tracker|mqtt)\.test\//,
		(socket) => {
			void socket.close();
		},
	);
	await context.routeWebSocket(
		/^wss:\/\/silent-(tracker|mqtt)\.test\//,
		() => {},
	);
	await relays.tracker?.install(context, label);
	await relays.mqtt?.install(context, label);
	const list = (kind: "tracker" | "mqtt"): string => {
		const failures = bad
			? [`wss://fail-${kind}.test/`, `wss://silent-${kind}.test/`]
			: [];
		const urls = [...failures, ...(relays[kind]?.urls ?? [])];
		return urls.length ? urls.join(",") : "none";
	};
	const query = new URLSearchParams({
		trackers: list("tracker"),
		mqtt: list("mqtt"),
		stun: "none",
	});
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`http://localhost:4174/?${query}`);
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

const makeRelays = (kind: "tracker" | "mqtt" | "both"): Relays => ({
	...(kind === "mqtt" ? {} : { tracker: new RelayHub("tracker", [TRACKER]) }),
	...(kind === "tracker" ? {} : { mqtt: new RelayHub("mqtt", [MQTT]) }),
});

for (const kind of ["tracker", "mqtt", "both"] as const) {
	test(`${kind} discovery connects through a working relay`, async ({
		browser,
	}) => {
		const relays = makeRelays(kind);
		const { host, guest } = await connect(browser, relays);
		for (const current of [host, guest])
			for (const hub of Object.values(relays))
				expect(hub.received(current.label), hub.kind).toBeGreaterThan(0);
		if (kind === "both") {
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

for (const change of ["online", "resume"] as const) {
	test(`${change} repairs half-open tracker and MQTT relays`, async ({
		browser,
	}) => {
		const relays = makeRelays("both");
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
