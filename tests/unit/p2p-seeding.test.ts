import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatModule, chatPayload } from "../../src/game/chat";
import { newCommandId } from "../../src/ids";
import { randomNonce } from "../../src/p2p/checks";
import { deriveHolder, makeTag } from "../../src/p2p/keys";
import {
	BEAT_MS,
	BUSY_WAIT_MS,
	HOST_LOST_MS,
	RESUME_ONLINE_MS,
	SEED_WAIT_MS,
	TICK_MS,
} from "../../src/p2p/limits";
import { LINK_VERSION } from "../../src/p2p/link";
import { creationCommit, LocalLog } from "../../src/p2p/log";
import type { MeshDiagnostics, MeshHandlers } from "../../src/p2p/mesh";
import {
	createTable,
	TableController,
	type TableMesh,
} from "../../src/p2p/table";
import type { CtlMessage, Roster } from "../../src/p2p/wire";
import {
	DEFAULT_BOT_SETUP,
	SEATS,
	type Seat,
	type TableConfig,
} from "../../src/protocol";
import { settle, syncDigest, TestStorage, VirtualClock } from "./fake-mesh";
import { CONFIG, TABLE } from "./p2p-fixtures";

const CLIENT = "clientN-0123456789abcd";
let restore: () => void;
beforeEach(() => {
	restore = syncDigest();
});
afterEach(() => restore());

class Rig {
	readonly clock = new VirtualClock();
	readonly storage = new TestStorage();
	handlers: MeshHandlers | undefined;
	peers: string[] = [];
	online = true;
	loseOnAcquire = false;
	loseLock = () => {};
	releases = 0;
	meshLeaves = 0;
	config: TableConfig = CONFIG;
	hostedSeat: Seat | undefined;
	readonly sent: { peer: string | null; message: CtlMessage }[] = [];
	tick = () => {};
	async start(
		host: "N" | "S" = "N",
		hostEligible = true,
		preferredSeat: Seat | null = "N",
		reopenLastHost = false,
	): Promise<TableController> {
		const holder = await deriveHolder(TABLE, CLIENT);
		const mesh: TableMesh = {
			self: "self0000000000000000",
			peers: () => this.peers,
			connection: () => undefined,
			online: () => this.online,
			diagnostics: () =>
				({
					webRtc: null,
					stun: null,
					relays: [],
					trackersOpen: 1,
					trackers: 1,
					nostrOpen: 0,
					nostrRelays: 0,
					mqttBrokersOpen: 0,
					mqttBrokers: 0,
					peers: 0,
					wrongKey: 0,
					unreachable: 0,
					refused: 0,
					incompatible: 0,
					dropped: {
						malformed: 0,
						incompatible: 0,
						foreign: 0,
						oversize: 0,
						rate: 0,
						stranger: 0,
					},
					sendFailures: 0,
					pairRooms: 0,
					repaired: 0,
					pairTimeouts: 0,
					unattached: 0,
					rejoins: 0,
					silentCloses: 0,
				}) satisfies MeshDiagnostics,
			ctl: (peer, message) => {
				this.sent.push({ peer, message });
			},
			log: () => {},
			call: () => {},
			leave: async () => {
				this.meshLeaves++;
			},
			seek: () => {},
			tick: () => {},
		};
		const controller = new TableController({
			identity: { tableId: TABLE, client: CLIENT, holder },
			storage: this.storage,
			locks: {
				heldElsewhere: async () => new Set(),
				hold: (_id, _seat, options) => {
					this.loseLock = () => options?.onLost?.();
					queueMicrotask(() => {
						options?.onAcquired?.();
						if (this.loseOnAcquire) options?.onLost?.();
					});
					return () => {
						this.releases++;
					};
				},
			},
			memory: {
				tabSeat: () => undefined,
				remember: () => {},
				forget: () => {},
				hostSeat: () => this.hostedSeat,
				rememberHost: (_table, seat) => {
					this.hostedSeat = seat;
				},
				forgetHost: () => {
					this.hostedSeat = undefined;
				},
			},
			module: chatModule,
			clock: this.clock,
			every: (_ms, tick) => {
				this.tick = tick;
				return () => {};
			},
			openMesh: (handlers) => {
				this.handlers = handlers;
				return mesh;
			},
			newId: newCommandId,
			nonce: randomNonce,
			...(preferredSeat === null ? {} : { preferredSeat }),
			reopenLastHost,
			hostEligible,
			bootstrap: { config: this.config, host },
		});
		await controller.start();
		await settle();
		return controller;
	}
	async advance(ms: number): Promise<void> {
		for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
			this.clock.now += TICK_MS;
			this.tick();
			await settle();
		}
	}
}

