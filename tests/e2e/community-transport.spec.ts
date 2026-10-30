import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import type {} from "./harness/community";
import { RelayHub } from "./relay-hub";

const HARNESS_URL = `http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/`;

test("a different formation key cannot join the private channel", async ({
	browser,
}) => {
	const hub = new RelayHub("tracker", ["wss://tracker.community.test"]);
	const contexts: BrowserContext[] = [];
	const pages: Page[] = [];
	try {
		for (let i = 0; i < 3; i++) {
			const context = await browser.newContext();
			contexts.push(context);
			await hub.install(context, String(i));
			const page = await context.newPage();
			pages.push(page);
			await page.goto(new URL("community.html", HARNESS_URL).href);
			await page.waitForFunction(() => window.communityHarness !== undefined);
			await page.evaluate(
				(wrong) =>
					window.communityHarness.open(
						"private",
						(wrong ? "B" : "A").repeat(43),
					),
				i === 2,
			);
		}
		const [first, second, outsider] = pages;
		if (!first || !second || !outsider) throw new Error("missing browser page");
		for (const page of [first, second])
			await expect
				.poll(
					() => page.evaluate(() => window.communityHarness.peers("private")),
					{ timeout: 30_000 },
				)
				.toBe(1);
		await first.evaluate(() =>
			window.communityHarness.send("private", "only members"),
		);
		await expect
			.poll(() =>
				second.evaluate(() => window.communityHarness.received("private")),
			)
			.toEqual(["only members"]);
		await outsider.waitForTimeout(3_000);
		await expect
			.poll(
				() => outsider.evaluate(() => window.communityHarness.peers("private")),
				{ timeout: 5_000 },
			)
			.toBe(0);
		expect(
			await outsider.evaluate(() =>
				window.communityHarness.received("private"),
			),
		).toEqual([]);
	} finally {
		await Promise.all(contexts.map((context) => context.close()));
	}
});

test("leaving public discovery preserves the private formation channel", async ({
	browser,
}) => {
	const hub = new RelayHub("tracker", ["wss://tracker.community.test"]);
	const contexts: BrowserContext[] = [];
	const pages: Page[] = [];
	const errors: string[] = [];
	try {
		for (let index = 0; index < 4; index++) {
			const context = await browser.newContext();
			contexts.push(context);
			await hub.install(context, String(index));
			const page = await context.newPage();
			pages.push(page);
			page.on("pageerror", (error) => errors.push(error.message));
			await page.goto(new URL("community.html", HARNESS_URL).href);
			await page.waitForFunction(() => window.communityHarness !== undefined);
			await page.evaluate(() => {
				window.communityHarness.open("waiting-v1");
				window.communityHarness.open("test-party", "A".repeat(43));
			});
		}
		for (const page of pages) {
			await expect
				.poll(
					() =>
						page.evaluate(() => window.communityHarness.peers("waiting-v1")),
					{ timeout: 30_000 },
				)
				.toBe(3);
			await expect
				.poll(
					() =>
						page.evaluate(() => window.communityHarness.peers("test-party")),
					{ timeout: 30_000 },
				)
				.toBe(3);
		}
		await Promise.all(
			pages.map((page) =>
				page.evaluate(() => window.communityHarness.leave("waiting-v1")),
			),
		);
		for (const [index, page] of pages.entries())
			await page.evaluate(
				(id) => window.communityHarness.send("test-party", `after-${id}`),
				index,
			);
		for (const [index, page] of pages.entries()) {
			await expect
				.poll(() =>
					page.evaluate(() =>
						[...window.communityHarness.received("test-party")].sort(),
					),
				)
				.toEqual(
					[0, 1, 2, 3].filter((id) => id !== index).map((id) => `after-${id}`),
				);
			expect(
				await page.evaluate(() => window.communityHarness.peers("waiting-v1")),
			).toBe(0);
			expect(
				await page.evaluate(() => window.communityHarness.problems()),
			).toBe(0);
		}
		expect(errors).toEqual([]);
	} finally {
		await Promise.all(contexts.map((context) => context.close()));
	}
});

test("twelve browsers discover each other and exchange bounded announcements", async ({
	browser,
}) => {
	const hub = new RelayHub("tracker", ["wss://tracker.community.test"]);
	const contexts: BrowserContext[] = [];
	const pages: Page[] = [];
	try {
		for (let index = 0; index < 12; index++) {
			const context = await browser.newContext();
			contexts.push(context);
			await hub.install(context, String(index));
			const page = await context.newPage();
			pages.push(page);
			await page.goto(new URL("community.html", HARNESS_URL).href);
			await page.waitForFunction(() => window.communityHarness !== undefined);
			await page.evaluate(() => window.communityHarness.open("waiting-v1"));
		}
		for (const page of pages)
			await expect
				.poll(
					() =>
						page.evaluate(() => window.communityHarness.peers("waiting-v1")),
					{ timeout: 45_000 },
				)
				.toBe(11);
		for (const [index, page] of pages.entries())
			await page.evaluate(
				(index) =>
					window.communityHarness.send("waiting-v1", `announcement-${index}`),
				index,
			);
		for (const page of pages) {
			await expect
				.poll(() =>
					page.evaluate(
						() => window.communityHarness.received("waiting-v1").length,
					),
				)
				.toBe(11);
			expect(
				await page.evaluate(() => window.communityHarness.problems()),
			).toBe(0);
		}
	} finally {
		await Promise.all(contexts.map((context) => context.close()));
	}
});
