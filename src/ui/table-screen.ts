import {
	botSeatsQuery,
	parseAutoplaySeats,
	parseTableSetup,
	selectedPlayerQuery,
} from "../bookmark";
import {
	configuredBotSeats,
	HostBotRunner,
	type HostBotSettings,
} from "../bot/host-runner";
import {
	BOT_ACTION_DELAY_KEY,
	BOT_THINKING_TIME_KEY,
	readBotActionDelay,
	readThinkingTime,
} from "../bot/timing";
import { BUILD, formatBuildDate } from "../build";
import { CallController } from "../call/call";
import {
	formOf,
	isTouchDevice,
	layout,
	readSignals,
	watchDeviceLayout,
} from "../call/device-class";
import { createCallSignaling } from "../call/signaling";
import {
	actionPayload,
	type CanastaState,
	nextHandPayload,
	parseCanastaState,
	resetCancelPayload,
	resetRequestPayload,
	resetVotePayload,
	startPayload,
} from "../game/canasta";
import { chatPayload, checkMessageText } from "../game/chat";
import { type ModernState, parseModernState } from "../game/modern";
import { tableLink } from "../p2p/link";
import type { TableController, TableStatus } from "../p2p/table";
import { playerConfig } from "../players";
import {
	type JsonObject,
	SEAT_NAMES,
	SEATS,
	type Seat,
	type TableConfig,
} from "../protocol";
import { STORAGE_PREFIX } from "../storage-names";
import { appearanceSettings } from "./appearance-dialog";
import { orientationChoices } from "./board-settings";
import { buildNotice } from "./build-notice";
import { CallMemory } from "./call-memory";
import type { CallDisplay, RemoteCallPresence } from "./call-model";
import { CallPresenceTimeout } from "./call-presence";
import { cameraSetup } from "./camera-setup";
import { diagnosticExport } from "./debug-export";
import type { AppDeps, Dispose, Navigation } from "./deps";
import { button, el } from "./dom";
import { languageControl } from "./language-control";
import {
	type Banner,
	bannerFor,
	bannerText,
	chatRefusalText,
	connectionDetail,
	draftFor,
	heldSeats,
	hostBotPlays,
	networkLines,
	type PendingLine,
	presentSeats,
	type RosterRow,
	releaseText,
	storageNotice,
	submitText,
	TEXT,
	type TranscriptLine,
	tableScreenView,
} from "./model";
import {
	type ModernTableInput,
	modernSelectionOptions,
	modernTableView,
} from "./modern-table-model";
import { networkPanel } from "./network";
import { pageTitle } from "./page-title";
import { playerEditor } from "./player-editor";
import { qualityMatrix } from "./quality-matrix";
import { remoteAudio } from "./remote-audio";
import { tableSection } from "./table";
import {
	selectionOptions,
	type TableViewInput,
	tableView,
} from "./table-model";
import type { TurnSound } from "./turn-sound";

export interface TableScreenHandlers extends Navigation {
	/** Tries to claim this seat again after it becomes available. */
	retrySeat(): void;
	/** Shared by the lobby and the table screen so a seat-selection gesture unlocks turn alerts. */
	turnSound: TurnSound;
}

const STATE_TEXT: Readonly<Record<RosterRow["state"], string>> = {
	online: "Online",
	offline: "Offline",
	free: "Free",
};

function tableShareLink(pageUrl: string, key: string): string {
	const page = new URL(pageUrl);
	page.search = selectedPlayerQuery(page.search, "none");
	return tableLink(page.toString(), key);
}

/** Returns true when the link was copied rather than shared. */
async function shareOrCopy(
	link: string,
	nativeShare: boolean,
): Promise<boolean> {
	if (nativeShare && navigator.share !== undefined) {
		try {
			await navigator.share({ url: link });
			return false;
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError")
				throw error;
		}
	}
	await navigator.clipboard.writeText(link);
	return true;
}

/** After these, the table screen stays but can no longer act. */
const TERMINAL: ReadonlySet<TableStatus> = new Set([
	"expired",
	"superseded",
	"incompatible",
]);

/**
 * The table screen of the seat that this page holds. It renders the controller's view and sends through the
 * controller; the caller owns the controller and stops it.
 */
