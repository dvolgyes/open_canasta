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
			`http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?trackers=wss%3A%2F%2Fhostile-tracker.test%2F&mqtt=none&stun=none`,
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

test("a tracker cannot flood the console with repeated warnings", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const warnings: string[] = [];
	let sendBurst: (marker: string) => void = () => {
		throw new Error("tracker socket did not open");
	};
	try {
		await context.routeWebSocket("wss://hostile-tracker.test/", (socket) => {
			let sent = false;
			sendBurst = (marker) => {
				for (let i = 0; i < 100; i++) {
					for (const field of ["failure reason", "warning message"])
						socket.send(JSON.stringify({ [field]: "untrusted" }));
				}
				socket.send(marker);
			};
			socket.onMessage(() => {
				if (sent) return;
				sent = true;
				sendBurst("burst-first");
			});
		});
		const page = await context.newPage();
		page.on("console", (message) => {
			if (message.type() === "warning") warnings.push(message.text());
		});
		await page.goto(
			`http://localhost:${process.env.TEST_HARNESS_PORT ?? "4174"}/?trackers=wss%3A%2F%2Fhostile-tracker.test%2F&mqtt=none&stun=none`,
		);
		await page.waitForFunction(() => window.ocHarness !== undefined);
		await page.evaluate(() => {
			const NativeWebSocket = window.WebSocket;
			window.WebSocket = class extends NativeWebSocket {
				constructor(url: string | URL, protocols?: string | string[]) {
					super(url, protocols);
					this.addEventListener("message", (event) => {
						if (
							typeof event.data === "string" &&
							event.data.startsWith("burst-")
						)
							document.documentElement.dataset.trackerBurst = event.data;
					});
				}
			};
		});
		await page.evaluate(() => (window.ocHarness as Harness).createTable("N"));
		await expect(page.locator("html")).toHaveAttribute(
			"data-tracker-burst",
			"burst-first",
		);
		expect(
			warnings.filter((entry) => entry.includes("tracker failure")),
		).toHaveLength(1);
		expect(
			warnings.filter((entry) => entry.includes("tracker warning")),
		).toHaveLength(1);
		await page.evaluate(() => {
			const now = Date.now();
			Date.now = () => now + 30_001;
		});
		sendBurst("burst-second");
		await expect(page.locator("html")).toHaveAttribute(
			"data-tracker-burst",
			"burst-second",
		);
		expect(
			warnings.filter((entry) => entry.includes("tracker failure")),
		).toHaveLength(2);
		expect(
			warnings.filter((entry) => entry.includes("tracker warning")),
		).toHaveLength(2);
	} finally {
		await context.close();
	}
});
