import { RTCPeerConnection as WeriftPeerConnection } from "werift";
import { parseTableSetup } from "../bookmark";
import { canastaModule } from "../game/canasta";
import { newCommandId } from "../ids";
import { randomNonce } from "../p2p/checks";
import { readMeshConfig } from "../p2p/config";
import { parseRoute } from "../p2p/link";
import type { Mesh } from "../p2p/mesh";
import type { Clock } from "../p2p/ports";
import { MemoryStorage } from "../p2p/storage";
import { TableController, tableIdentity } from "../p2p/table";
import { trysteroMesh } from "../p2p/trystero";
import type { Seat, TableConfig } from "../protocol";
import { isBotName, SEATS } from "../protocol";
import { type SeatLocks, SeatMemory } from "../session";
import { cliChooser } from "./cli-chooser";
import { ClientBotRunner } from "./client-runner";

interface Options {
	readonly url: URL;
	readonly username?: string;
	readonly random: boolean;
	readonly llm: boolean;
	readonly model?: string;
	readonly thinkingTimeMs: number;
}

function parseArgs(argv: readonly string[]): Options {
	let urlText: string | undefined;
	let username: string | undefined;
	let random = false;
	let llm = false;
	let model: string | undefined;
	let thinkingTimeMs = 250;
	for (let index = 0; index < argv.length; index++) {
		const value = argv[index];
		if (value === "--random") {
			random = true;
		} else if (value === "--llm") {
			llm = true;
		} else if (value === "--model") {
			const name = argv[++index]?.trim();
			if (!name || name.startsWith("--"))
				throw new Error("--model needs a model name");
			model = name;
		} else if (value === "--user") {
			const name = argv[++index]?.trim();
			if (!name) throw new Error("--user needs a player name");
			username = name;
		} else if (value === "--think-seconds") {
			const seconds = Number(argv[++index]);
			if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60)
				throw new Error("--think-seconds needs a number from 0 to 60");
			thinkingTimeMs = seconds * 1000;
		} else if (value?.startsWith("--")) {
			throw new Error(`unknown option: ${value}`);
		} else if (urlText === undefined && value !== undefined) {
			urlText = value;
		} else {
			throw new Error("provide one table URL");
		}
	}
	if (urlText === undefined)
		throw new Error(
			"usage: npm run bot -- <table-url> [--user <name>] [--think-seconds <seconds>] [--llm [--model <id>] | --random]",
		);
	let url: URL;
	try {
		url = new URL(urlText);
	} catch {
		throw new Error("the table URL is not valid");
	}
	const route = parseRoute(url.hash);
	if (route.kind !== "table")
		throw new Error("the URL does not contain a valid table link");
	return {
		url,
		...(username === undefined ? {} : { username }),
		random,
		llm,
		...(model === undefined ? {} : { model }),
		thinkingTimeMs,
	};
}

function candidateSeats(
	config: TableConfig,
	username: string | undefined,
): Seat[] {
	const wanted = username?.toLocaleLowerCase();
	return SEATS.filter((seat) => {
		const name = config.names[seat].trim();
		return wanted === undefined
			? isBotName(name)
			: name.toLocaleLowerCase() === wanted;
	});
}

function describeFailure(error: unknown, secrets: readonly string[]): string {
	const message = error instanceof Error ? error.message : "Unexpected error";
	return secrets.reduce(
		(text, secret) => (secret ? text.replaceAll(secret, "[redacted]") : text),
		message,
	);
}

