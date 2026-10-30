import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { DEFAULT_BOT_ACTION_DELAY_MS } from "../../src/bot/timing";
import { HOST_LOST_MS } from "../../src/p2p/limits";
import { freeze } from "./lifecycle";
import { createTableLink, pick, takeTurn } from "./pages";

for (const recovery of ["reload", "handover"] as const) {
	test(`a CLI bot resumes its completed decision after host ${recovery}`, async ({
		page,
		context,
		browser,
	}) => {
		test.setTimeout(300_000);
		const bots: ChildProcess[] = [];
		const requests = new Map<ChildProcess, number>();
		const responses = new Set<ChildProcess>();
		const output = new Map<ChildProcess, string>();
		let guestContext: BrowserContext | undefined;
		let guest: Page | undefined;
		let thaw: (() => Promise<void>) | undefined;
		try {
			await page.goto("/");
			const botSeats = [
				["E", "bot east"],
				["S", "bot south"],
				...(recovery === "reload" ? [["N", "bot north"] as const] : []),
			] as const;
			for (const [seat, name] of botSeats)
				await page.locator(`input[name="name-${seat}"]`).fill(name);
			const link = await createTableLink(page);
			const personalLink = page.url();
			if (recovery === "handover") {
				guestContext = await browser.newContext();
				guest = await guestContext.newPage();
				await guest.goto(link);
				await pick(guest, "N");
			}
			for (const [, name] of botSeats) {
				const child = spawn(
					process.execPath,
					[
						"--env-file-if-exists=.env",
						"--require",
						resolve("tests/fixtures/deferred-decision.cjs"),
						"--import",
						"tsx",
						"src/bot/cli.ts",
						link,
						"--user",
						name,
						"--model",
						"inception/mercury-decide",
					],
					{
						env: { ...process.env, OPENROUTER_API_KEY: "test-key" },
						stdio: ["ignore", "pipe", "ignore", "ipc"],
					},
				);
				child.on("message", (message) => {
					if (message === "model-request")
						requests.set(child, (requests.get(child) ?? 0) + 1);
					if (message === "model-response") responses.add(child);
				});
				child.stdout?.on("data", (chunk: Buffer) => {
					output.set(child, (output.get(child) ?? "") + chunk.toString());
				});
				bots.push(child);
			}
			await expect(page.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{
					timeout: 90_000,
				},
			);
			await expect
				.poll(
					async () => {
						if (requests.size > 0) return true;
						for (const human of guest ? [page, guest] : [page]) {
							const table = human.getByTestId("table");
							if ((await table.getAttribute("data-your-turn")) === "true")
								await takeTurn(
									human,
									Number(await table.getAttribute("data-at")),
								);
						}
						return requests.size > 0;
					},
					{ timeout: 90_000 },
				)
				.toBe(true);
			const first = [...requests.keys()][0];
			if (!first) throw new Error("no bot requested a decision");
			if (guest) thaw = await freeze(guest);
			await page.close();
			// The disconnected host must pass the absence threshold before the model answers.
			await new Promise((resolveWait) =>
				setTimeout(resolveWait, HOST_LOST_MS + 2_000),
			);
			first.send("release-decision");
			await expect.poll(() => responses.has(first)).toBe(true);
			// Allow the runner's minimum action delay to finish while the host is absent.
			await new Promise((resolveWait) =>
				setTimeout(resolveWait, DEFAULT_BOT_ACTION_DELAY_MS + 1_000),
			);
			expect(requests.get(first)).toBe(1);
			expect(output.get(first) ?? "").not.toContain("Sent ");
			let restored: Page;
			if (guest && thaw) {
				await thaw();
				thaw = undefined;
				restored = guest;
				await expect(restored).toHaveTitle(/player1 \(N, host\)$/, {
					timeout: 90_000,
				});
			} else {
				restored = await context.newPage();
				await restored.goto(personalLink);
			}
			await expect(restored.getByTestId("table")).toHaveAttribute(
				"data-phase",
				"play",
				{
					timeout: 90_000,
				},
			);
			await expect
				.poll(() => output.get(first) ?? "", { timeout: 90_000 })
				.toContain("Sent ");
		} finally {
			if (thaw) await thaw();
			await guestContext?.close();
			for (const bot of bots) bot.kill("SIGTERM");
			await Promise.all(
				bots.map(
					(bot) =>
						new Promise<void>((resolveExit) => {
							if (bot.exitCode !== null || bot.signalCode !== null)
								return resolveExit();
							const limit = setTimeout(() => bot.kill("SIGKILL"), 15_000);
							bot.once("exit", () => {
								clearTimeout(limit);
								resolveExit();
							});
						}),
				),
			);
		}
	});
}
