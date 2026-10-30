import type { Bookmark } from "../bookmark";
import { checkHostApiKey } from "../bot/browser-openrouter";
import {
	normalizeHostApiKey,
	readHostApiKey,
	writeHostApiKey,
} from "../bot/host-key";
import type { HostBotSettings } from "../bot/host-runner";
import { canastaModule } from "../game/canasta";
import { newCommandId } from "../ids";
import { newTableKey } from "../p2p/link";
import { CANNOT_STORE, createTable, tableIdentity } from "../p2p/table";
import {
	botModelOrder,
	DEFAULT_BOT_SETUP,
	isRuleVariant,
	parseBotSetup,
	RULE_VARIANTS,
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
import { modelPriorityControl } from "./model-priority";
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

	const apiKey = el("input", {
		attrs: {
			type: "password",
			name: "openrouter-key",
			autocomplete: "new-password",
			"aria-label": deps.t("OpenRouter API key"),
		},
	});
	apiKey.value = readHostApiKey(deps.browser);
	apiKey.addEventListener("input", () => {
		apiKey.value = normalizeHostApiKey(apiKey.value);
	});
	const setup = prefill.botSetup ?? DEFAULT_BOT_SETUP;
	const modelPriority = modelPriorityControl(botModelOrder(setup), deps.t);
	const retries = el("input", {
		attrs: {
			type: "number",
			min: "0",
			max: "10",
			step: "1",
			name: "bot-retries",
			"aria-label": deps.t("Retries"),
		},
	});
	retries.value = String(setup.retries);
	const retryDelay = el("input", {
		attrs: {
			type: "number",
			min: "1",
			max: "60",
			step: "1",
			name: "bot-retry-delay",
			"aria-label": deps.t("Wait between retries (seconds)"),
		},
	});
	retryDelay.value = String(setup.retryDelayMs / 1000);
	const rules = el("select", {
		attrs: { name: "rules", "data-testid": "rules" },
	});
	rules.append(
		...RULE_VARIANTS.map((variant) =>
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
			el("label", {}, `${deps.t("OpenRouter API key")} `, apiKey),
			el(
				"p",
				{},
				deps.t(
					"Model priority: the first model is primary; after a server error, the bot tries the next model.",
				),
			),
			modelPriority.element,
			el("label", {}, `${deps.t("Retries")} `, retries),
			el(
				"label",
				{},
				`${deps.t("Wait between retries (seconds)")} `,
				retryDelay,
			),
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
		const botSetup = parseBotSetup({
			seats: botSeats,
			model: modelPriority.value()[0],
			fallbackModel: modelPriority.value()[1],
			modelOrder: modelPriority.value(),
			retries: Number(retries.value),
			retryDelayMs: Number(retryDelay.value) * 1000,
		});
		if (botSetup === undefined) {
			showErrors([
				deps.t("Check the bot models, retry count, and retry delay."),
			]);
			return;
		}
		const variant = isRuleVariant(rules.value) ? rules.value : "classic";
		const config: TableConfig = {
			...check.config,
			botSetup,
			...(variant === "classic" ? {} : { rules: variant }),
		};
		const normalizedApiKey = normalizeHostApiKey(apiKey.value);
		apiKey.value = normalizedApiKey;
		const hostBotSettings =
			botSeats.length > 0
				? {
						apiKey: normalizedApiKey,
						model: botSetup.model,
						fallbackModel: botSetup.fallbackModel,
						modelOrder: botModelOrder(botSetup),
						retries: botSetup.retries,
						retryDelayMs: botSetup.retryDelayMs,
					}
				: undefined;
		if (hostBotSettings && !hostBotSettings.apiKey) {
			showErrors([
				deps.t("Enter an OpenRouter API key to run bot seats in this browser."),
			]);
			return;
		}
		showErrors([]);
		submit.disabled = true;
		solo.disabled = true;
		void storeKeyAndCreate(
			normalizedApiKey,
			config,
			check.seat,
			hostBotSettings,
		);
	});

	const enableSubmit = (): void => {
		submit.disabled = false;
		solo.disabled = false;
		submit.textContent = deps.t("Create game");
	};

	/**
	 * The field starts with the stored key, so Create stores what it holds now, also without bot seats: autoplay and
	 * bot seats at the table use it later. A new key is checked with OpenRouter: a 401 refuses it,
	 * and another failure stores it but stops here once, so that the person sees why.
	 */
	async function storeKeyAndCreate(
		normalizedApiKey: string,
		config: TableConfig,
		seat: Seat,
		hostBotSettings?: HostBotSettings,
	): Promise<void> {
		if (normalizedApiKey !== readHostApiKey(deps.browser)) {
			let problem: string | undefined;
			if (normalizedApiKey !== "") {
				submit.textContent = deps.t("Testing the OpenRouter API key…");
				const result = await checkHostApiKey(normalizedApiKey);
				if (disposed) return;
				if (result.kind === "rejected") {
					showErrors([
						deps.t(
							"OpenRouter rejected this API key (401). The key was not saved.",
						),
					]);
					enableSubmit();
					return;
				}
				if (result.kind === "unverified") problem = result.problem;
			}
			try {
				writeHostApiKey(deps.browser, normalizedApiKey);
			} catch {
				showErrors([
					deps.t("This browser could not store the OpenRouter API key."),
				]);
				enableSubmit();
				return;
			}
			if (problem !== undefined) {
				showErrors([
					deps.t(
						"The key is saved, but the test request to OpenRouter got no usable answer: {problem}.",
						{ problem },
					),
					deps.t("Select Create game again to continue."),
				]);
				enableSubmit();
				return;
			}
		}
		submit.textContent = deps.t("Creating…");
		await create(config, seat, hostBotSettings);
	}

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
		el("label", {}, deps.t("Your name"), soloName),
		solo,
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