it("stops if a seat lock is lost before its acquisition is recorded", async () => {
	const rig = new Rig();
	rig.loseOnAcquire = true;
	const controller = await rig.start();
	try {
		await rig.advance(2 * SEED_WAIT_MS);
		expect(controller.view()).toMatchObject({
			status: "superseded",
			supersededBy: "tab",
			seat: null,
			hosting: false,
		});
		expect(rig.releases).toBe(0);
		expect(rig.storage.commits).toBe(0);
		expect(await controller.send(chatPayload(TABLE, "after loss"))).toEqual({
			ok: false,
			code: "conflict",
		});
	} finally {
		controller.stop();
	}
});

it("stops and does not release the replacement lock when a hosting tab loses its lock", async () => {
	const rig = new Rig();
	const controller = await rig.start();
	try {
		await rig.advance(SEED_WAIT_MS + TICK_MS);
		expect(controller.view().hosting).toBe(true);
		expect(
			await controller.send(chatPayload(TABLE, "before loss")),
		).toMatchObject({ ok: true });
		await settle();
		const commits = rig.storage.commits;
		rig.loseLock();
		expect(controller.view()).toMatchObject({
			status: "superseded",
			supersededBy: "tab",
			seat: null,
			hosting: false,
		});
		expect(rig.releases).toBe(0);
		expect(rig.meshLeaves).toBe(1);
		expect(await controller.send(chatPayload(TABLE, "after loss"))).toEqual({
			ok: false,
			code: "conflict",
		});
		await settle();
		expect(rig.storage.commits).toBe(commits);
	} finally {
		controller.stop();
	}
});

it("releases its own lock on stop and ignores a later loss notification", async () => {
	const rig = new Rig();
	const controller = await rig.start();
	controller.stop();
	expect(rig.releases).toBe(1);
	rig.loseLock();
	expect(controller.view().supersededBy).toBeNull();
	expect(rig.releases).toBe(1);
});

it("returns to the picker when another player took the personal-link seat", async () => {
	const rig = new Rig();
	const holder = await deriveHolder(TABLE, CLIENT);
	const log = new LocalLog(rig.storage, TABLE, "N");
	expect(
		await log.write(() =>
			creationCommit({
				tableId: TABLE,
				seat: "N",
				holder,
				config: CONFIG,
				state: chatModule.initialState(TABLE, CONFIG),
				auth: { term: 1, tag: makeTag(holder, "N"), inc: 1 },
				id: newCommandId(),
				now: rig.clock.wall(),
			}),
		),
	).toMatchObject({ ok: true });
	const peer = "east000000000000000";
	rig.peers = [peer];
	const controller = await rig.start("N", true, "N");
	try {
		const hostHolder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 2, tag: makeTag(hostHolder, "E"), inc: 1 };
		rig.handlers?.ctl(peer, {
			k: "beat",
			role: "host",
			holder: hostHolder,
			seat: "E",
			elig: true,
			auth,
			pos: { rev: 5, lastAuth: auth },
		});
		await settle();
		rig.handlers?.ctl(peer, { k: "welcome", status: "superseded", auth });
		await settle();
		expect(controller.view()).toMatchObject({
			status: "open",
			seat: null,
			seatError: "taken",
		});
		rig.loseLock();
		expect(controller.view()).toMatchObject({
			status: "open",
			seat: null,
			seatError: "taken",
		});
	} finally {
		controller.stop();
	}
});

