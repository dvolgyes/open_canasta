import {
	bookmarkQuery,
	parseBookmark,
	parseSelectedPlayer,
	parseTableSetup,
	SELECTED_PLAYER_PARAM,
	selectedPlayerQuery,
} from "../bookmark";
import { parseRoute, tableFragment } from "../p2p/link";
import { applyBoardTexture } from "./board-settings";
import { showCreate } from "./create";
import type { AppDeps, Dispose, Navigation } from "./deps";
import { copyToClipboard } from "./dom";
import { showLinkProblem, showTable } from "./join";
import { languageControl } from "./language-control";
import { siteLocation, sitePath } from "./site-path";
import { applySuitColors } from "./suit-colors";
import { watchTheme } from "./theme";
import { screenWakeLock, WakeLockPolicy } from "./wake-lock";

/**
 * Routes on the URL fragment: empty → create, `#k=<key>` → the table. The query prefills the create screen
 * and can select a seat in a table. Leaving a screen disposes it, so a previous table's mesh and timers stop before
 * the next table starts.
 */
export function startApp(root: HTMLElement, deps: AppDeps): void {
	const base = document.querySelector("base");
	if (base) base.href = siteLocation(location.pathname).root;
	applyBoardTexture(deps.browser);
	applySuitColors(deps.browser);
	watchTheme(deps.browser);
	const wakeLock = new WakeLockPolicy(screenWakeLock);
	wakeLock.update(true);
	document.addEventListener("visibilitychange", () => wakeLock.pageShown());
	root.before(languageControl(deps));
	let dispose: Dispose | undefined;
	const navigation: Navigation = {
		createNew: () => {
			dispose?.();
			dispose = undefined;
			location.assign(`${sitePath(location.pathname, "create")}/`);
		},
		rememberSeat: (seat) => {
			const query = selectedPlayerQuery(location.search, seat);
			history.replaceState(
				null,
				"",
				`${location.pathname}?${query}${location.hash}`,
			);
		},
		forgetSeat: () => {
			const query = new URLSearchParams(location.search);
			query.delete(SELECTED_PLAYER_PARAM);
			const search = query.toString();
			history.replaceState(
				null,
				"",
				`${location.pathname}${search ? `?${search}` : ""}${location.hash}`,
			);
		},
	};

	const route = (): void => {
		dispose?.();
		dispose = undefined;
		const target = parseRoute(location.hash);
		switch (target.kind) {
			case "create":
				dispose = showCreate(
					root,
					deps,
					parseBookmark(location.search),
					(key, config, seat, hostBots) => {
						// Keep setup data and the selected seat in the address; replaceState fires no hashchange.
						const query = bookmarkQuery(
							config.names,
							seat,
							config.botSetup,
							config.rules,
						);
						const sharedUrl = new URL(deps.pageUrl());
						sharedUrl.search = query;
						sharedUrl.hash = tableFragment(key);
						const autoCopy = copyToClipboard(sharedUrl.toString());
						history.replaceState(
							null,
							"",
							`${location.pathname}?${query}${tableFragment(key)}`,
						);
						dispose?.();
						dispose = showTable(
							root,
							deps,
							key,
							true,
							navigation,
							parseSelectedPlayer(location.search),
							{ config, host: seat },
							autoCopy,
							hostBots,
						);
					},
					siteLocation(location.pathname).page,
				);
				return;
			case "table": {
				dispose = showTable(
					root,
					deps,
					target.key,
					false,
					navigation,
					parseSelectedPlayer(location.search),
					parseTableSetup(location.search),
				);
				return;
			}
			case "invalid":
				dispose = showLinkProblem(
					root,
					navigation,
					deps.t("This link is not valid. Check that you copied all of it."),
					deps.t,
				);
				return;
		}
	};

	window.addEventListener("hashchange", route);
	route();
}
