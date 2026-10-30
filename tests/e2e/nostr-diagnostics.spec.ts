import { expect, test } from "@playwright/test";
import type { Harness } from "./harness/main";

test("a hostile Nostr relay cannot expose its text or flood diagnostics", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const warnings: string[] = [];
	const errors: string[] = [];
	let sendBurst: () => void = () => {
		throw new Error("relay socket did not open");
	};
	try {
		await context.routeWebSocket("wss://hostile-nostr.test/", (socket) => {
			let sent = false;
			sendBurst = () => {
				for (let i = 0; i < 100; i++)
					socket.send(
						JSON.stringify(["NOTICE", `private\n${"x".repeat(2000)}`]),
					);
			};
			socket.onMessage(() => {
				if (sent) return;
				sent = true;
				sendBurst();
				socket.send("not json");
				socket.send(JSON.stringify(["EVENT", "", { tags: [], content: 0 }]));
			});
		});
		const page = await context.newPage();
		page.on("console", (message) => {
			if (message.type() === "warning") warnings.push(message.text());
		});
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(
			`http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?trackers=none&mqtt=none&nostr=wss%3A%2F%2Fhostile-nostr.test%2F&stun=none`,
		);
		await page.waitForFunction(() => window.ocHarness !== undefined);
		await page.evaluate(() => (window.ocHarness as Harness).createTable("N"));
		await expect.poll(() => warnings.length).toBeGreaterThan(0);
		await page.waitForTimeout(1_000);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).not.toContain("private");
		expect(warnings[0]?.length).toBeLessThan(250);
		await page.evaluate(() => {
			const now = performance.now();
			Object.defineProperty(performance, "now", { value: () => now + 30_001 });
		});
		sendBurst();
		await expect.poll(() => warnings.length).toBe(2);
		expect(errors).toEqual([]);
	} finally {
		await context.close();
	}
});
