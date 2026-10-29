import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chatModule } from "../../src/game/chat";
import { newCommandId } from "../../src/ids";
import { randomNonce } from "../../src/p2p/checks";
import { deriveHolder, makeTag } from "../../src/p2p/keys";
import { SEED_WAIT_MS, TICK_MS } from "../../src/p2p/limits";
import type { MeshDiagnostics, MeshHandlers } from "../../src/p2p/mesh";
import { TableController, type TableMesh } from "../../src/p2p/table";
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
	tick = () => {};
	async start(): Promise<TableController> {
		const holder = await deriveHolder(TABLE, CLIENT);
		const mesh: TableMesh = {
			self: "self0000000000000000",
			peers: () => [],
			connection: () => undefined,
			online: () => true,
			diagnostics: () =>
				({
					webRtc: null,
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
			ctl: () => {},
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
			preferredSeat: "N",
			bootstrap: { config: CONFIG, host: "N" },
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

describe("seeding a missing table", () => {
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
