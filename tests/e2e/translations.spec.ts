import { expect, type Page, test } from "@playwright/test";
import { translatedMessageKeys, translator } from "../../src/i18n";

const t = translator("hu");
const hungarian = translatedMessageKeys.map((key) => t(key));

function wordPattern(text: string): RegExp {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
}

const englishFragments = [
	...new Set(
		translatedMessageKeys
			.filter((key) => t(key) !== key)
			.flatMap((key) => key.split(/\{[a-zA-Z0-9_]+\}/))
			.map((fragment) => fragment.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
			.filter(
				(fragment) =>
					/\p{L}{4}/u.test(fragment) || /\p{L}+\s+\p{L}+/u.test(fragment),
			),
	),
]
	.filter(
		(fragment) => !hungarian.some((value) => wordPattern(fragment).test(value)),
	)
	.map((fragment) => ({ fragment, pattern: wordPattern(fragment) }));
const englishWords =
	/(?<![\p{L}\p{N}])(the|to|your|you|for|and|with|from|player|waiting|turn|draw|discard|stock|save|cancel|settings|connected|game)(?![\p{L}\p{N}])/iu;

async function englishOn(page: Page): Promise<string[]> {
	const texts = await page.evaluate(() => {
		const found = new Set<string>();
		const visible = (node: Element) =>
			node.checkVisibility({ visibilityProperty: true, opacityProperty: true });
		const walker = document.createTreeWalker(
			document.body,
			NodeFilter.SHOW_TEXT,
		);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node.textContent?.trim();
			const parent = node.parentElement;
			if (text && parent && !parent.closest("script, style") && visible(parent))
				found.add(text);
		}
		for (const node of document.body.querySelectorAll("*")) {
			if (!visible(node)) continue;
			for (const name of [
				"aria-label",
				"aria-description",
				"title",
				"placeholder",
				"alt",
			]) {
				const value = node.getAttribute(name)?.trim();
				if (value) found.add(value);
			}
		}
		found.add(document.title);
		return [...found];
	});
	return texts.flatMap((text) => {
		const fragment = englishFragments.find((item) => item.pattern.test(text));
		if (fragment) return [`${text} (English: ${fragment.fragment})`];
		const word = englishWords.exec(text)?.[0];
		return word ? [`${text} (English word: ${word})`] : [];
	});
}

for (const form of [
	{ name: "desktop", viewport: { width: 1280, height: 720 }, mobile: false },
	{ name: "phone", viewport: { width: 390, height: 844 }, mobile: true },
] as const) {
	test(`the ${form.name} setup and game use Hungarian throughout`, async ({
		browser,
		baseURL,
	}) => {
		const context = await browser.newContext({
			baseURL,
			locale: "hu-HU",
			viewport: form.viewport,
			isMobile: form.mobile,
			hasTouch: form.mobile,
		});
		try {
			const page = await context.newPage();
			await page.goto("/solo/");
			await expect(page.getByTestId("create-solo")).toBeVisible();
			expect(await englishOn(page), "setup").toEqual([]);
			await page.getByTestId("solo-name").fill("Ádám");
			await page.getByTestId("create-solo").click();
			const table = page.getByTestId("table");
			await expect(table).toHaveAttribute("data-phase", "play", {
				timeout: 45_000,
			});
			await expect(table).toHaveAttribute("data-your-turn", "true", {
				timeout: 45_000,
			});
			expect(await englishOn(page), "before draw").toEqual([]);
			await page.getByTestId("action-draw").click();
			await page.locator(".own-hand button.card").first().click();
			await expect(page.getByTestId("action-discard")).toBeVisible();
			expect(await englishOn(page), "after draw").toEqual([]);
			await page.getByTestId("action-discard").click();
			await expect(page.getByText(/MCTS: \d+ szimuláció/)).toBeVisible({
				timeout: 30_000,
			});
			expect(await englishOn(page), "bot decision").toEqual([]);
			await page
				.getByRole("button", { name: t("Appearance settings") })
				.click();
			expect(await englishOn(page), "settings").toEqual([]);
		} finally {
			await context.close();
		}
	});
}

test("local bots report search progress in Hungarian without API requests", async ({
	browser,
	baseURL,
}) => {
	const context = await browser.newContext({ baseURL, locale: "hu-HU" });
	try {
		const page = await context.newPage();
		page.on("request", (request) =>
			expect(request.url()).not.toContain("openrouter.ai"),
		);
		await page.goto("/solo/");
		await page.getByTestId("solo-name").fill("Ádám");
		await page.getByTestId("create-solo").click();
		const table = page.getByTestId("table");
		await expect(table).toHaveAttribute("data-phase", "play", {
			timeout: 45_000,
		});
		await expect(table).toHaveAttribute("data-your-turn", "true", {
			timeout: 45_000,
		});
		await page.getByTestId("action-draw").click();
		await page.locator(".own-hand button.card").first().click();
		const afterDiscard = Number(await table.getAttribute("data-at")) + 1;
		await page.getByTestId("action-discard").click();
		await expect(page.getByText(/MCTS: \d+ szimuláció/)).toBeVisible({
			timeout: 30_000,
		});
		await expect
			.poll(async () => Number(await table.getAttribute("data-at")), {
				timeout: 30_000,
			})
			.toBeGreaterThan(afterDiscard);
		expect(await englishOn(page), "local search").toEqual([]);
	} finally {
		await context.close();
	}
});
