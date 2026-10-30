import { describe, expect, it } from "vitest";
import {
	catalogKeys,
	detectLocale,
	type Locale,
	translatedMessageKeys,
	translator,
} from "../../src/i18n";

const newLocales = [
	"es",
	"pt",
	"fr",
	"it",
	"nl",
] as const satisfies readonly Locale[];

describe("localization", () => {
	it("detects each supported language from regional browser preferences", () => {
		const cases = [
			["es-MX", "es"],
			["pt-BR", "pt"],
			["fr-CA", "fr"],
			["it-IT", "it"],
			["nl-NL", "nl"],
		] as const;

		for (const [preference, locale] of cases) {
			expect(detectLocale([preference], undefined)).toBe(locale);
		}
	});

	it("provides every existing translation key in each catalog", () => {
		const expected = [...translatedMessageKeys].sort();
		expect(new Set(expected).size).toBe(expected.length);

		for (const locale of ["de", "hu", "no", ...newLocales] as const) {
			expect([...catalogKeys(locale)].sort()).toEqual(expected);
		}
	});

	it("preserves the substitution names used by every translated message", () => {
		const names = (text: string) =>
			[
				...new Set(
					[...text.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((match) => match[0]),
				),
			].sort();
		const failures: string[] = [];
		for (const locale of ["de", "hu", "no", ...newLocales] as const) {
			for (const message of translatedMessageKeys) {
				const expected = names(message);
				const actual = names(translator(locale)(message));
				if (JSON.stringify(actual) !== JSON.stringify(expected))
					failures.push(`${locale}: ${message} (${actual.join(", ")})`);
			}
		}
		expect(failures).toEqual([]);
	});

	it("keeps every placeholder in bot progress translations", () => {
		const messages = [
			"Asking {model} for a turn choice (attempt {attempt} of {total}).",
			"Still waiting for {model} to return a decision.",
			"HTTP {status} from {previous}; trying next priority model {model} in {seconds} seconds.",
			"OpenRouter rate limit (429). Retrying in {seconds} seconds.",
			"OpenRouter returned HTTP {status}. Retrying in {seconds} seconds.",
			"OpenRouter request timed out. Retrying in {seconds} seconds.",
			"Could not reach OpenRouter. Retrying in {seconds} seconds.",
			"Using the heuristic choice.",
			"OpenRouter rejected the API key (401). Set the key again, then resume bots.",
			"OpenRouter has insufficient balance. Update the balance or API key, then resume bots.",
			"OpenRouter denied access to this model (403). Check the account and model access.",
			"OpenRouter could not find this model or endpoint (404). Choose another model.",
			"OpenRouter rejected the request as too large (413). Choose another model.",
			"OpenRouter kept rate limiting the bot after retries. Wait, then resume bots.",
			"OpenRouter or the model provider returned HTTP {status} after retries. Check provider status or choose another model.",
			"OpenRouter returned HTTP {status} after retries. Check the selected model and request settings.",
			"The OpenRouter request timed out. Resume bots to try again.",
			"The browser could not reach OpenRouter. Check the connection, then resume bots.",
			"The selected model returned an unusable decision: {problem}. Choose another model or resume bots.",
			"The bot could not use the model response. Choose another model or resume bots.",
		];
		for (const locale of ["de", "hu", "no", ...newLocales] as const) {
			for (const message of messages) {
				const placeholders = (text: string) =>
					[...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
				const translated = translator(locale)(message);
				expect(translated, `${locale}: ${message}`).not.toBe(message);
				expect(placeholders(translated), `${locale}: ${message}`).toEqual(
					placeholders(message),
				);
			}
		}
	});

	it("labels autoplay as a bot option in every supported language", () => {
		const labels = {
			en: "Enable autoplay (bot)",
			de: "Autoplay (Bot) aktivieren",
			hu: "Automatikus játék (bot) bekapcsolása",
			no: "Slå på automatisk spilling (bot)",
			es: "Activar juego automático (bot)",
			pt: "Ativar jogo automático (bot)",
			fr: "Activer le jeu automatique (bot)",
			it: "Attiva il gioco automatico (bot)",
			nl: "Automatisch spelen (bot) aanzetten",
		} as const satisfies Record<Locale, string>;

		for (const [locale, label] of Object.entries(labels) as [
			Locale,
			string,
		][]) {
			expect(translator(locale)("Enable autoplay (bot)")).toBe(label);
		}
	});

	it("translates the canasta table texts, with their values, in each language", () => {
		expect(translator("de")("{count} cards", { count: 3 })).toBe("3 Karten");
		expect(translator("hu")("Hand {number}", { number: 2 })).toBe(
			"2. leosztás",
		);
		expect(
			translator("fr")("{name} ({side}) went out.", {
				name: "Ann",
				side: "N-S",
			}),
		).toBe("Ann (N-S) sort.");
		for (const locale of ["de", "hu", "no", ...newLocales] as const)
			expect(
				translator(locale)("Your turn: draw from the stock, or take the pile."),
			).not.toBe("Your turn: draw from the stock, or take the pile.");
	});
});
