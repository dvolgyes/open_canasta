import { type ChildProcess, spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createTableLink, takeTurn } from "./pages";

test("OpenRouter CLI bots take a turn at a Canasta table", async ({ page }) => {
	test.skip(
		process.env.E2E_LIVE_OPENROUTER !== "1",
		"live OpenRouter test is opt-in",
	);
	test.setTimeout(240_000);
	const bots: ChildProcess[] = [];
	let fallback = false;
	try {
		await page.goto("/");
		for (const [seat, name] of [
			["N", "bot north"],
			["E", "bot east"],
			["S", "bot south"],
		] as const)
			await page.locator(`input[name="name-${seat}"]`).fill(name);
		const link = await createTableLink(page);
		for (const name of ["bot north", "bot east", "bot south"]) {
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
				],
				{
					stdio: ["ignore", "ignore", "pipe"],
				},
			);
			child.stderr?.on("data", (chunk: Buffer) => {
				if (chunk.toString().includes("Using the heuristic choice"))
					fallback = true;
			});
			bots.push(child);
		}
		const table = page.getByTestId("table");
		await expect(table).toHaveAttribute("data-phase", "play", {
			timeout: 90_000,
		});
		await expect
			.poll(
				async () => {
					const at = Number(await table.getAttribute("data-at"));
					const yourTurn =
						(await table.getAttribute("data-your-turn")) === "true";
					return at > 0 || yourTurn;
				},
				{ timeout: 120_000 },
			)
			.toBe(true);
		let at = Number(await table.getAttribute("data-at"));
		if (at === 0 && (await table.getAttribute("data-your-turn")) === "true") {
			await takeTurn(page, 0);
			at = 2;
		}
		await expect
			.poll(async () => Number(await table.getAttribute("data-at")), {
				timeout: 120_000,
			})
			.toBeGreaterThan(at);
		expect(
			fallback,
			"a bot used the heuristic after an OpenRouter failure",
		).toBe(false);
	} finally {
		for (const bot of bots) bot.kill("SIGKILL");
	}
});