it("still marks a personal-link seat superseded when another tab holds it", async () => {
	const rig = new Rig();
	const holder = await deriveHolder(TABLE, CLIENT);
	const log = new LocalLog(rig.storage, TABLE, "N");
	expect(
		await log.write(() =>
			creationCommit({
				tableId: TABLE,
				seat: "N",
				holder,
				config: CONFIG,
				state: chatModule.initialState(TABLE, CONFIG),
				auth: { term: 1, tag: makeTag(holder, "N"), inc: 1 },
				id: newCommandId(),
				now: rig.clock.wall(),
			}),
		),
	).toMatchObject({ ok: true });
	const peer = "east000000000000000";
	rig.peers = [peer];
	const controller = await rig.start("N", true, "N");
	try {
		const hostHolder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 2, tag: makeTag(hostHolder, "E"), inc: 1 };
		const beat = () =>
			rig.handlers?.ctl(peer, {
				k: "beat",
				role: "host",
				holder: hostHolder,
				seat: "E",
				elig: true,
				auth,
				pos: { rev: 5, lastAuth: auth },
			});
		beat();
		await settle();
		rig.handlers?.ctl(peer, {
			k: "welcome",
			status: "superseded",
			busy: true,
			auth,
		});
		for (let elapsed = 0; elapsed < BUSY_WAIT_MS; elapsed += BEAT_MS) {
			beat();
			await rig.advance(BEAT_MS);
		}
		expect(controller.view()).toMatchObject({
			status: "superseded",
			supersededBy: "tab",
			seatError: null,
		});
	} finally {
		controller.stop();
	}
});

describe("offline solo recovery", () => {
	it("reserves only explicitly selected bot seats, regardless of player names", async () => {
		const rig = new Rig();
		const holder = await deriveHolder(TABLE, CLIENT);
		const config = {
			...CONFIG,
			names: { N: "Ann", E: "Robot East", S: "Abbot", W: "Robot West" },
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E"] as Seat[] },
		};
		const created = await createTable({
			storage: rig.storage,
			identity: { tableId: TABLE, client: CLIENT, holder },
			seat: "N",
			config,
			module: chatModule,
			newId: newCommandId,
			clock: rig.clock,
			memory: { remember: () => {} },
			hostBots: true,
		});
		expect(created.ok).toBe(true);
		const stored = await rig.storage.load(TABLE, "N");
		if (!stored.ok || !stored.value) throw new Error("missing created table");
		const seats = stored.value.table.seats;
		expect(seats.find((row) => row.seat === "E")?.holder).not.toBeNull();
		expect(seats.find((row) => row.seat === "S")?.holder).toBeNull();
		expect(seats.find((row) => row.seat === "W")?.holder).toBeNull();
	});

	it.each([
		{ bots: ["E", "S", "W"] as Seat[], resumes: true },
		{ bots: ["E", "S"] as Seat[], resumes: false },
	])(
		"uses stored seat owners to determine solo status: %j",
		async ({ bots, resumes }) => {
			const rig = new Rig();
			const holder = await deriveHolder(TABLE, CLIENT);
			const config = {
				...CONFIG,
				botSetup: { ...DEFAULT_BOT_SETUP, seats: bots },
			};
			expect(
				await createTable({
					storage: rig.storage,
					identity: { tableId: TABLE, client: CLIENT, holder },
					seat: "N",
					config,
					module: chatModule,
					newId: newCommandId,
					clock: rig.clock,
					memory: { remember: () => {} },
					hostBots: true,
				}),
			).toMatchObject({ ok: true });
			rig.online = false;
			rig.config = {
				...CONFIG,
				botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "S", "W"] },
			};
			const controller = await rig.start();
			try {
				await rig.advance(RESUME_ONLINE_MS + TICK_MS);
				expect(controller.view().hosting).toBe(resumes);
				if (!resumes) {
					rig.online = true;
					await rig.advance(RESUME_ONLINE_MS + TICK_MS);
					expect(controller.view().hosting).toBe(true);
				}
			} finally {
				controller.stop();
			}
		},
	);

	it("requires network recovery when a human-owned seat uses autoplay", async () => {
		const rig = new Rig();
		const holder = await deriveHolder(TABLE, CLIENT);
		const config = {
			...CONFIG,
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "S"] as Seat[] },
		};
		expect(
			await createTable({
				storage: rig.storage,
				identity: { tableId: TABLE, client: CLIENT, holder },
				seat: "N",
				config,
				module: chatModule,
				newId: newCommandId,
				clock: rig.clock,
				memory: { remember: () => {} },
				hostBots: true,
			}),
		).toMatchObject({ ok: true });
		const original = await rig.start();
		await rig.advance(RESUME_ONLINE_MS + TICK_MS);
		expect(original.view().hosting).toBe(true);
		const peer = "west0000000000000000";
		rig.peers = [peer];
		rig.handlers?.join(peer);
		rig.handlers?.ctl(peer, {
			k: "hello",
			b: LINK_VERSION,
			client: "clientW-0123456789abcd",
			features: [],
		});
		await settle();
		rig.handlers?.ctl(peer, {
			k: "claim-seat",
			req: 1,
			seat: "W",
			gen: 0,
			nameRevision: 0,
		});
		await settle();
		expect(rig.sent).toContainEqual({
			peer,
			message: expect.objectContaining({ k: "seat-result", ok: true }),
		});
		expect(await original.setBotSeat("W", true)).toBe(true);
		original.stop();
		rig.peers = [];
		rig.online = false;
		const reopened = await rig.start();
		try {
			await rig.advance(RESUME_ONLINE_MS + TICK_MS);
			expect(reopened.view().hosting).toBe(false);
		} finally {
			reopened.stop();
		}
	});
});

