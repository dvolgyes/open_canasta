import { SELECTED_PLAYER_PARAM, type TableSetup } from "../bookmark";
import type { HostBotSettings } from "../bot/host-runner";
import { BUILD } from "../build";
import { canastaModule } from "../game/canasta";
import { newCommandId } from "../ids";
import { randomNonce } from "../p2p/checks";
import {
	TableController,
	type TableIdentity,
	type TableStatus,
	type TableView,
	tableIdentity,
} from "../p2p/table";
import { playerConfig, playerName, unnamedPlayer } from "../players";
import { SEAT_NAMES, type Seat } from "../protocol";
import { guardedStorage } from "../session";
import { buildNotice } from "./build-notice";
import type { AppDeps, Dispose, Navigation } from "./deps";
import { button, el } from "./dom";
import {
	chooseText,
	type LobbyScreen,
	lobbyScreen,
	networkLines,
	seatText,
	storageNotice,
	TEXT,
} from "./model";
import { networkPanel } from "./network";
import { pageTitle } from "./page-title";
import { readPersonalName, savePersonalName } from "./personal-name";
import { allowRemoteReload } from "./remote-reload";
import { seatGrid } from "./seat-grid";
import { showTableScreen } from "./table-screen";
import { turnSound } from "./turn-sound";

/** A table screen in one of these states stays, read-only, after its seat is gone. */
const KEEP_SCREEN: ReadonlySet<TableStatus> = new Set([
	"expired",
	"superseded",
	"incompatible",
]);

function message(...children: (Node | string)[]): HTMLElement {
	return el(
		"section",
		{ className: "message", attrs: { "data-testid": "message" } },
		...children,
	);
}

/**
 * A table link. Runs one table controller at a time: the lobby while this page holds no seat, and the table screen
 * screen while it holds one. `creator` is true only for the page load that has just created the table.
 */
