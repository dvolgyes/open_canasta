import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatModule } from "../../src/game/chat";
import { newCommandId } from "../../src/ids";
import { randomNonce } from "../../src/p2p/checks";
import { deriveHolder, makeTag } from "../../src/p2p/keys";
import {
	BEAT_MS,
	HOST_LOST_MS,
	SEED_WAIT_MS,
	TICK_MS,
} from "../../src/p2p/limits";
import { LINK_VERSION } from "../../src/p2p/link";
import { creationCommit, LocalLog } from "../../src/p2p/log";
import type { MeshDiagnostics, MeshHandlers } from "../../src/p2p/mesh";
import { TableController, type TableMesh } from "../../src/p2p/table";
import type { CtlMessage, Roster } from "../../src/p2p/wire";
import { SEATS, type Seat } from "../../src/protocol";
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
	readonly sent: { peer: string | null; message: CtlMessage }[] = [];
	tick = () => {};
	async start(
		host: "N" | "S" = "N",
		hostEligible = true,
		preferredSeat: Seat | null = "N",
	): Promise<TableController> {
		const holder = await deriveHolder(TABLE, CLIENT);
		const mesh: TableMesh = {
			self: "self0000000000000000",
			peers: () => this.peers,
			connection: () => undefined,
			online: () => true,
			diagnostics: () =>
				({
					webRtc: null,
					stun: null,
					trackersOpen: 1,
					trackers: 1,
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
				}) satisfies MeshDiagnostics,
			ctl: (peer, message) => {
				this.sent.push({ peer, message });
			},
			log: () => {},
			call: () => {},
			leave: async () => {},
			seek: () => {},
			tick: () => {},
		};
		const controller = new TableController({
			identity: { tableId: TABLE, client: CLIENT, holder },
			storage: this.storage,
			locks: {
				heldElsewhere: async () => new Set(),
				hold: (_id, _seat, options) => {
					queueMicrotask(() => options?.onAcquired?.());
					return () => {};
				},
			},
			memory: { tabSeat: () => undefined, remember: () => {} },
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
			hostEligible,
			bootstrap: { config: CONFIG, host },
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
		rig.handlers?.ctl(south, { k: "claim-seat", req: 1, seat: "S" });
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
