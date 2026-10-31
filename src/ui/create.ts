import type { Bookmark } from "../bookmark";
import type { HostBotSettings } from "../bot/host-runner";
import { BOT_THINKING_TIME_KEY, readThinkingTime } from "../bot/timing";
import { canastaModule } from "../game/canasta";
import { newCommandId } from "../ids";
import { newTableKey } from "../p2p/link";
import { CANNOT_STORE, createTable, tableIdentity } from "../p2p/table";
import {
	DEFAULT_BOT_SETUP,
	isRuleVariant,
	SEAT_NAMES,
	SEATS,
	type Seat,
	type TableConfig,
} from "../protocol";
import type { AppDeps, Dispose } from "./deps";
import { button, el } from "./dom";
import {
	checkCreateFields,
	DEFAULT_CREATE_FIELDS,
	RULE_VARIANT_TEXTS,
	storageText,
} from "./model";
import { readPersonalName, savePersonalName } from "./personal-name";
import { seatGrid } from "./seat-grid";
import { type EntryPage, sitePath } from "./site-path";

/**
 * The create screen, prefilled from a bookmark (names and the creator's seat). Calls `onCreated` with the table key,
 * its config and the creator's seat only after the table is stored in this browser.
 */
export function showCreate(
	root: HTMLElement,
	deps: AppDeps,
	prefill: Bookmark,
	onCreated: (
		key: string,
		config: TableConfig,
		seat: Seat,
		hostBots?: HostBotSettings,
	) => void,
	entry: EntryPage | "home" = "home",
): Dispose {
	let disposed = false;
	const nameFields = {} as Record<Seat, HTMLInputElement>;
	const meChoices = {} as Record<Seat, HTMLInputElement>;
	const botChoices = {} as Record<Seat, HTMLInputElement>;
	const editedNames = new Set<Seat>();
	const host = prefill.host ?? DEFAULT_CREATE_FIELDS.seat;
	const rows = SEATS.map((seat) => {
		const name = el("input", {
			attrs: {
				type: "text",
				name: `name-${seat}`,
				autocomplete: "off",
				"aria-label": `${deps.t(SEAT_NAMES[seat])} ${deps.t("Name").toLowerCase()}`,
			},
		});
		name.value =
			prefill.names[seat] ??
			((seat === host ? readPersonalName(deps.browser) : "") ||
				DEFAULT_CREATE_FIELDS.names[seat]);
		name.addEventListener("input", () => editedNames.add(seat));
		nameFields[seat] = name;
		const me = el("input", {
			attrs: {
				type: "radio",
				name: "me",
				value: seat,
				"aria-label": `${deps.t(SEAT_NAMES[seat])} ${deps.t("This is me")}`,
			},
		});
		const bot = el("input", {
			attrs: {
				type: "checkbox",
				name: `bot-${seat}`,
				value: seat,
				"aria-label": `${deps.t(SEAT_NAMES[seat])} ${deps.t("Bot")}`,
			},
		});
		me.checked = seat === host;
		bot.checked = (prefill.botSetup ?? DEFAULT_BOT_SETUP).seats.includes(seat);
		meChoices[seat] = me;
		botChoices[seat] = bot;
		return {
			seat,
			element: el(
				"section",
				{},
				el("h2", {}, deps.t(SEAT_NAMES[seat])),
				name,
				el(
					"div",
					{ className: "seat-roles" },
					el("label", {}, me, ` ${deps.t("This is me")}`),
					el("label", {}, bot, ` ${deps.t("Bot")}`),
				),
			),
		};
	});

	const setup = prefill.botSetup ?? DEFAULT_BOT_SETUP;
	const thinking = el("input", {
		attrs: {
			type: "number",
			min: "0",
			max: "60",
			step: "0.05",
			name: "bot-thinking-seconds",
			"aria-label": deps.t("Thinking time (seconds)"),
		},
	});
	thinking.value = String(readThinkingTime(deps.browser) / 1000);
	const rules = el("select", {
		attrs: { name: "rules", "data-testid": "rules" },
	});
	rules.append(
		...(["classic", "modern"] as const).map((variant) =>
			el(
				"option",
				{ attrs: { value: variant } },
				deps.t(RULE_VARIANT_TEXTS[variant].name),
			),
		),
	);
	rules.value = prefill.rules ?? "classic";
	const rulesSummary = el("p", { className: "note" });
	const showSummary = (): void => {
		const variant = isRuleVariant(rules.value) ? rules.value : "classic";
		rulesSummary.textContent = deps.t(RULE_VARIANT_TEXTS[variant].summary);
	};
	showSummary();
	rules.addEventListener("change", showSummary);
	const errors = el("ul", {
		className: "errors",
		attrs: { role: "alert", "data-testid": "errors" },
	});
	const submit = el(
		"button",
		{ attrs: { type: "submit", "data-testid": "create" } },
		deps.t("Create game"),
	);
	const soloName = el("input", {
		attrs: {
			type: "text",
			"aria-label": deps.t("Your name"),
			autocomplete: "off",
			"data-testid": "solo-name",
		},
	});
	soloName.value = readPersonalName(deps.browser) || deps.t("Human");
	let soloNameEdited = false;
	soloName.addEventListener("input", () => {
		soloNameEdited = true;
	});
	const prepareSolo = (): void => {
		nameFields.S.value = soloName.value;
		if (soloNameEdited) editedNames.add("S");
		for (const seat of SEATS) {
			meChoices[seat].checked = seat === "S";
			botChoices[seat].checked = seat !== "S";
			if (seat !== "S") nameFields[seat].value = "bot";
		}
	};
	const solo = button(
		deps.t("Play with bots"),
		() => {
			prepareSolo();
			form.requestSubmit();
		},
		{ attrs: { "data-testid": "create-solo" } },
	);
	const nameHelp = el(
		"p",
		{},
		deps.t("Leave a name blank to ask the person joining."),
	);
	const seating = seatGrid(rows);
	nameHelp.hidden = seating.hidden = submit.hidden = entry === "solo";
	const form = el(
		"form",
		{ className: "create" },
		nameHelp,
		seating,
		el("label", {}, `${deps.t("Rules")} `, rules),
		rulesSummary,
		errors,
		submit,
		el(
			"fieldset",
			{},
			el("legend", {}, deps.t("Optional automated players")),
			el("p", {}, deps.t("Bots use local Monte Carlo tree search.")),
			el("label", {}, `${deps.t("Thinking time (seconds)")} `, thinking),
		),
	);

	const showErrors = (messages: readonly string[]): void => {
		errors.replaceChildren(...messages.map((text) => el("li", {}, text)));
	};

	// Only a browser that keeps data can hold the first copy of the table.
	if (!deps.storage.persistent) {
		showErrors([deps.t(CANNOT_STORE)]);
		submit.disabled = true;
		solo.disabled = true;
	}

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (entry === "solo") prepareSolo();
		const names = {} as Record<Seat, string>;
		for (const seat of SEATS) names[seat] = nameFields[seat].value;
		const seat = SEATS.find((choice) => meChoices[choice].checked) ?? "";
		const check = checkCreateFields({ names, seat }, deps.t);
		if (!check.ok) {
			showErrors(check.errors.map((error) => deps.t(error)));
			return;
		}
		const botSeats = SEATS.filter((item) => botChoices[item].checked);
		const botSetup = { ...setup, seats: botSeats };
		const thinkingTimeMs = Number(thinking.value) * 1000;
		if (
			!Number.isFinite(thinkingTimeMs) ||
			thinkingTimeMs < 0 ||
			thinkingTimeMs > 60000
		) {
			showErrors([deps.t("Thinking time must be from 0 to 60 seconds.")]);
			return;
		}
		const variant = isRuleVariant(rules.value) ? rules.value : "classic";
		const config: TableConfig = {
			...check.config,
			botSetup,
			...(variant === "classic" ? {} : { rules: variant }),
		};
		const hostBotSettings =
			botSeats.length > 0
				? {
						thinkingTimeMs,
					}
				: undefined;
		showErrors([]);
		deps.browser?.setItem(BOT_THINKING_TIME_KEY, String(thinkingTimeMs));
		submit.disabled = true;
		solo.disabled = true;
		void create(config, check.seat, hostBotSettings);
	});

	async function create(
		config: TableConfig,
		seat: Seat,
		hostBotSettings?: HostBotSettings,
	): Promise<void> {
		const key = newTableKey();
		const identity = await tableIdentity(key, deps.browser);
		if (disposed) return;
		const created = await createTable({
			storage: deps.storage,
			identity,
			seat,
			config,
			module: canastaModule,
			newId: newCommandId,
			clock: deps.clock,
			memory: deps.memory,
			hostBots: hostBotSettings !== undefined,
		});
		if (disposed) return;
		if (!created.ok) {
			showErrors([
				`${deps.t("Could not create the game")}: ${storageText(created.code, deps.t)}`,
			]);
			submit.disabled = false;
			solo.disabled = false;
			submit.textContent = deps.t("Create game");
			return;
		}
		if (editedNames.has(seat))
			savePersonalName(deps.browser, config.names[seat]);
		void deps.persist();
		onCreated(key, config, seat, hostBotSettings);
	}

	const soloHeading = el("h2", {}, deps.t("Solo game"));
	soloHeading.hidden = entry === "solo";
	const soloSection = el(
		"section",
		{ className: "solo-setup" },
		soloHeading,
		el(
			"div",
			{ className: "solo-row" },
			el("label", {}, deps.t("Your name"), soloName),
			solo,
		),
	);
	soloSection.hidden = entry === "create";
	const description = el(
		"p",
		{},
		deps.t(
			"Enter the four players. Choose your seat. Your browser hosts first; anyone at the table can take over.",
		),
	);
	description.hidden = entry === "solo";
	const pathname = new URL(deps.pageUrl()).pathname;
	root.replaceChildren(
		el(
			"section",
			{ className: "create-screen" },
			el("h1", {}, deps.t(entry === "solo" ? "Solo game" : "Create game")),
			el(
				"nav",
				{
					className: "entry-navigation",
					attrs: { "aria-label": deps.t("Game setup") },
				},
				el(
					"a",
					{ attrs: { href: `${sitePath(pathname, "solo")}/` } },
					deps.t("Solo game"),
				),
				el(
					"a",
					{ attrs: { href: `${sitePath(pathname, "create")}/` } },
					deps.t("Create game"),
				),
			),
			soloSection,
			description,
			form,
		),
	);
	return () => {
		disposed = true;
	};
}