it("keeps existing peers present when a rejected seat claimant later hosts", async () => {
	const rig = new Rig();
	const holder = await deriveHolder(TABLE, CLIENT);
	const log = new LocalLog(rig.storage, TABLE, "N");
	const written = await log.write(() =>
		creationCommit({
			tableId: TABLE,
			seat: "N",
			holder,
			config: CONFIG,
			state: chatModule.initialState(TABLE, CONFIG),
			auth: { term: 1, tag: makeTag(holder, "N"), inc: 1 },
			id: newCommandId(),
			now: rig.clock.wall(),
		}),
	);
	expect(written.ok).toBe(true);
	const east = "east000000000000000";
	const south = "south00000000000000";
	rig.peers = [east, south];
	const controller = await rig.start("N", true, null);
	try {
		const eastHolder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const southHolder = await deriveHolder(TABLE, "clientS-0123456789abcd");
		const auth = { term: 2, tag: makeTag(eastHolder, "E"), inc: 1 };
		const southBeat = () =>
			rig.handlers?.ctl(south, {
				k: "beat",
				role: "follower",
				holder: southHolder,
				seat: "S",
				elig: true,
				pos: { rev: 0, lastAuth: null },
			});
		rig.handlers?.ctl(east, {
			k: "beat",
			role: "host",
			holder: eastHolder,
			seat: "E",
			elig: true,
			auth,
			pos: { rev: 5, lastAuth: auth },
		});
		await settle();
		rig.handlers?.ctl(east, { k: "welcome", status: "unseated", auth });
		rig.handlers?.ctl(east, {
			k: "lobby",
			auth,
			config: CONFIG,
			idleMs: 0,
			seats: SEATS.map((seat) => ({
				seat,
				gen: 0,
				nameRevision: 0,
				needsName: false,
				available: seat === "S",
				online: seat !== "S",
				mine: false,
			})),
		});
		await settle();
		expect(await controller.choose("S")).toEqual({ ok: true });
		await settle();
		const claim = rig.sent.find(
			({ message }) => message.k === "claim-seat",
		)?.message;
		if (claim?.k !== "claim-seat") throw new Error("claim missing");
		rig.handlers?.ctl(east, {
			k: "seat-result",
			req: claim.req,
			ok: false,
			code: "taken",
		});
		await settle();
		expect(controller.view().seat).toBeNull();
		rig.peers = [south];
		rig.handlers?.leave(east);
		await settle();
		expect(await controller.choose("N")).toEqual({ ok: true });
		for (
			let elapsed = 0;
			elapsed < 3 * SEED_WAIT_MS && !controller.view().hosting;
			elapsed += BEAT_MS
		) {
			southBeat();
			await rig.advance(BEAT_MS);
		}
		expect(controller.view().hosting).toBe(true);
		rig.handlers?.ctl(south, {
			k: "hello",
			b: LINK_VERSION,
			client: "clientS-0123456789abcd",
			features: [],
		});
		await settle();
		rig.handlers?.ctl(south, {
			k: "claim-seat",
			req: 1,
			seat: "S",
			gen: 0,
			nameRevision: 0,
		});
		await settle();
		southBeat();
		await rig.advance(4 * TICK_MS);
		const rosters = rig.sent.filter(
			(item): item is { peer: string | null; message: Roster } =>
				item.message.k === "roster" && item.peer === south,
		);
		expect(rosters.at(-1)?.message.peers).toContainEqual(
			expect.objectContaining({ peer: south, seat: "S" }),
		);
	} finally {
		controller.stop();
	}
});

