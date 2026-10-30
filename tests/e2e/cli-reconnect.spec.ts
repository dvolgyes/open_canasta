import { type ChildProcess, spawn } from "node:child_process";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { HOST_LOST_MS } from "../../src/p2p/limits";
import { freeze } from "./lifecycle";
import { createTableLink, pick, takeTurn } from "./pages";

for (const recovery of ["reload", "handover"] as const) {
	test(`a CLI bot resumes local play after host ${recovery}`, async ({
		page,
		context,
		browser,
	}) => {
		test.setTimeout(300_000);
		const bots: ChildProcess[] = [];
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
						"--import",
						"tsx",
						"src/bot/cli.ts",
						link,
						"--user",
						name,
						"--think-seconds",
						"0.25",
					],
					{
						env: { ...process.env },
						stdio: ["ignore", "pipe", "ignore", "ipc"],
					},
				);
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
						if ([...output.values()].some((text) => text.includes("Sent ")))
							return true;
						for (const human of guest ? [page, guest] : [page]) {
							const table = human.getByTestId("table");
							if ((await table.getAttribute("data-your-turn")) === "true")
								await takeTurn(
									human,
									Number(await table.getAttribute("data-at")),
								);
						}
						return [...output.values()].some((text) => text.includes("Sent "));
					},
					{ timeout: 90_000 },
				)
				.toBe(true);
			const first = [...output.keys()].find((bot) =>
				output.get(bot)?.includes("Sent "),
			);
			if (!first) throw new Error("no local bot played");
			if (guest) thaw = await freeze(guest);
			await page.close();
			// The disconnected host must pass the absence threshold before play resumes.
			await new Promise((resolveWait) =>
				setTimeout(resolveWait, HOST_LOST_MS + 2_000),
			);
			const sentBefore =
				[...output.values()].join("").split("Sent ").length - 1;
			expect(bots.every((bot) => bot.exitCode === null)).toBe(true);
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
				.poll(
					async () => {
						const table = restored.getByTestId("table");
						if ((await table.getAttribute("data-your-turn")) === "true")
							await takeTurn(
								restored,
								Number(await table.getAttribute("data-at")),
							);
						return [...output.values()].join("").split("Sent ").length - 1;
					},
					{ timeout: 90000 },
				)
				.toBeGreaterThan(sentBefore);
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
