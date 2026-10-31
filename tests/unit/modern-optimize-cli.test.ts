import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("retains incomplete optimization legs, resumes, and rejects corrupted data", () => {
	const root = mkdtempSync(join(tmpdir(), "modern-optimize-test-"));
	try {
		const config = {
			version: 1,
			seed: 100,
			split: 1,
			updates: 1,
			blocks: 1,
			radius: 2,
			schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
			maxHands: 1,
			maxActionsPerHand: 1,
			simulations: 1,
			timeMs: 1000,
			depth: 1,
			opponents: [null],
		};
		const configPath = join(root, "config.json"),
			output = join(root, "output");
		writeFileSync(configPath, JSON.stringify(config));
		const run = (resume = false) =>
			spawnSync(
				process.execPath,
				[
					"--import",
					"tsx",
					"scripts/modern-optimize.ts",
					configPath,
					output,
					...(resume ? ["--resume"] : []),
				],
				{ encoding: "utf8", timeout: 30000 },
			);
		const first = run();
		expect(first.status, first.stderr).toBe(2);
		expect(JSON.parse(first.stdout)).toMatchObject({
			status: "incomplete",
			completedUpdates: 0,
		});
		const resumed = run(true);
		expect(resumed.status, resumed.stderr).toBe(2);
		expect(resumed.stdout).toBe(first.stdout);
		const path = join(output, "update-1-plus-block-0-team-0.json");
		const saved = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(path, JSON.stringify({ ...saved, aWin: 1 }));
		const corrupted = run(true);
		expect(corrupted.status).not.toBe(0);
		expect(corrupted.stderr).toContain("invalid retained match");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);

it("retains the configured opening-score scenario in incomplete optimizer legs", () => {
	const root = mkdtempSync(join(tmpdir(), "modern-scenario-optimize-test-"));
	try {
		const config = {
			version: 1,
			seed: 100,
			split: 1,
			updates: 1,
			blocks: 1,
			radius: 2,
			objective: "hand-score",
			initialTeamScores: [5000],
			schedule: { step: 0.2, perturbation: 0.5, stability: 1 },
			maxHands: 1,
			maxActionsPerHand: 1,
			simulations: 1,
			timeMs: 1000,
			depth: 1,
			opponents: [null],
		};
		const configPath = join(root, "config.json"),
			output = join(root, "output");
		writeFileSync(configPath, JSON.stringify(config));
		const result = spawnSync(
			process.execPath,
			["--import", "tsx", "scripts/modern-optimize.ts", configPath, output],
			{ encoding: "utf8", timeout: 30000 },
		);
		expect(result.status, result.stderr).toBe(2);
		const leg = JSON.parse(
			readFileSync(join(output, "update-1-plus-block-0-team-0.json"), "utf8"),
		);
		expect(leg.plan.initialTeamScore).toBe(5000);
		expect(leg.scores).toEqual([5000, 5000]);
		expect(leg.reason).toBe("action cap");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
