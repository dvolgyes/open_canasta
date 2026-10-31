import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { MODERN_PRIOR_WEIGHTS } from "../../src/bot/modern-prior";

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
			a: MODERN_PRIOR_WEIGHTS,
			b: null,
			aPriorWeight: 0,
			bPriorWeight: 10,
			aSevenBlockedV1Weight: 7,
			initialTeamScore: 5000,
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
			scenarioLegs: 2,
			winRate: null,
		});
		const resumed = run(true);
		expect(resumed.status, resumed.stderr).toBe(2);
		expect(resumed.stdout).toBe(first.stdout);
		const lock = join(output, "run.lock");
		writeFileSync(lock, "existing lock");
		const locked = run(true);
		expect(locked.status).not.toBe(0);
		expect(readFileSync(lock, "utf8")).toBe("existing lock");
		rmSync(lock);
		const manifest = join(output, "manifest.json");
		const validManifest = readFileSync(manifest, "utf8");
		expect(
			JSON.parse(validManifest).identity.config.aSevenBlockedV1Weight,
		).toBe(7);
		writeFileSync(manifest, "null");
		const invalidManifest = run(true);
		expect(invalidManifest.status).not.toBe(0);
		expect(invalidManifest.stderr).toContain(
			"resume requires the identical configuration",
		);
		writeFileSync(manifest, validManifest);
		writeFileSync(configPath, JSON.stringify({ ...config, aPriorWeight: 1 }));
		const changedStrength = run(true);
		expect(changedStrength.status).not.toBe(0);
		expect(changedStrength.stderr).toContain(
			"resume requires the identical configuration",
		);
		writeFileSync(
			configPath,
			JSON.stringify({ ...config, aSevenBlockedV1Weight: 8 }),
		);
		const changedSevenWeight = run(true);
		expect(changedSevenWeight.status).not.toBe(0);
		expect(changedSevenWeight.stderr).toContain(
			"resume requires the identical configuration",
		);
		writeFileSync(
			configPath,
			JSON.stringify({ ...config, seed: config.seed + 1 }),
		);
		const changed = run(true);
		expect(changed.status).not.toBe(0);
		expect(changed.stderr).toContain(
			"resume requires the identical configuration",
		);
		writeFileSync(configPath, JSON.stringify(config));
		const path = join(output, "pair-0-team-0.json");
		const saved = JSON.parse(readFileSync(path, "utf8"));
		expect(saved.plan.initialTeamScore).toBe(5000);
		expect(saved.scores).toEqual([5000, 5000]);
		writeFileSync(path, JSON.stringify({ ...saved, aWin: 1 }));
		const corrupted = run(true);
		expect(corrupted.status).not.toBe(0);
		expect(corrupted.stderr).toContain("invalid retained match");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