describe("seeding a missing table", () => {
	it("lets the last host seed after five seconds when no peer reports the table", async () => {
		const rig = new Rig();
		rig.hostedSeat = "N";
		const controller = await rig.start("N");
		try {
			await rig.advance(5_000 - TICK_MS);
			expect(rig.storage.commits).toBe(0);
			await rig.advance(2 * TICK_MS);
			expect(controller.view().hosting).toBe(true);
		} finally {
			controller.stop();
		}
	});

	it("reopens the last host seat only when the link has no seat selection", async () => {
		const rig = new Rig();
		rig.hostedSeat = "N";
		const visitor = await rig.start("N", true, null);
		expect(visitor.view().seat).toBeNull();
		visitor.stop();
		const returning = await rig.start("N", true, null, true);
		try {
			expect(returning.view().seat).toBe("N");
		} finally {
			returning.stop();
		}
	});

	it("keeps the full wait after another peer reports an existing table", async () => {
		const rig = new Rig();
		rig.hostedSeat = "N";
		const controller = await rig.start("N");
		const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 1, tag: makeTag(holder, "E"), inc: 1 };
		try {
			rig.handlers?.ctl("east000000000000000", {
				k: "beat",
				role: "follower",
				holder,
				seat: "E",
				elig: true,
				auth,
				seenAgoMs: 0,
				pos: { rev: 4, lastAuth: auth },
			});
			await rig.advance(6_000);
			expect(rig.storage.commits).toBe(0);
		} finally {
			controller.stop();
		}
	});

	it("forgets the last host marker after following a different browser", async () => {
		const rig = new Rig();
		rig.hostedSeat = "N";
		const controller = await rig.start("N");
		const peer = "east000000000000000";
		const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 1, tag: makeTag(holder, "E"), inc: 1 };
		try {
			rig.peers = [peer];
			rig.handlers?.join(peer);
			rig.handlers?.ctl(peer, {
				k: "beat",
				role: "host",
				holder,
				seat: "E",
				elig: true,
				auth,
				pos: { rev: 4, lastAuth: auth },
			});
			await settle();
			expect(rig.hostedSeat).toBeUndefined();
		} finally {
			controller.stop();
		}
	});
	it("starts a solo setup without waiting for the normal host timeout", async () => {
		const rig = new Rig();
		rig.config = {
			...CONFIG,
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "S", "W"] },
		};
		const controller = await rig.start("N");
		try {
			await rig.advance(2 * TICK_MS);
			expect(controller.view().hosting).toBe(true);
		} finally {
			controller.stop();
		}
	});

	it("does not seed a solo setup while another peer reports its table", async () => {
		const rig = new Rig();
		rig.config = {
			...CONFIG,
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "S", "W"] },
		};
		const controller = await rig.start("N");
		const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 1, tag: makeTag(holder, "E"), inc: 1 };
		try {
			rig.handlers?.ctl("east000000000000000", {
				k: "beat",
				role: "follower",
				holder,
				seat: "E",
				elig: true,
				auth,
				seenAgoMs: 0,
				pos: { rev: 4, lastAuth: auth },
			});
			await rig.advance(2 * TICK_MS);
			expect(rig.storage.commits).toBe(0);
		} finally {
			controller.stop();
		}
	});
	it("keeps a player's chosen name in the seeded claim", async () => {
		const rig = new Rig();
		rig.config = { ...CONFIG, names: { ...CONFIG.names, N: "player" } };
		const controller = await rig.start("N", true, null);
		try {
			expect(await controller.choose("N", "Alice")).toEqual({ ok: true });
			await rig.advance(SEED_WAIT_MS + 2 * TICK_MS);
			const stored = await rig.storage.load(TABLE, "N");
			if (!stored.ok || !stored.value) throw new Error("missing seeded table");
			expect(stored.value.table.players.N).toMatchObject({
				name: "Alice",
				askOnEntry: true,
				rev: 1,
			});
			expect(stored.value.entries[0]).toMatchObject({
				kind: "seat",
				seat: "N",
				op: { type: "claim", name: "Alice" },
			});
		} finally {
			controller.stop();
		}
	});

	it("rejects an invalid chosen name before taking a seat", async () => {
		const rig = new Rig();
		rig.config = { ...CONFIG, names: { ...CONFIG.names, N: "player" } };
		const controller = await rig.start("N", true, null);
		try {
			for (const name of ["player", " Alice ", "Alice\nBob"])
				expect(await controller.choose("N", name)).toEqual({
					ok: false,
					reason: "refused",
				});
			expect(controller.view().seat).toBeNull();
			expect(rig.storage.commits).toBe(0);
		} finally {
			controller.stop();
		}
	});

	it("stores configured bot claims when seeding a reusable table", async () => {
		const rig = new Rig();
		rig.config = {
			...CONFIG,
			names: { N: "Ann", E: "East bot", S: "Abbot", W: "West bot" },
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "W"] },
		};
		const controller = await rig.start("N");
		try {
			await rig.advance(SEED_WAIT_MS + 2 * TICK_MS);
			const stored = await rig.storage.load(TABLE, "N");
			if (!stored.ok || !stored.value) throw new Error("missing seeded table");
			const rows = stored.value.table.seats;
			expect(rows.find((row) => row.seat === "E")?.holder).not.toBeNull();
			expect(rows.find((row) => row.seat === "W")?.holder).not.toBeNull();
			expect(rows.find((row) => row.seat === "S")?.holder).toBeNull();
		} finally {
			controller.stop();
		}
	});

	it("resumes a freshly seeded solo table offline", async () => {
		const rig = new Rig();
		rig.config = {
			...CONFIG,
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "S", "W"] },
		};
		const first = await rig.start("N");
		await rig.advance(SEED_WAIT_MS + 2 * TICK_MS);
		expect(first.view().hosting).toBe(true);
		first.stop();
		rig.online = false;
		const reopened = await rig.start("N");
		try {
			await rig.advance(RESUME_ONLINE_MS + TICK_MS);
			expect(reopened.view().hosting).toBe(true);
		} finally {
			reopened.stop();
		}
	});

	it("does not write a seed after its seat lock is lost before the queued write", async () => {
		const rig = new Rig();
		rig.config = {
			...CONFIG,
			botSetup: { ...DEFAULT_BOT_SETUP, seats: ["E", "S", "W"] },
		};
		const controller = await rig.start("N");
		const write = vi.spyOn(LocalLog.prototype, "write");
		try {
			rig.clock.now += TICK_MS;
			rig.tick();
			expect(write).toHaveBeenCalledTimes(1);
			rig.loseLock();
			await settle();
			expect(rig.storage.commits).toBe(0);
			expect(controller.view()).toMatchObject({ status: "superseded" });
		} finally {
			write.mockRestore();
			controller.stop();
		}
	});

	it("keeps hosting a fresh seed while a lower-priority witness is present", async () => {
		const rig = new Rig();
		const controller = await rig.start("S", true, "W");
		const holder = await deriveHolder(TABLE, "clientX-0123456789abcd");
		try {
			for (let elapsed = 0; elapsed < 2 * SEED_WAIT_MS; elapsed += BEAT_MS) {
				rig.handlers?.ctl("north00000000000000", {
					k: "beat",
					role: "follower",
					holder,
					seat: "N",
					elig: true,
					pos: { rev: 0, lastAuth: null },
					pref: "S",
				});
				await settle();
				await rig.advance(BEAT_MS);
			}
			expect(controller.view().hosting).toBe(true);
			expect(rig.storage.commits).toBe(1);
		} finally {
			controller.stop();
		}
	});

	it("retains a fresh host announcement received during the seed write", async () => {
		const rig = new Rig();
		const peer = "east000000000000000";
		rig.peers = [peer];
		let release: () => void = () => {};
		let writing = false;
		const commit = rig.storage.commit.bind(rig.storage);
		vi.spyOn(rig.storage, "commit").mockImplementation(async (change) => {
			writing = true;
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return commit(change);
		});
		const controller = await rig.start();
		try {
			await rig.advance(SEED_WAIT_MS + BEAT_MS);
			expect(writing).toBe(true);
			const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
			const auth = { term: 2, tag: makeTag(holder, "E"), inc: 1 };
			rig.handlers?.ctl(peer, {
				k: "beat",
				role: "host",
				holder,
				seat: "E",
				elig: true,
				auth,
				pos: { rev: 1, lastAuth: auth },
			});
			release();
			await settle();
			expect(controller.view().hosting).toBe(false);
		} finally {
			release();
			controller.stop();
		}
	});

	it("does not revive a host announcement that expired during the seed write", async () => {
		const rig = new Rig();
		const peer = "east000000000000000";
		rig.peers = [peer];
		let release: () => void = () => {};
		let writing = false;
		const commit = rig.storage.commit.bind(rig.storage);
		vi.spyOn(rig.storage, "commit").mockImplementation(async (change) => {
			writing = true;
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return commit(change);
		});
		const controller = await rig.start();
		try {
			await rig.advance(SEED_WAIT_MS + BEAT_MS);
			expect(writing).toBe(true);
			const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
			const auth = { term: 2, tag: makeTag(holder, "E"), inc: 1 };
			rig.handlers?.ctl(peer, {
				k: "beat",
				role: "host",
				holder,
				seat: "E",
				elig: true,
				auth,
				pos: { rev: 1, lastAuth: auth },
			});
			rig.clock.now += HOST_LOST_MS;
			release();
			await settle();
			expect(controller.view().hosting).toBe(true);
		} finally {
			release();
			controller.stop();
		}
	});
	it("never lets an ineligible automated client seed a table", async () => {
		const rig = new Rig();
		const controller = await rig.start("N", false);
		await rig.advance(2 * SEED_WAIT_MS);
		expect(rig.storage.commits).toBe(0);
		expect(controller.view().hosting).toBe(false);
		controller.stop();
	});
	it("starts from a non-host seat when no higher-priority page is present", async () => {
		const rig = new Rig();
		const controller = await rig.start("S");
		await rig.advance(SEED_WAIT_MS + 2 * TICK_MS);
		expect(controller.view().hosting).toBe(true);
		controller.stop();
	});

	it("waits for a higher-priority seed candidate, then starts after it leaves", async () => {
		const rig = new Rig();
		const controller = await rig.start("S");
		const holder = await deriveHolder(TABLE, "clientW-0123456789abcd");
		for (let elapsed = 0; elapsed < 2 * SEED_WAIT_MS; elapsed += BEAT_MS) {
			rig.handlers?.ctl("west000000000000000", {
				k: "beat",
				role: "follower",
				holder,
				seat: "W",
				elig: true,
				pos: { rev: 0, lastAuth: null },
				pref: "S",
			});
			await rig.advance(BEAT_MS);
		}
		expect(rig.storage.commits).toBe(0);
		rig.handlers?.leave("west000000000000000");
		await rig.advance(2 * TICK_MS);
		expect(controller.view().hosting).toBe(true);
		controller.stop();
	});

	it("does not treat an old hearsay report as evidence of an existing table", async () => {
		const rig = new Rig();
		const controller = await rig.start("N");
		const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 1, tag: makeTag(holder, "E"), inc: 1 };
		for (let elapsed = 0; elapsed < 2 * SEED_WAIT_MS; elapsed += BEAT_MS) {
			rig.handlers?.ctl("east000000000000000", {
				k: "beat",
				role: "follower",
				holder,
				seat: "E",
				elig: false,
				pos: { rev: 0, lastAuth: null },
				auth,
				seenAgoMs: HOST_LOST_MS,
			});
			await rig.advance(BEAT_MS);
		}
		expect(controller.view().hosting).toBe(true);
		controller.stop();
	});
	it("waits online before starting a fresh table", async () => {
		const rig = new Rig();
		const controller = await rig.start();
		await rig.advance(SEED_WAIT_MS - TICK_MS);
		expect(rig.storage.commits).toBe(0);
		await rig.advance(2 * TICK_MS);
		expect(controller.view().hosting).toBe(true);
		controller.stop();
	});

	it("defers seeding while peers report an existing table", async () => {
		const rig = new Rig();
		const controller = await rig.start();
		await rig.advance(10_000);
		const holder = await deriveHolder(TABLE, "clientE-0123456789abcd");
		const auth = { term: 1, tag: makeTag(holder, "E"), inc: 1 };
		rig.handlers?.ctl("east000000000000000", {
			k: "beat",
			role: "follower",
			holder,
			seat: "E",
			elig: true,
			auth,
			seenAgoMs: 60_000,
			pos: { rev: 4, lastAuth: auth },
		});
		await rig.advance(SEED_WAIT_MS - TICK_MS);
		expect(rig.storage.commits).toBe(0);
		await rig.advance(2 * TICK_MS);
		expect(controller.view().hosting).toBe(true);
		controller.stop();
	});
});