export function showTableScreen(
	root: HTMLElement,
	deps: AppDeps,
	controller: TableController,
	key: string,
	seat: Seat,
	handlers: TableScreenHandlers,
	fallbackConfig?: TableConfig,
	autoCopy?: Promise<string>,
	initialBotSettings?: HostBotSettings,
): Dispose {
	const tableId = controller.tableId;
	const updateNotice = buildNotice(deps.t, () => {
		void controller.prepareReload().then(() => location.reload());
	});
	let disposed = false;
	let hasOtherPeer = false;
	let callRosterKnown = false;

	// The call is optional and separate from the game: it reads the table, and its actions never send a command.
	const deviceLayout = layout(readSignals(window), orientationChoices());
	const deviceForm = formOf(deviceLayout);
	const support = deps.call;
	const camera = support.available
		? cameraSetup({
				devices: support.cameras,
				getUserMedia: support.getUserMedia,
				t: deps.t,
			})
		: undefined;
	const call = support.available
		? new CallController(
				{
					openSignaling: (inbox, callHandlers) =>
						createCallSignaling(controller.callTransport, inbox, callHandlers),
					getUserMedia: support.getUserMedia,
					createConnection: support.createConnection,
					newSession: support.newSession,
				},
				deviceForm,
			)
		: undefined;
	const memory =
		support.available && call !== undefined
			? new CallMemory({
					call,
					tableId,
					seat,
					holder: controller.holder,
					granted: support.granted,
					send: (payload) => controller.send(payload).then((sent) => sent.ok),
					changed: () => renderCall(),
				})
			: undefined;
	const callPresence = new CallPresenceTimeout(() => {
		if (disposed || hasOtherPeer) return;
		call?.leave();
		memory?.acted();
		renderCall();
	});
	const unsubscribeCamera = camera?.onChange(() => renderCall());
	const audio = remoteAudio();
	const { turnSound: turnAlert } = handlers;
	let yourTurn = false;
	let currentTurnKey: string | undefined;
	let alertedTurn: string | undefined;
	let observedTurn: string | undefined;
	let turnSequence = 0;
	let botRunner: HostBotRunner | undefined;
	const delegatedBotSeats = new Set<Seat>();
	let botHoldsSeat = false;
	let botStarting = false;
	let botAutoAttempted = false;
	let botRestoreStarted = false;
	let botRestorePending = false;
	// The host's browser remembers a pause for this table, including when an earlier link is opened.
	const botPauseKey = `${STORAGE_PREFIX}bots-paused.${tableId}`;
	let botsPaused = deps.browser?.getItem(botPauseKey) === "1";
	let remoteCallPresence: Partial<Record<Seat, RemoteCallPresence>> = {};
	let hostInCall = false;
	const botSeatOverrides = new Map<Seat, boolean>();
	let botSettings = initialBotSettings;
	let playerAutoplayPending = false;
	let playerAutoplayStatus = "";
	let playerAutoplayWasEnabled = false;
	let playerAutoplayConfirmedRoster = false;
	/** The roster seen when the host answered the latest autoplay request. */
	let playerAutoplayAnswerRoster: unknown;
	let playerAutoplayHost = "";

	controller.setAutoplayHandler(async (targetSeat, enabled) => {
		if (!controller.view().hosting) return "failed";
		if (!enabled) {
			if (!delegatedBotSeats.has(targetSeat)) return "disabled";
			const ok = await controller.setBotSeat(targetSeat, false);
			if (!ok) return "failed";
			delegatedBotSeats.delete(targetSeat);
			botSeatOverrides.delete(targetSeat);
			botRunner?.setSeatEnabled(targetSeat, false);
			return "disabled";
		}
		botSettings ??= { thinkingTimeMs: readThinkingTime(deps.browser) };
		const enabledSeat = await controller.setBotSeat(targetSeat, true);
		if (!enabledSeat) return "failed";
		delegatedBotSeats.add(targetSeat);
		botSeatOverrides.delete(targetSeat);
		if (botRunner) {
			botRunner.setSeatEnabled(targetSeat, true);
			setBotsPaused(false);
			botRunner.resume();
			botStatus.textContent = deps.t("Autoplay uses local MCTS.");
			return "enabled";
		}
		const started = await startHostBots(targetSeat);
		if (!started) {
			delegatedBotSeats.delete(targetSeat);
			await controller.setBotSeat(targetSeat, false);
			return "failed";
		}
		botStatus.textContent = deps.t("Autoplay uses local MCTS.");
		return "enabled";
	});

	const you = el("p", { className: "you", attrs: { "data-testid": "you" } });
	const bannerLine = el("span", {});
	const bannerDetail = el("span", {
		className: "connection-summary",
		attrs: { "data-testid": "banner-detail" },
	});
	const becomeHost = button(deps.t(TEXT.becomeHost), () => controller.click(), {
		attrs: { "data-testid": "become-host" },
	});
	const bannerHint = el("span", { className: "note" });
	const retrySeat = button(deps.t("Try seat again"), handlers.retrySeat, {
		attrs: { "data-testid": "retry-seat" },
	});
	const createNew = button(deps.t("Create new game"), handlers.createNew);
	const restart = button(deps.t("Restart this game"), () => {
		restart.disabled = true;
		void controller.prepareReload().then(() => location.reload());
	});
	const botStatus = el("p", { attrs: { role: "status" } });
	const botSettingsDialog = el("dialog", {
		attrs: {
			"aria-labelledby": "bot-settings-title",
			"data-testid": "bot-settings-dialog",
		},
	});
	const botDelay = el("input", {
		attrs: {
			type: "number",
			min: "1",
			max: "60",
			step: "1",
			"aria-label": deps.t("Minimum time per bot action (seconds)"),
		},
	});
	const thinking = el("input", {
		attrs: {
			type: "number",
			min: "0",
			max: "60",
			step: "0.05",
			"aria-label": deps.t("Thinking time (seconds)"),
		},
	});
	const botDelayError = el("p", { attrs: { role: "alert" } });
	botSettingsDialog.append(
		el("h2", { attrs: { id: "bot-settings-title" } }, deps.t("Bot settings")),
		el("label", {}, deps.t("Thinking time (seconds)"), thinking),
		el("label", {}, deps.t("Minimum time per bot action (seconds)"), botDelay),
		botDelayError,
		button(deps.t("Save"), () => {
			const seconds = botDelay.valueAsNumber;
			if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
				botDelayError.textContent = deps.t(
					"Enter a whole number between 1 and 60.",
				);
				return;
			}
			const thinkingTimeMs = thinking.valueAsNumber * 1000;
			if (
				!Number.isFinite(thinkingTimeMs) ||
				thinkingTimeMs < 0 ||
				thinkingTimeMs > 60000
			) {
				botDelayError.textContent = deps.t(
					"Thinking time must be from 0 to 60 seconds.",
				);
				return;
			}
			const current = botSettings ?? {};
			botSettings = {
				...current,
				actionDelayMs: seconds * 1_000,
				thinkingTimeMs,
			};
			deps.browser?.setItem(BOT_ACTION_DELAY_KEY, String(seconds * 1_000));
			deps.browser?.setItem(BOT_THINKING_TIME_KEY, String(thinkingTimeMs));
			botRunner?.updateSettings(botSettings);
			botStatus.textContent = runningBotStatus();
			botSettingsDialog.close();
			render();
		}),
		button(deps.t("Cancel"), () => botSettingsDialog.close()),
	);
	const banner = el(
		"div",
		{ className: "banner", attrs: { role: "status", "data-testid": "banner" } },
		bannerLine,
		bannerDetail,
		becomeHost,
		bannerHint,
		retrySeat,
		createNew,
		restart,
	);
	const actionNote = el("p", {
		className: "note",
		attrs: { role: "status", "data-testid": "action-note" },
	});
	const roster = el("ul", {
		className: "roster",
		attrs: { "data-testid": "roster" },
	});
	const rosterNote = el("p", { className: "note", attrs: { role: "status" } });
	const allConnected = el(
		"p",
		{ className: "note", attrs: { "data-testid": "all-connected" } },
		deps.t("All players connected"),
	);
	const transcript = el("ol", {
		className: "transcript",
		attrs: { "data-testid": "transcript" },
	});
	const pending = el("ul", {
		className: "pending",
		attrs: { "data-testid": "pending" },
	});
	const draft = el("textarea", {
		attrs: {
			rows: "2",
			"aria-label": deps.t("Message"),
			"data-testid": "draft",
		},
	});
	draft.value = draftFor(seat, deps.t);
	const send = el("button", {
		attrs: { type: "submit", "data-testid": "send" },
	});
	const sendNote = el("p", { className: "note", attrs: { role: "status" } });
	const form = el("form", { className: "send" }, draft, send, sendNote);
	const network = networkPanel(deps.t, false, deps.browser);
	const matrix = qualityMatrix(deps.t);
	const diagnosticStatus = el("p", {
		attrs: { role: "status", "data-testid": "diagnostic-status" },
	});
	const diagnostics = el(
		"div",
		{},
		button(deps.t("Copy network diagnostics"), async () => {
			const view = controller.view();
			if (!view.hosting) return;
			try {
				await navigator.clipboard.writeText(
					JSON.stringify(diagnosticExport(view, BUILD), null, 2),
				);
				diagnosticStatus.textContent = deps.t("Network diagnostics copied.");
			} catch {
				diagnosticStatus.textContent = deps.t(
					"Could not copy network diagnostics.",
				);
			}
		}),
		diagnosticStatus,
	);
	diagnostics.hidden = true;

	let sendError: string | undefined;
	let actionError: string | undefined;
	let releaseError: string | undefined;
	let confirming: Seat | undefined;
	/** The browser's answer to the persistence request. */
	let persisted: boolean | undefined;
	/** The table as last rendered: an action is sent for the position the player saw. */
	let shownState: CanastaState | ModernState | undefined;
	/** The input of the table view as last built: the selected cards find their actions in it. */
	let tableInput: TableViewInput | ModernTableInput | undefined;
	/** The view models as last rendered. The controller notifies every tick; equal models keep their nodes. */
	let shownScreen: string | undefined;
	let shownTable: string | undefined;
	let scoringHand: number | undefined;
	let scoringStartedAt: number | undefined;
	let scoringTimer: number | undefined;
	/** The host command last sent for the table: the start, or the next hand by its number. */
	let hostCommandSent: string | undefined;
	/** The reset request that the decision buttons answer. */
	let resetRequestId: string | undefined;

	/** Stores the command for sending; `onFail` gets the reason when this browser could not store it. */
	const submit = (
		payload: JsonObject,
		onFail: (reason: string) => void,
	): void => {
		void controller.send(payload).then((result) => {
			if (disposed) return;
			if (!result.ok) onFail(submitText(result, deps.t));
			render();
		});
	};

	function manageBotSeat(targetSeat: Seat, enabled: boolean): void {
		void controller.setBotSeat(targetSeat, enabled).then((ok) => {
			if (!ok) {
				botStatus.textContent = deps.t("The host could not change that seat.");
				return;
			}
			botSeatOverrides.set(targetSeat, enabled);
			const currentView = controller.view();
			const currentBots = new Set(currentView.roster?.bots ?? []);
			if (enabled) currentBots.add(targetSeat);
			else currentBots.delete(targetSeat);
			rememberBotSeats([...currentBots]);
			if (enabled) {
				botRunner?.setSeatEnabled(targetSeat, true);
				if (botRunner) {
					setBotsPaused(false);
					botRunner.resume();
				} else {
					void startHostBots(targetSeat);
				}
			} else {
				botRunner?.setSeatEnabled(targetSeat, false);
			}
			if (botRunner)
				botStatus.textContent = botsPaused
					? deps.t("Bots paused.")
					: runningBotStatus();
			render();
		});
	}

	function effectiveBotSeats(): Seat[] {
		const view = controller.view();
		const config = view.table?.config ?? fallbackConfig;
		const active = new Set(
			view.roster?.bots ?? (config ? configuredBotSeats(config) : []),
		);
		for (const [targetSeat, enabled] of botSeatOverrides) {
			if (enabled) active.add(targetSeat);
			else active.delete(targetSeat);
		}
		return SEATS.filter((targetSeat) => active.has(targetSeat));
	}

	function runningBotStatus(): string {
		const count = effectiveBotSeats().length;
		return count === 0
			? deps.t("No bot seats are active.")
			: deps.t("Running {count} bot seat(s) with {model}.", {
					count,
					model: "MCTS",
				});
	}

	function setBotsPaused(paused: boolean): void {
		botsPaused = paused;
		if (paused) deps.browser?.setItem(botPauseKey, "1");
		else deps.browser?.removeItem(botPauseKey);
	}

	function rememberBotSeats(bots: readonly Seat[]): void {
		const query = botSeatsQuery(
			location.search,
			bots,
			controller.view().roster?.autoplaySeats ?? [],
		);
		history.replaceState(
			null,
			"",
			`${location.pathname}?${query}${location.hash}`,
		);
	}

	async function restoreBotSeats(bots: readonly Seat[]): Promise<void> {
		const desired = new Set(bots);
		const autoplay = parseAutoplaySeats(location.search);
		for (const targetSeat of SEATS) {
			const current =
				controller.view().roster?.bots.includes(targetSeat) ?? false;
			if (current !== desired.has(targetSeat)) {
				const ok = await controller.setBotSeat(
					targetSeat,
					desired.has(targetSeat),
				);
				if (!ok) {
					botStatus.textContent = deps.t(
						"The host could not restore the saved bot seats.",
					);
					break;
				}
				botSeatOverrides.set(targetSeat, desired.has(targetSeat));
			}
			if (
				desired.has(targetSeat) &&
				autoplay.includes(targetSeat) &&
				controller.restoreAutoplay(targetSeat)
			)
				delegatedBotSeats.add(targetSeat);
		}
		botRestorePending = false;
		render();
	}

	let reloadStarted = false;
	function reloadTable(): void {
		if (reloadStarted) return;
		reloadStarted = true;
		void controller.prepareReload().then(() => location.reload());
	}

	const table = tableSection(
		{
			exit: handlers.createNew,
			reload: reloadTable,
			async shareUrl() {
				await shareOrCopy(tableShareLink(deps.pageUrl(), key), true);
			},
			act(action) {
				if (!shownState?.match) return;
				actionError = undefined;
				const { match, actions, matches } = shownState;
				submit(
					actionPayload(tableId, match, actions, action, matches),
					(reason) => {
						actionError = deps.t("Not sent: {reason}", { reason });
					},
				);
				render();
			},
			selectionOptions: (shown, selected) =>
				tableInput === undefined
					? []
					: tableInput.state?.game === "canasta-modern"
						? modernSelectionOptions(
								tableInput as ModernTableInput,
								shown,
								selected,
							)
						: selectionOptions(tableInput as TableViewInput, shown, selected),
			setBotSeat(targetSeat, enabled) {
				manageBotSeat(targetSeat, enabled);
			},
			editPlayerNames() {
				players.open();
			},
			newGame() {
				requestReset();
			},
			requestAutoplay(enabled) {
				playerAutoplayPending = true;
				playerAutoplayStatus = deps.t("Sending autoplay request…");
				render();
				void controller.requestAutoplay(enabled).then((status) => {
					playerAutoplayPending = false;
					if (status === "enabled") {
						playerAutoplayWasEnabled = true;
						playerAutoplayAnswerRoster = controller.view().roster;
						playerAutoplayStatus = deps.t("The host is playing your seat.");
					} else if (status === "disabled") {
						playerAutoplayWasEnabled = false;
						playerAutoplayConfirmedRoster = false;
						playerAutoplayAnswerRoster = controller.view().roster;
						playerAutoplayStatus = deps.t("Autoplay stopped.");
					} else if (status === "unavailable") {
						playerAutoplayWasEnabled = false;
						playerAutoplayStatus = deps.t(
							"Autoplay is unavailable on this host.",
						);
					} else {
						playerAutoplayStatus = deps.t("Autoplay request failed.");
					}
					render();
				});
			},
			// Only these explicit actions change the stored call status.
			call: {
				join: (selection) => {
					if (!hasOtherPeer) return;
					if (selection.send.video && camera?.available !== false) {
						void camera?.open().then((chosen) => {
							if (chosen === undefined || call === undefined) return;
							if (disposed || !hasOtherPeer) {
								if (chosen !== "cancelled") chosen.track.stop();
								return;
							}
							if (chosen !== "cancelled") {
								call.setVideoDevice(chosen.deviceId);
								if (!call.prepareVideo(chosen.track)) {
									chosen.track.stop();
									return;
								}
							}
							call.join(selection);
							memory?.acted();
						});
						return;
					}
					const effective =
						selection.send.video && camera?.available === false
							? { ...selection, send: { ...selection.send, video: false } }
							: selection;
					call?.join(effective);
					memory?.acted();
				},
				leave: () => {
					call?.leave();
					memory?.acted();
				},
				setSwitch: (way, medium, on) => {
					if (
						way === "send" &&
						medium === "video" &&
						on &&
						call?.view.requested.inCall
					) {
						if (camera?.available === false) return;
						void camera?.open().then((chosen) => {
							if (
								chosen === undefined ||
								chosen === "cancelled" ||
								call === undefined
							)
								return;
							if (disposed || !hasOtherPeer || !call.view.requested.inCall) {
								chosen.track.stop();
								return;
							}
							call.setVideoDevice(chosen.deviceId);
							if (!call.prepareVideo(chosen.track)) {
								chosen.track.stop();
								return;
							}
							call.setSwitch(way, medium, true);
							memory?.acted();
						});
						return;
					}
					call?.setSwitch(way, medium, on);
					memory?.acted();
				},
				retry: (target) => call?.retry(target),
			},
		},
		deps.t,
	);

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const check = checkMessageText(draft.value);
		if (!check.ok) {
			sendError = deps.t("Not sent: {reason}.", {
				reason: chatRefusalText(check.reason, deps.t),
			});
			render();
			return;
		}
		const text = draft.value;
		draft.value = "";
		sendError = undefined;
		submit(chatPayload(tableId, check.text), (reason) => {
			sendError = deps.t("Not sent: {reason}", { reason });
			if (draft.value === "") draft.value = text;
		});
		render();
	});

	const release = (target: Seat): void => {
		confirming = undefined;
		releaseError = controller.release(target)
			? undefined
			: deps.t("Release failed: no host is connected. Try again later.");
		render();
	};

	const links = el(
		"section",
		{ className: "links" },
		el(
			"p",
			{},
			deps.t(
				"Send this link to the three other players. Each one opens it and takes a seat.",
			),
		),
		button(deps.t("Copy table link"), async () => {
			try {
				await navigator.clipboard.writeText(
					tableShareLink(deps.pageUrl(), key),
				);
			} catch {
				// This secondary link control has no status text.
			}
		}),
	);
	const nativeShare =
		navigator.share !== undefined && isTouchDevice(readSignals(window));
	const copyTableLink = button(
		deps.t(nativeShare ? "Share URL" : "Copy link"),
		async () => {
			try {
				const copied = await shareOrCopy(
					tableShareLink(deps.pageUrl(), key),
					nativeShare,
				);
				if (copied) turnAlert.beep();
			} catch {
				// Clipboard failure stays silent, and does not signal success.
			}
		},
		{ className: "screen-share", attrs: { "data-testid": "copy-table-url" } },
	);
	if (autoCopy)
		void autoCopy.then(
			(message) => {
				if (message === "Copied.") turnAlert.beep();
			},
			() => undefined,
		);
	const players = playerEditor(deps, controller, (target) =>
		manageBotSeat(target, false),
	);
	const editPlayers = button(deps.t("Player names"), () => {
		if (hostControls.open) hostControls.close();
		players.open();
	});
	const reloadStatus = el("p", { attrs: { role: "status" } });
	const reloadPlayers = button(
		deps.t("Reload players"),
		() => {
			reloadStatus.textContent = deps.t("Asked {count} pages to reload.", {
				count: controller.reloadPlayers(),
			});
		},
		{ attrs: { "data-testid": "reload-players" } },
	);
	const editBotSettings = button(deps.t("Bot settings"), () => {
		botSettings ??= { thinkingTimeMs: readThinkingTime(deps.browser) };
		thinking.value = String(
			(botSettings.thinkingTimeMs ?? readThinkingTime(deps.browser)) / 1000,
		);
		botDelay.value = String(readBotActionDelay(deps.browser) / 1_000);
		botDelayError.textContent = "";
		if (!botSettingsDialog.open) botSettingsDialog.showModal();
	});
	// A reset clears the scores and starts a new match once every other present player approves it. The new game
	// button after a finished match sends the same request.
	function requestReset(): void {
		actionError = undefined;
		submit(resetRequestPayload(tableId), (reason) => {
			actionError = deps.t("Reset not sent: {reason}", { reason });
		});
	}
	const reset = button(
		deps.t("Reset"),
		() => {
			if (hostControls.open) hostControls.close();
			requestReset();
		},
		{ className: "reset-button", attrs: { "data-testid": "reset" } },
	);
	const resetStatus = el("p", { className: "note", attrs: { role: "status" } });
	const resetApprove = button(deps.t("Approve reset"), () => {
		if (resetRequestId !== undefined)
			submit(resetVotePayload(tableId, resetRequestId, true), (reason) => {
				actionError = deps.t("Reset approval not sent: {reason}", { reason });
			});
	});
	const resetReject = button(deps.t("Reject reset"), () => {
		if (resetRequestId !== undefined)
			submit(resetVotePayload(tableId, resetRequestId, false), (reason) => {
				actionError = deps.t("Reset decision not sent: {reason}", { reason });
			});
	});
	const resetCancel = button(deps.t("Cancel reset"), () => {
		if (resetRequestId !== undefined)
			submit(resetCancelPayload(tableId, resetRequestId), (reason) => {
				actionError = deps.t("Reset cancellation not sent: {reason}", {
					reason,
				});
			});
	});
	const resetDecision = el(
		"div",
		{ className: "reset-decision", attrs: { "data-testid": "reset-decision" } },
		resetStatus,
		resetApprove,
		resetReject,
		resetCancel,
	);
	resetDecision.hidden = true;
	const exit = button(deps.t("New table"), handlers.createNew, {
		className: "screen-exit",
	});
	const reload = button(
		deps.t("Reload"),
		() => {
			reload.disabled = true;
			reloadTable();
		},
		{ className: "screen-reload" },
	);
	const pauseBots = button(deps.t("Pause bots"), () => {
		if (!botRunner) return;
		botRunner.pause();
		setBotsPaused(true);
		botStatus.textContent = deps.t("Bots paused.");
		render();
	});
	const resumeBots = button(deps.t("Resume bots"), () => {
		if (!botRunner) {
			void startHostBots();
			return;
		}
		botRunner.resume();
		setBotsPaused(false);
		botStatus.textContent = runningBotStatus();
		render();
	});
	const hostActions = el(
		"div",
		{ className: "host-controls-actions" },
		editPlayers,
		reloadPlayers,
	);
	const hostPlayers = el("section", {
		className: "host-players",
		attrs: { "data-testid": "host-players" },
	});
	let shownHostPlayers = "";
	const hostControls = el(
		"dialog",
		{
			className: "host-controls-dialog",
			attrs: {
				"aria-labelledby": "host-controls-title",
				"data-testid": "host-controls-dialog",
			},
		},
		el("h2", { attrs: { id: "host-controls-title" } }, deps.t("Host controls")),
		hostActions,
		reloadStatus,
		hostPlayers,
		matrix.element,
		diagnostics,
		button(deps.t("Close"), () => hostControls.close()),
	);
	const openHostControls = button(
		deps.t("Host controls"),
		() => hostControls.showModal(),
		{
			attrs: { "data-testid": "host-controls" },
		},
	);
	openHostControls.hidden = true;
	const primaryControls = el(
		"div",
		{ className: "screen-control-row screen-primary-controls" },
		copyTableLink,
		openHostControls,
		reset,
		reload,
		exit,
	);
	const screenControls = el(
		"section",
		{
			className: "screen-controls",
			attrs: { "data-testid": "screen-controls" },
		},
		primaryControls,
		el(
			"div",
			{ className: "screen-control-row screen-bot-controls" },
			editBotSettings,
			pauseBots,
			resumeBots,
		),
		// The table screen has its own language picker here; the page-wide one is hidden while a table shows.
		languageControl(deps, () => controller.prepareReload()),
		appearanceSettings(deps.browser, deps.t),
		botStatus,
		updateNotice.element,
		botSettingsDialog,
		players.element,
		hostControls,
	);

	// A storage warning stays visible on every screen, so it sits in the stage, not in the drawer.
	const storageNotices =
		deps.storageProblem === undefined
			? []
			: [
					el(
						"p",
						{ className: "notice" },
						storageNotice(deps.storageProblem, deps.t),
					),
				];

	// The stage holds what a player needs during play; on a compact device it fills the screen.
	// The players, invite link, network panel and messages sit in a drawer under the table, closed by default.
	const drawer = el(
		"details",
		{ className: "screen-drawer", attrs: { "data-testid": "screen-drawer" } },
		el("summary", {}, deps.t("Players and messages")),
		el("h2", {}, deps.t("Players")),
		roster,
		rosterNote,
		allConnected,
		links,
		network.element,
		el("h2", {}, deps.t("Messages")),
		transcript,
		pending,
		form,
	);
	const callSidebar = el("div", { className: "sideways-call" });
	const tableScreen = el(
		"section",
		{ className: "table-screen" },
		el(
			"div",
			{ className: "stage" },
			you,
			banner,
			resetDecision,
			actionNote,
			...storageNotices,
			table.element,
		),
		audio.element,
		el(
			"footer",
			{ className: "screen-footer" },
			callSidebar,
			screenControls,
			drawer,
		),
	);
	// The table screen has one responsive layout; deviceForm remains the call policy for camera support, and the
	// table shows no video tiles on a compact device.
	tableScreen.dataset.form = "desktop";
	table.setForm(deviceForm);
	function reportPageLayout(
		value = layout(readSignals(window), orientationChoices()),
	): void {
		const coarse = (size: number): number =>
			Math.min(10_000, Math.max(0, Math.round(size / 100) * 100));
		controller.setPageReport({
			form: formOf(value),
			layout: value,
			width: coarse(window.innerWidth),
			height: coarse(window.innerHeight),
		});
	}
	const onReportResize = (): void => reportPageLayout();
	function setScreenLayout(value: ReturnType<typeof layout>): void {
		tableScreen.dataset.layout = value;
		root.dataset.layout = value;
		table.setLayout(value);
		callSidebar.hidden = value !== "sideways";
		if (value === "sideways") callSidebar.append(table.callDock);
		else table.element.append(table.callDock);
		reportPageLayout(value);
	}
	setScreenLayout(deviceLayout);
	// A wide landscape window shows the table screen as one 1920×1080 canvas (see style.css); this is its scale to fit.
	const updateScreenCanvasScale = (): void => {
		const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
		root.style.setProperty("--screen-canvas-scale", String(scale));
	};
	updateScreenCanvasScale();
	window.addEventListener("resize", updateScreenCanvasScale);
	window.addEventListener("resize", table.fitRows);
	window.addEventListener("resize", onReportResize);
	const pageIsVisible = (): boolean => document.visibilityState === "visible";
	const checkTurnAlert = (): void => {
		if (
			yourTurn &&
			currentTurnKey !== undefined &&
			!pageIsVisible() &&
			alertedTurn !== currentTurnKey
		) {
			alertedTurn = currentTurnKey;
			turnAlert.beep();
		}
	};
	const onPageStateChange = (): void => {
		checkTurnAlert();
		render();
	};
	const stopWatching = watchDeviceLayout(
		window,
		(value) => {
			call?.setForm(formOf(value));
			table.setForm(formOf(value));
			setScreenLayout(value);
		},
		orientationChoices,
	);
	root.replaceChildren(tableScreen);
	if (camera) root.append(camera.element);
	if (initialBotSettings) void startHostBots();

	async function startHostBots(requiredSeat?: Seat): Promise<boolean> {
		if (botRunner) return true;
		if (botStarting) return false;
		const view = controller.view();
		const config = view.table?.config;
		if (!config) return false;
		const configured = view.roster?.bots ?? configuredBotSeats(config);
		if (configured.length === 0 && requiredSeat === undefined) return false;
		if (!view.hosting) {
			botStatus.textContent = deps.t(
				"Only the current host can run bots in this browser.",
			);
			return false;
		}
		botSettings ??= { thinkingTimeMs: readThinkingTime(deps.browser) };
		botStarting = true;
		botAutoAttempted = true;
		const runner = new HostBotRunner(
			controller,
			{
				...botSettings,
				actionDelayMs: readBotActionDelay(deps.browser),
				thinkingTimeMs:
					botSettings.thinkingTimeMs ?? readThinkingTime(deps.browser),
			},
			(_kind, detail) => {
				for (const delegatedSeat of delegatedBotSeats) {
					delegatedBotSeats.delete(delegatedSeat);
					botRunner?.setSeatEnabled(delegatedSeat, false);
					void controller.setBotSeat(delegatedSeat, false);
				}
				botRunner = undefined;
				setBotsPaused(false);
				botStatus.textContent = detail ?? deps.t("Local search failed.");
				render();
			},
			(message) => {
				botStatus.textContent = deps.t(message);
			},
			deps.t,
		);
		if (
			!(await runner.start(requiredSeat === undefined ? [] : [requiredSeat]))
		) {
			runner.stop();
			botStarting = false;
			botStatus.textContent = deps.t(
				"Bots could not start. Check that this page is the ready host.",
			);
			return false;
		}
		botStarting = false;
		botRunner = runner;
		setBotsPaused(false);
		botStatus.textContent = runningBotStatus();
		return true;
	}

	function renderCall(): void {
		const inCall = call?.view.requested.inCall === true;
		callPresence.update(hasOtherPeer, inCall);
		const display: CallDisplay =
			!hasOtherPeer && !inCall && call !== undefined
				? {
						available: false,
						reason: "No other players are connected.",
						botsOnly: callRosterKnown,
					}
				: call === undefined
					? {
							available: false,
							reason: support.available ? "" : support.reason,
						}
					: {
							available: true,
							view: call.view,
							rejoin: memory?.rejoin,
							cameraAvailable: camera?.available,
						};
		table.renderCall(display, remoteCallPresence, hostInCall);
		audio.render(display.available ? display.view.remotes : []);
	}

	function renderBanner(
		shown: Banner | undefined,
		detail: string | undefined,
	): void {
		banner.hidden = shown === undefined;
		bannerDetail.hidden = detail === undefined;
		bannerDetail.textContent = detail ?? "";
		banner.dataset.kind = shown?.kind ?? "";
		bannerLine.textContent =
			shown === undefined ? "" : bannerText(shown, deps.t);
		const host = shown?.kind === "waiting-for-host" ? shown.button : undefined;
		becomeHost.hidden = host === undefined;
		becomeHost.disabled = host?.enabled !== true;
		bannerHint.hidden = host?.hint === undefined;
		bannerHint.textContent = host?.hint === undefined ? "" : deps.t(host.hint);
		retrySeat.hidden = shown?.kind !== "superseded";
		createNew.hidden = shown?.kind !== "expired";
		restart.hidden =
			shown?.kind !== "expired" ||
			parseTableSetup(new URL(deps.pageUrl()).search) === undefined;
	}

	function rosterItem(row: RosterRow): HTMLElement {
		const item = el(
			"li",
			{ attrs: { "data-seat": row.seat, "data-state": row.state } },
			el("span", { className: "dot", attrs: { "aria-hidden": "true" } }),
			el("span", { className: "label" }, row.label),
		);
		if (row.host) item.append(el("span", { className: "tag" }, deps.t("Host")));
		if (row.you) item.append(el("span", { className: "tag" }, deps.t("You")));
		item.append(
			el("span", { className: "state" }, deps.t(STATE_TEXT[row.state])),
		);
		if (!row.releasable) return item;
		if (confirming === row.seat) {
			item.append(
				button(deps.t("Confirm release"), () => release(row.seat), {
					attrs: { "data-testid": `confirm-release-${row.seat}` },
				}),
				button(deps.t("Cancel"), () => {
					confirming = undefined;
					render();
				}),
			);
		} else {
			item.append(
				button(
					deps.t("Release"),
					() => {
						confirming = row.seat;
						render();
					},
					{ attrs: { "data-testid": `release-${row.seat}` } },
				),
			);
		}
		return item;
	}

	function transcriptItem(line: TranscriptLine): HTMLElement {
		return el(
			"li",
			{ attrs: { "data-seq": String(line.seq) } },
			el("span", { className: "from" }, line.from),
			el("span", { className: "text" }, line.text),
			el(
				"span",
				{ className: "receipt" },
				deps.t("Received by {receivedBy} of {of}", {
					receivedBy: line.receivedBy,
					of: line.of,
				}),
			),
		);
	}

	function pendingItem(line: PendingLine): HTMLElement {
		const status =
			line.state === "sending"
				? deps.t("Sending")
				: line.state === "pending"
					? (line.reason ?? deps.t("Pending — waiting for the host"))
					: line.state === "undone"
						? deps.t(TEXT.undone)
						: deps.t("Not sent: {reason}", {
								reason: line.reason ?? deps.t("failed"),
							});
		return el(
			"li",
			{ attrs: { "data-state": line.state } },
			el("span", { className: "text" }, line.text),
			el("span", { className: "status" }, status),
		);
	}

	function render(): void {
		if (disposed) return;
		const view = controller.view();
		updateNotice.update(view.newerBuild);
		const botConfig = view.table?.config ?? fallbackConfig;
		if (!view.hosting) {
			botSeatOverrides.clear();
			botRestoreStarted = false;
			botRestorePending = false;
		} else if (!botRestoreStarted && fallbackConfig?.botSetup !== undefined) {
			botRestoreStarted = true;
			botRestorePending = true;
			void restoreBotSeats(fallbackConfig.botSetup.seats);
		}
		const activeBotSet = new Set(
			view.roster?.bots ?? (botConfig ? configuredBotSeats(botConfig) : []),
		);
		for (const [targetSeat, enabled] of botSeatOverrides) {
			if (enabled) activeBotSet.add(targetSeat);
			else activeBotSet.delete(targetSeat);
		}
		const activeBots = [...activeBotSet];
		if (view.hosting) {
			reloadPlayers.title = SEATS.map((target) => {
				const build = view.peers.find((peer) => peer.seat === target)?.build;
				const text =
					target === seat
						? `${formatBuildDate(BUILD.date)} (${BUILD.commit})`
						: build?.commit
							? `${formatBuildDate(build.date)} (${build.commit})`
							: activeBotSet.has(target)
								? deps.t("Bot")
								: deps.t("no report");
				return `${deps.t(SEAT_NAMES[target])}: ${text}`;
			}).join("\n");
			reloadPlayers.dataset.outdated = String(
				BUILD.commit !== "unknown" &&
					view.peers.some(
						(peer) =>
							peer.seat !== null &&
							peer.build?.commit !== undefined &&
							peer.build.commit !== BUILD.commit,
					),
			);
		}
		if (
			view.roster !== null &&
			!botRestorePending &&
			(view.hosting || (view.hostSeat !== null && view.hostSeat !== seat)) &&
			botSeatsQuery(location.search, activeBots, view.roster.autoplaySeats) !==
				new URLSearchParams(location.search).toString()
		)
			rememberBotSeats(activeBots);
		openHostControls.hidden = !view.hosting;
		if (!view.hosting && hostControls.open) hostControls.close();
		const resetHome = view.hosting ? hostActions : primaryControls;
		if (reset.parentElement !== resetHome) resetHome.append(reset);
		editPlayers.hidden = !view.hosting;
		reloadPlayers.hidden = !view.hosting;
		reloadStatus.hidden = !view.hosting;
		editBotSettings.hidden = !view.hosting;
		pauseBots.hidden =
			!view.hosting || activeBots.length === 0 || botsPaused || !botRunner;
		resumeBots.hidden =
			!view.hosting ||
			activeBots.length === 0 ||
			(!botsPaused && botRunner !== undefined);
		if (botRunner && !view.hosting) {
			botRunner.stop();
			botRunner = undefined;
			setBotsPaused(false);
			botStatus.textContent = deps.t("Host changed. Bots stopped.");
		}
		if (
			!botAutoAttempted &&
			!botsPaused &&
			!botRestorePending &&
			activeBots.length > 0 &&
			view.hosting
		)
			void startHostBots();
		const terminal = view.seat !== seat || TERMINAL.has(view.status);
		const callSnapshot = controller.callSnapshot();
		const botAlone =
			view.roster === null ? botHoldsSeat : hostBotPlays(view.roster, seat);
		const callOnline = new Set(
			[...callSnapshot.online].filter(
				(other) =>
					!hostBotPlays(view.roster, other) &&
					!view.roster?.peers.some(
						(binding) => binding.seat === other && binding.automated,
					),
			),
		);
		hasOtherPeer = [...callOnline].some((other) => other !== seat);
		callRosterKnown = view.roster !== null;
		const inCall = call?.view.requested.inCall === true;
		callPresence.update(hasOtherPeer, inCall);
		call?.update({
			...callSnapshot,
			online: callOnline,
			self: botAlone || (!hasOtherPeer && !inCall) ? null : callSnapshot.self,
		});
		if (botAlone !== botHoldsSeat) {
			botHoldsSeat = botAlone;
			if (!botAlone) memory?.seatReturned();
		}
		const shownBanner = bannerFor(view);
		renderBanner(
			shownBanner,
			connectionDetail(shownBanner, {
				network: view.network,
				peers: view.peers,
				publicAddress: view.publicAddress,
				t: deps.t,
			}),
		);
		actionNote.textContent = actionError ?? "";
		actionNote.hidden = actionError === undefined;
		allConnected.hidden = !view.allConnected;
		rosterNote.textContent =
			releaseError ??
			(view.release?.ok === false
				? deps.t("Release failed: {reason}", {
						reason: releaseText(view.release.code, deps.t),
					})
				: "");
		network.render(
			networkLines({
				network: view.network,
				peers: view.peers,
				publicAddress: view.publicAddress,
				persistent: view.persistent,
				persisted,
				t: deps.t,
			}),
		);
		matrix.element.hidden = !view.hosting;
		diagnostics.hidden = !view.hosting;
		if (view.hosting) matrix.update(view.qualityMatrix, activeBotSet);
		send.disabled = terminal;
		draft.disabled = terminal;
		// A new visitor learns the config from the host's lobby, or from the first copy of the table.
		const config =
			(view.table ? playerConfig(view.table) : undefined) ??
			view.lobby?.config ??
			fallbackConfig;
		if (config === undefined) {
			root.dataset.screen = "table";
			root.dataset.waiting = "true";
			you.hidden = false;
			you.textContent = deps.t(TEXT.connecting);
			send.textContent = deps.t(TEXT.send);
			sendNote.textContent = sendError ?? "";
			return;
		}
		const present = presentSeats(view.hostSeat, view.roster);
		copyTableLink.hidden = false;
		const model = tableScreenView({
			config,
			seat,
			t: deps.t,
			terminal,
			ready: view.ready,
			held: heldSeats(view.table?.seats ?? view.roster?.seats ?? []),
			online: present,
			hostSeat: view.hostSeat,
			acked: Object.fromEntries(
				(view.roster?.seats ?? []).map((row) => [row.seat, row.acked]),
			),
			entries: controller.entries(),
			outbox: view.outbox,
			failures: view.failures,
			undone: view.undone,
		});
		// The table shows the viewer's seat in the layout, so no "You are …" line is needed here.
		you.hidden = true;
		const screenKey = JSON.stringify([model, confirming]);
		if (screenKey !== shownScreen) {
			shownScreen = screenKey;
			roster.replaceChildren(...model.roster.map(rosterItem));
			transcript.replaceChildren(...model.transcript.map(transcriptItem));
			pending.replaceChildren(...model.pending.map(pendingItem));
		}
		const state =
			view.table === null
				? undefined
				: (parseCanastaState(view.table.state, tableId) ??
					parseModernState(view.table.state, tableId) ??
					null);
		remoteCallPresence = {};
		for (const targetSeat of SEATS) {
			const record = state?.media[targetSeat];
			const currentHolder = view.roster?.seats.find(
				(row) => row.seat === targetSeat,
			);
			if (
				record === undefined ||
				!record.prefs.inCall ||
				record.holder !== currentHolder?.holder ||
				hostBotPlays(view.roster, targetSeat) ||
				!present.has(targetSeat)
			) {
				continue;
			}
			remoteCallPresence[targetSeat] = {
				sendsAudio: record.prefs.send.audio,
				sendsVideo: record.prefs.send.video,
			};
		}
		hostInCall =
			!view.hosting &&
			view.hostSeat !== null &&
			view.hostSeat !== seat &&
			remoteCallPresence[view.hostSeat] !== undefined;
		renderCall();
		shownState = state ?? undefined;
		const pendingReset = state?.reset ?? null;
		resetRequestId = pendingReset?.id;
		reset.disabled =
			terminal || pendingReset !== null || (state?.match ?? null) === null;
		resetDecision.hidden = pendingReset === null;
		resetApprove.hidden =
			pendingReset === null ||
			!pendingReset.required.includes(seat) ||
			pendingReset.approved.includes(seat);
		resetReject.hidden = resetApprove.hidden;
		resetCancel.hidden = pendingReset?.requester !== seat;
		if (pendingReset) {
			const requester = `${config.names[pendingReset.requester]} (${deps.t(pendingReset.requester)})`;
			const waitingFor = pendingReset.required
				.filter((player) => !pendingReset.approved.includes(player))
				.map((player) => `${config.names[player]} (${deps.t(player)})`);
			resetStatus.textContent =
				pendingReset.requester === seat
					? deps.t("Waiting for {players} to approve the reset.", {
							players: waitingFor.join(", "),
						})
					: deps.t("{requester} asks to reset the game.", { requester });
		}
		// A settled hand with no winner waits for its countdown, then the host deals the next hand.
		const settledHand =
			state?.match?.settled && state.match.winner === null
				? state.match.handNo
				: undefined;
		if (settledHand !== scoringHand) {
			if (scoringTimer !== undefined) window.clearInterval(scoringTimer);
			scoringHand = settledHand;
			scoringStartedAt =
				settledHand === undefined
					? undefined
					: (view.table?.lastActivityAt ?? Date.now());
			scoringTimer =
				settledHand === undefined
					? undefined
					: window.setInterval(render, 1000);
		}
		const scoringCountdown =
			scoringStartedAt === undefined
				? 10
				: Math.max(
						0,
						Math.ceil((scoringStartedAt + 10_000 - Date.now()) / 1000),
					);
		memory?.update({
			records: state?.media,
			outbox: view.outbox.map((item) => item.payload),
		});
		const commonTableInput = {
			config,
			seat,
			terminal,
			present,
			roster: model.roster,
			bots: new Set(activeBots),
			hostSeat: view.hostSeat,
			scoringCountdown,
			outbox: view.outbox,
			failures: view.failures,
			undone: view.undone,
			t: deps.t,
		};
		tableInput =
			state?.game === "canasta-modern"
				? { ...commonTableInput, state }
				: { ...commonTableInput, state };
		const tableModel =
			state?.game === "canasta-modern"
				? modernTableView(tableInput as ModernTableInput)
				: tableView(tableInput as TableViewInput);
		const otherPlayers = tableModel.seats.filter(
			(player) => player.seat !== seat,
		);
		const hostPlayersKey = JSON.stringify([
			view.hosting,
			botRestorePending,
			otherPlayers.map((player) => [
				player.seat,
				player.label,
				player.name,
				player.presence,
				activeBotSet.has(player.seat),
			]),
		]);
		if (hostPlayersKey !== shownHostPlayers) {
			shownHostPlayers = hostPlayersKey;
			const connected = otherPlayers
				.filter((player) => player.presence === "online")
				.map(
					(player) => `${player.name || player.label} (${deps.t(player.seat)})`,
				);
			hostPlayers.replaceChildren(
				el("h3", {}, deps.t("Players")),
				el(
					"p",
					{},
					deps.t("Connected: {players}", {
						players:
							connected.length > 0 ? connected.join(", ") : deps.t("none"),
					}),
				),
				...otherPlayers.map((player) => {
					const isBot = activeBotSet.has(player.seat);
					const action = deps.t(isBot ? "Switch to player" : "Switch to bot");
					const control = button(
						action,
						() => {
							if (!controller.view().hosting || botRestorePending) return;
							manageBotSeat(player.seat, !isBot);
						},
						{ attrs: { "aria-label": `${action}: ${player.label}` } },
					);
					control.disabled = !view.hosting || botRestorePending;
					return el(
						"div",
						{
							className: "host-player",
							attrs: { "data-testid": `host-player-${player.seat}` },
						},
						el("span", {}, player.label),
						control,
					);
				}),
			);
		}
		const displayBotModel = "MCTS";
		table.setBotControls(
			view.hosting && !botRestorePending,
			activeBots,
			displayBotModel,
		);
		if (!view.hosting) delegatedBotSeats.clear();
		const rosterHost = JSON.stringify(view.roster?.auth ?? null);
		if (rosterHost !== playerAutoplayHost) {
			playerAutoplayHost = rosterHost;
			playerAutoplayWasEnabled = false;
			playerAutoplayConfirmedRoster = false;
			playerAutoplayAnswerRoster = undefined;
		}
		const rosterAutoplay = view.roster?.bots.includes(seat) ?? false;
		if (
			view.roster !== playerAutoplayAnswerRoster &&
			(rosterAutoplay || playerAutoplayWasEnabled)
		)
			playerAutoplayConfirmedRoster = true;
		if (playerAutoplayConfirmedRoster && !rosterAutoplay) {
			playerAutoplayConfirmedRoster = false;
			playerAutoplayWasEnabled = false;
			playerAutoplayStatus = deps.t("Autoplay stopped by the host.");
		}
		table.setPlayerAutoplay(
			!view.hosting && view.roster !== null,
			playerAutoplayWasEnabled || rosterAutoplay,
			playerAutoplayPending,
			playerAutoplayStatus,
		);
		yourTurn = tableModel.yourTurn;
		const turn =
			state?.match && tableModel.phase === "play"
				? `${state.matches}:${state.match.handNo}:${state.match.hand.turn}`
				: undefined;
		if (turn !== undefined && turn !== observedTurn) {
			observedTurn = turn;
			turnSequence++;
		}
		currentTurnKey = yourTurn ? String(turnSequence) : undefined;
		document.title = pageTitle(deps.t, {
			name: config.names[seat],
			seat,
			turn: yourTurn,
			host: view.hosting,
			bot: activeBots.includes(seat),
		});
		checkTurnAlert();
		// The lobby uses the table layout, so it looks like the game; only the game controls differ while waiting.
		root.dataset.screen = "table";
		root.dataset.waiting = String(tableModel.phase === "waiting");
		const tableKey = JSON.stringify(
			tableModel.scoring
				? {
						...tableModel,
						scoring: { ...tableModel.scoring, countdown: undefined },
					}
				: tableModel,
		);
		if (tableKey !== shownTable) {
			shownTable = tableKey;
			table.render(tableModel);
		}
		table.setNetwork(view.peers);
		table.setCountdown(tableModel.scoring?.countdown);
		// Every deal waits for all four seats, and the next hand also waits for the scoring countdown.
		// The start key counts the matches, so the host starts again after a reset; nothing is dealt while a reset waits.
		const hostCommand =
			!view.hosting ||
			terminal ||
			state === undefined ||
			state === null ||
			state.reset !== null
				? undefined
				: state.match === null
					? present.size === SEATS.length
						? {
								key: `start:${state.matches}`,
								payload: startPayload(tableId),
							}
						: undefined
					: settledHand !== undefined &&
							scoringCountdown === 0 &&
							present.size === SEATS.length
						? {
								key: `next:${settledHand}`,
								payload: nextHandPayload(tableId),
							}
						: undefined;
		if (hostCommand !== undefined && hostCommand.key !== hostCommandSent) {
			hostCommandSent = hostCommand.key;
			submit(hostCommand.payload, () => {
				hostCommandSent = undefined;
			});
		}
		send.textContent = deps.t(model.send.label);
		send.disabled = !model.send.enabled;
		sendNote.textContent =
			sendError ??
			(model.send.hint === undefined ? "" : deps.t(model.send.hint));
	}

	// A gesture lets the browser start remote audio that its autoplay rule blocked.
	const onGesture = (): void => {
		audio.resume();
		table.resumeVoices();
	};
	tableScreen.addEventListener("pointerdown", onGesture);
	tableScreen.addEventListener("keydown", onGesture);
	document.addEventListener("visibilitychange", onPageStateChange);
	window.addEventListener("appearance-change", renderCall);
	const unsubscribe = controller.onChange(render);
	call?.onChange(renderCall);
	if (deps.storage.persistent) {
		void deps.persist().then((answer) => {
			persisted = answer;
			render();
		});
	}
	render();
	renderCall();

	return () => {
		disposed = true;
		callPresence.stop();
		botRunner?.stop();
		if (scoringTimer !== undefined) window.clearInterval(scoringTimer);
		stopWatching();
		window.removeEventListener("resize", updateScreenCanvasScale);
		window.removeEventListener("resize", table.fitRows);
		window.removeEventListener("resize", onReportResize);
		root.style.removeProperty("--screen-canvas-scale");
		delete root.dataset.layout;
		unsubscribe();
		unsubscribeCamera?.();
		camera?.dispose();
		document.removeEventListener("visibilitychange", onPageStateChange);
		window.removeEventListener("appearance-change", renderCall);
		tableScreen.removeEventListener("pointerdown", onGesture);
		tableScreen.removeEventListener("keydown", onGesture);
		memory?.stop();
		call?.dispose();
		table.dispose();
		audio.detach();
	};
}
