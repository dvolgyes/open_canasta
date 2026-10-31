import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("retains incomplete paired legs, resumes them, and rejects corrupted evidence", () => {
	const root = mkdtempSync(join(tmpdir(), "modern-study-test-"));
	try {
		const config = {
			version: 1,
			seed: 100,
			split: 0,
			pairs: 1,
			maxHands: 1,
			maxActionsPerHand: 1,
			simulations: 1,
			timeMs: 1000,
			depth: 1,
			a: null,
			b: null,
		};
		const configPath = join(root, "config.json");
		const output = join(root, "output");
		writeFileSync(configPath, JSON.stringify(config));
		const run = (resume = false) =>
			spawnSync(
				process.execPath,
				[
					"--import",
					"tsx",
					"scripts/modern-study.ts",
					configPath,
					output,
					...(resume ? ["--resume"] : []),
				],
				{ encoding: "utf8", timeout: 30000 },
			);
		const first = run();
		expect(first.status, first.stderr).toBe(2);
		expect(JSON.parse(first.stdout)).toMatchObject({
			eligible: false,
			incompleteLegs: 2,
			winRate: null,
		});
		const resumed = run(true);
		expect(resumed.status, resumed.stderr).toBe(2);
		expect(resumed.stdout).toBe(first.stdout);
		const path = join(output, "pair-0-team-0.json");
		const saved = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(path, JSON.stringify({ ...saved, aWin: 1 }));
		const corrupted = run(true);
		expect(corrupted.status).not.toBe(0);
		expect(corrupted.stderr).toContain("invalid retained match");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