export function showTable(
	root: HTMLElement,
	deps: AppDeps,
	key: string,
	creator: boolean,
	navigation: Navigation,
	seatHint?: Seat,
	bootstrap?: TableSetup,
	autoCopy?: Promise<string>,
	hostBots?: HostBotSettings,
): Dispose {
	let disposed = false;
	const turnAlert = turnSound();
	const unlockTurnAlert = (): void => turnAlert.unlock();
	root.addEventListener("pointerdown", unlockTurnAlert);
	root.addEventListener("keydown", unlockTurnAlert);
	let identity: TableIdentity | undefined;
	let controller: TableController | undefined;
	let unsubscribe: (() => void) | undefined;
	/** True while a controller starts; the screen shows "Connecting" until it is ready. */
	let opening = false;
	let tableScreen: Dispose | undefined;
	let screenSeat: Seat | undefined;
	/** Why the last seat request of this page failed. */
	let notice: string | undefined;
	/** The lobby as last built: an equal lobby only updates its status line and the network panel. */
	let shown: string | undefined;
	/** True once this page has taken the last free seat, so a refusal does not repeat the take. */
	let autoTook = false;
	let nameSeat:
		| {
				readonly seat: Seat;
				readonly gen?: number;
				readonly nameRevision?: number;
		  }
		| undefined;
	let pendingName: string | undefined;
	let requestedSeat: Seat | undefined = seatHint;

	const status = el("p", {
		attrs: { role: "status", "data-testid": "table-status" },
	});
	const network = networkPanel(deps.t);
	const updateNotice = buildNotice(deps.t, () => {
		if (controller)
			void controller.prepareReload().then(() => location.reload());
	});

	const leaveScreen = (): void => {
		tableScreen?.();
		tableScreen = undefined;
		screenSeat = undefined;
		delete root.dataset.screen;
		delete root.dataset.waiting;
	};

	const stopController = (): void => {
		unsubscribe?.();
		unsubscribe = undefined;
		controller?.stop();
		controller = undefined;
	};

	const showConnecting = (): void => {
		shown = undefined;
		document.title = "Open Canasta";
		root.replaceChildren(message(el("p", {}, deps.t(TEXT.connecting))));
	};

	/** Tries to claim this seat again, if no active tab holds it and the host allows it. */
	const retryScreenSeat = (): void => {
		const seat = screenSeat;
		if (seat === undefined) return;
		leaveScreen();
		stopController();
		showConnecting();
		void open(false, async (table) => {
			const view = table.view();
			if (view.seat !== null) return;
			requestedSeat = seat;
			const result = await table.choose(seat);
			if (!result.ok) notice = chooseText(result.reason, deps.t);
		});
	};

	async function open(
		asCreator: boolean,
		then?: (table: TableController) => Promise<void>,
	): Promise<void> {
		opening = true;
		identity ??= await tableIdentity(key, deps.browser);
		if (disposed) return;
		const remembered = new URL(deps.pageUrl()).searchParams.has(
			SELECTED_PLAYER_PARAM,
		)
			? undefined
			: deps.memory.browserSeat(identity.tableId);
		requestedSeat ??= remembered;
		const table = new TableController({
			identity,
			storage: deps.storage,
			locks: deps.locks,
			memory: deps.memory,
			module: canastaModule,
			clock: deps.clock,
			every: (ms, run) => {
				const timer = setInterval(run, ms);
				return () => clearInterval(timer);
			},
			openMesh: deps.openMesh(identity.tableId, key),
			newId: newCommandId,
			nonce: randomNonce,
			creator: asCreator,
			preferredSeat: seatHint,
			rememberedSeat: remembered,
			bootstrap,
			buildDate: BUILD.date,
			buildCommit: BUILD.commit,
		});
		controller = table;
		table.setReloadHandler(() => {
			if (
				disposed ||
				controller !== table ||
				!allowRemoteReload(
					guardedStorage(() => window.sessionStorage),
					table.tableId,
					Date.now(),
				)
			)
				return;
			void table.prepareReload().then(() => location.reload());
		});
		unsubscribe = table.onChange(render);
		await table.start();
		if (disposed || controller !== table) return;
		await then?.(table);
		if (disposed || controller !== table) return;
		opening = false;
		render();
	}

	async function take(
		seat: Seat,
		name?: string,
		expected?: { readonly gen?: number; readonly nameRevision?: number },
	): Promise<void> {
		const table = controller;
		if (!table) return;
		const row = table.view().lobby?.seats.find((item) => item.seat === seat);
		const needsName =
			row?.needsName ??
			(bootstrap !== undefined && unnamedPlayer(bootstrap.config.names[seat]));
		if (needsName && name === undefined) {
			nameSeat = {
				seat,
				...(row?.gen === undefined ? {} : { gen: row.gen }),
				...(row?.nameRevision === undefined
					? {}
					: { nameRevision: row.nameRevision }),
			};
			shown = undefined;
			render();
			return;
		}
		notice = undefined;
		nameSeat = undefined;
		requestedSeat = seat;
		const result = await table.choose(seat, name, expected);
		if (disposed || table !== controller) return;
		if (!result.ok) notice = chooseText(result.reason, deps.t);
		else pendingName = name;
		render();
	}

	function render(): void {
		const table = controller;
		if (disposed || opening || !table) return;
		const view = table.view();
		updateNotice.update(view.newerBuild);
		if (
			view.seat === null &&
			view.seatError === "name_required" &&
			requestedSeat !== undefined
		) {
			nameSeat = { seat: requestedSeat };
			requestedSeat = undefined;
			shown = undefined;
		}
		if (pendingName && view.follower === "bound") {
			savePersonalName(deps.browser, pendingName);
			pendingName = undefined;
		} else if (view.seatError !== null) pendingName = undefined;
		if (view.follower === "bound") requestedSeat = undefined;
		if (tableScreen !== undefined) {
			// The table screen renders itself. It goes only when the host refused or dropped the seat.
			if (view.seat === screenSeat || KEEP_SCREEN.has(view.status)) return;
			leaveScreen();
		}
		if (view.seat !== null) {
			navigation.rememberSeat(view.seat);
			document.title = pageTitle(deps.t, {
				name:
					(view.table
						? playerConfig(view.table).names[view.seat]
						: undefined) ?? SEAT_NAMES[view.seat],
				seat: view.seat,
				turn: false,
				host: view.hosting,
				bot: view.roster?.bots.includes(view.seat) ?? false,
			});
			shown = undefined;
			notice = undefined;
			screenSeat = view.seat;
			tableScreen = showTableScreen(
				root,
				deps,
				table,
				key,
				view.seat,
				{
					...navigation,
					retrySeat: retryScreenSeat,
					turnSound: turnAlert,
				},
				bootstrap?.config,
				autoCopy,
				hostBots,
			);
			return;
		}
		document.title = "Open Canasta";
		const screen = lobbyScreen({
			status: view.status,
			supersededBy: view.supersededBy,
			election: view.election,
			lobby: view.lobby,
			heldElsewhere: view.heldElsewhere,
			setup: bootstrap,
			none:
				new URL(deps.pageUrl()).searchParams
					.getAll(SELECTED_PLAYER_PARAM)
					.join(",") === "none",
			t: deps.t,
		});
		// One claimable seat needs no choice, even when other same-browser tabs hold their own seats.
		if (
			seatHint === undefined &&
			!autoTook &&
			screen.kind === "lobby" &&
			screen.autoSeat !== undefined
		) {
			autoTook = true;
			void take(screen.autoSeat);
			return;
		}
		renderLobby(screen, view);
	}

	function renderLobby(screen: LobbyScreen, view: TableView): void {
		network.render(
			networkLines({
				network: view.network,
				peers: view.peers,
				publicAddress: view.publicAddress,
				persistent: view.persistent,
				persisted: undefined,
				t: deps.t,
			}),
		);
		if (screen.kind === "lobby") status.textContent = screen.status ?? "";
		const problem =
			notice ??
			(view.seatError === null ? undefined : seatText(view.seatError, deps.t));
		const signature = JSON.stringify([
			screen.kind === "lobby" ? { ...screen, status: undefined } : screen,
			problem,
			nameSeat,
		]);
		if (signature === shown) return;
		shown = signature;
		root.replaceChildren(lobbyElement(screen, problem));
	}

	function lobbyElement(
		screen: LobbyScreen,
		problem: string | undefined,
	): HTMLElement {
		switch (screen.kind) {
			case "expired":
				return message(
					el("h1", {}, deps.t(TEXT.expired)),
					button(deps.t("Create new game"), navigation.createNew),
				);
			case "problem":
				return message(
					el("p", {}, screen.text),
					button(deps.t("Reload"), () => location.reload()),
					network.element,
				);
			case "lobby": {
				const parts: (Node | string)[] = [];
				parts.push(updateNotice.element);
				if (nameSeat !== undefined) {
					const { seat, ...expected } = nameSeat;
					const name = el("input", {
						attrs: {
							type: "text",
							"data-testid": "join-player-name",
							"aria-label": deps.t("Your name"),
							maxlength: "80",
						},
					});
					name.value = readPersonalName(deps.browser);
					const error = el("p", { attrs: { role: "alert" } });
					const form = el(
						"form",
						{},
						el("h1", {}, deps.t("Your name")),
						name,
						error,
						el("button", { attrs: { type: "submit" } }, deps.t("Join game")),
						button(deps.t("Cancel"), () => {
							nameSeat = undefined;
							shown = undefined;
							render();
						}),
					);
					form.addEventListener("submit", (event) => {
						event.preventDefault();
						const normalized = playerName(name.value);
						if (!normalized || unnamedPlayer(normalized)) {
							error.textContent = deps.t(
								"Enter a valid name of at most 40 characters.",
							);
							return;
						}
						void take(seat, normalized, expected);
					});
					return message(updateNotice.element, form, network.element);
				}
				if (screen.choices !== undefined)
					parts.push(el("h1", {}, deps.t("Choose your seat")));
				parts.push(status);
				if (deps.storageProblem !== undefined)
					parts.push(
						el(
							"p",
							{ className: "notice" },
							storageNotice(deps.storageProblem, deps.t),
						),
					);
				if (problem !== undefined)
					parts.push(
						el("p", { className: "notice", attrs: { role: "alert" } }, problem),
					);
				if (screen.choices !== undefined) {
					parts.push(
						seatGrid(
							screen.choices.map((choice) => {
								const pick = button(
									choice.label,
									() => void take(choice.seat),
									{
										attrs: { "data-testid": `pick-${choice.seat}` },
									},
								);
								pick.disabled = !choice.free;
								return { seat: choice.seat, element: pick };
							}),
						),
					);
					if (!screen.choices.some((choice) => choice.free))
						parts.push(el("p", {}, deps.t("All seats are taken.")));
				}
				parts.push(network.element);
				return message(...parts);
			}
		}
	}

	// The election restarts its absence clock when the page comes back.
	const onVisible = (): void => {
		if (document.visibilityState === "visible") controller?.wake();
	};
	const onWake = (): void => controller?.wake();
	document.addEventListener("visibilitychange", onVisible);
	window.addEventListener("online", onWake);
	window.addEventListener("pageshow", onWake);

	/** A start link seats its host directly. A seat that another device holds leaves the lobby with a notice. */
	const claimHint = async (table: TableController): Promise<void> => {
		if (seatHint === undefined) return;
		const view = table.view();
		if (view.seat !== null) return;
		requestedSeat = seatHint;
		const result = await table.choose(seatHint);
		if (!result.ok) notice = chooseText(result.reason, deps.t);
	};

	showConnecting();
	void open(creator, claimHint);

	return () => {
		disposed = true;
		document.title = "Open Canasta";
		document.removeEventListener("visibilitychange", onVisible);
		window.removeEventListener("online", onWake);
		window.removeEventListener("pageshow", onWake);
		root.removeEventListener("pointerdown", unlockTurnAlert);
		root.removeEventListener("keydown", unlockTurnAlert);
		leaveScreen();
		stopController();
		turnAlert.dispose();
	};
}

/** A link that does not open a table: an old link, another version, or a damaged one. */
export function showLinkProblem(
	root: HTMLElement,
	navigation: Navigation,
	text: string,
	t: (message: string) => string = (message) => message,
): Dispose {
	root.replaceChildren(
		message(
			el("p", {}, text),
			button(t("Create new game"), navigation.createNew),
		),
	);
	return () => {};
}