async function run(options: Options): Promise<void> {
	const route = parseRoute(options.url.hash);
	if (route.kind !== "table")
		throw new Error("the URL does not contain a valid table link");
	const setup = parseTableSetup(options.url.search);
	const initialCandidates = setup
		? candidateSeats(setup.config, options.username)
		: undefined;
	if (initialCandidates?.length === 0) {
		throw new Error(
			options.username === undefined
				? "no seat named bot or robot was found in the table link"
				: `no seat named ${options.username} was found in the table link`,
		);
	}
	const apiKey = options.llm ? process.env.OPENROUTER_API_KEY : undefined;
	const chooser = cliChooser(
		options,
		setup?.config.botSetup,
		apiKey,
		(message) => console.error(message),
	);
	const meshResult = readMeshConfig(process.env);
	if (!meshResult.ok) throw new Error(meshResult.error);

	const clock: Clock = {
		monotonic: () => performance.now(),
		wall: () => Date.now(),
	};
	const storage = new MemoryStorage();
	const memory = new SeatMemory(undefined);
	const locks: SeatLocks = {
		heldElsewhere: async () => new Set(),
		hold: (_tableId, _seat, optionsForLock) => {
			queueMicrotask(() => optionsForLock?.onAcquired?.());
			return () => {};
		},
	};
	const identity = await tableIdentity(route.key, undefined);
	let mesh: Mesh | undefined;
	const openMesh = trysteroMesh(
		identity.tableId,
		route.key,
		meshResult.config,
		clock,
		WeriftPeerConnection as unknown as typeof RTCPeerConnection,
	);
	const controller = new TableController({
		automated: true,
		identity,
		storage,
		locks,
		memory,
		module: canastaModule,
		hostEligible: false,
		clock,
		every: (ms, tick) => {
			const timer = setInterval(tick, ms);
			return () => clearInterval(timer);
		},
		openMesh: (handlers) => {
			mesh = openMesh(handlers);
			return mesh;
		},
		newId: newCommandId,
		nonce: randomNonce,
	});
	let stopped = false;
	let choosing = false;
	let requestedSeat: Seat | undefined;
	const runner = new ClientBotRunner(
		controller,
		chooser,
		(message) =>
			console.error(`${controller.view().seat ?? "bot"}: ${message}`),
		(label, seat) => console.log(`Sent ${label} for ${seat}.`),
		options.thinkingTimeMs,
	);
	const triedSeats = new Set<Seat>();
	let startupTimer: NodeJS.Timeout | undefined;
	let removeListener = (): void => {};
	let finish: (error?: Error) => void = () => {};
	const finished = new Promise<void>((resolve, reject) => {
		finish = (error) => {
			if (error) reject(error);
			else resolve();
		};
	});
	const stop = async (error?: Error): Promise<void> => {
		if (stopped) return;
		stopped = true;
		runner.stop();
		if (startupTimer) clearTimeout(startupTimer);
		removeListener();
		controller.stop();
		await mesh?.leave();
		finish(error);
	};
	const onSignal = (): void => {
		process.exitCode = 130;
		void stop();
	};
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);

	const chooseSeat = async (view = controller.view()): Promise<void> => {
		if (choosing || requestedSeat !== undefined || view.seat !== null) return;
		const config = view.lobby?.config ?? view.table?.config ?? setup?.config;
		if (!config) return;
		const candidates = candidateSeats(config, options.username);
		if (candidates.length === 0) {
			await stop(
				new Error(
					options.username === undefined
						? "no seat named bot or robot was found"
						: `no seat named ${options.username} was found`,
				),
			);
			return;
		}
		if (!view.lobby) return;
		const available = candidates.find(
			(seat) =>
				!triedSeats.has(seat) &&
				view.lobby?.seats.some((row) => row.seat === seat && row.available),
		);
		if (available === undefined) {
			await stop(new Error("no matching bot seat is currently open"));
			return;
		}
		triedSeats.add(available);
		requestedSeat = available;
		choosing = true;
		try {
			const result = await controller.choose(available);
			if (!result.ok) {
				requestedSeat = undefined;
				if (result.reason === "refused" || result.reason === "held-elsewhere") {
					choosing = false;
					await chooseSeat(controller.view());
					return;
				}
				throw new Error(`could not take seat ${available} (${result.reason})`);
			}
			console.log(`Requested seat ${available}.`);
		} finally {
			choosing = false;
		}
	};

	const drive = async (): Promise<void> => {
		if (stopped) return;
		const view = controller.view();
		if (view.hosting) {
			await stop(
				new Error(
					"host eligibility invariant failed; bot stopped before hosting",
				),
			);
			return;
		}
		if (
			view.status === "expired" ||
			view.status === "incompatible" ||
			view.status === "full"
		) {
			await stop(new Error(`table stopped with status ${view.status}`));
			return;
		}
		if (view.seat === null) {
			await runner.advance(view);
			if (view.seatError !== null) {
				if (view.seatError === "taken" && !choosing) {
					requestedSeat = undefined;
					await chooseSeat(view);
				} else if (view.seatError !== "taken")
					await stop(new Error(`seat request failed (${view.seatError})`));
				return;
			}
			if (requestedSeat !== undefined) return;
			await chooseSeat(view);
			return;
		}
		requestedSeat = undefined;
		if (startupTimer) {
			clearTimeout(startupTimer);
			startupTimer = undefined;
		}
		await runner.advance(view);
	};

	removeListener = controller.onChange(() => {
		void drive().catch((error: unknown) => {
			void stop(new Error(describeFailure(error, [apiKey ?? "", route.key])));
		});
	});
	startupTimer = setTimeout(
		() => {
			void stop(
				new Error("timed out waiting for an active table and its seat list"),
			);
		},
		setup ? 60_000 : 45_000,
	);
	try {
		await controller.start();
		void drive().catch((error: unknown) => {
			void stop(new Error(describeFailure(error, [apiKey ?? "", route.key])));
		});
		await finished;
	} finally {
		process.removeListener("SIGINT", onSignal);
		process.removeListener("SIGTERM", onSignal);
		if (!stopped) await stop();
	}
}

try {
	const options = parseArgs(process.argv.slice(2));
	await run(options);
} catch (error) {
	console.error(
		`Bot stopped: ${describeFailure(error, [process.env.OPENROUTER_API_KEY ?? ""])}`,
	);
	process.exitCode = 1;
}
// Relay libraries can retain sockets after leaving the table. Flush diagnostics before ending the CLI process.
await Promise.all([
	new Promise<void>((resolve) => process.stdout.write("", () => resolve())),
	new Promise<void>((resolve) => process.stderr.write("", () => resolve())),
]);
process.exit();
