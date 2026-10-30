import { expect, test } from "@playwright/test";
import type { Harness } from "./harness/main";

test("tracker diagnostics do not copy untrusted text into the console", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const warnings: string[] = [];
	try {
		await context.routeWebSocket("wss://hostile-tracker.test/", (socket) => {
			socket.onMessage(() => {
				for (const field of ["failure reason", "warning message"]) {
					socket.send(
						JSON.stringify({ [field]: `forged line\n${"x".repeat(10_000)}` }),
					);
				}
			});
		});
		const page = await context.newPage();
		page.on("console", (message) => {
			if (message.type() === "warning") warnings.push(message.text());
		});
		await page.goto(
			"http://localhost:4174/?trackers=wss%3A%2F%2Fhostile-tracker.test%2F&mqtt=none&stun=none",
		);
		await page.waitForFunction(() => window.ocHarness !== undefined);
		await page.evaluate(() => (window.ocHarness as Harness).createTable("N"));
		await expect.poll(() => warnings.length).toBeGreaterThanOrEqual(2);
		expect(warnings.some((entry) => entry.includes("tracker failure"))).toBe(
			true,
		);
		expect(warnings.some((entry) => entry.includes("tracker warning"))).toBe(
			true,
		);
		for (const warning of warnings) {
			expect(warning).not.toContain("forged line");
			expect(warning.length).toBeLessThan(250);
		}
	} finally {
		await context.close();
	}
});
