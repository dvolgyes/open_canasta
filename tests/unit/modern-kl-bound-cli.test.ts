import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openModernStore } from "../../scripts/modern-store";
import type { ModernMatchResult } from "../../src/bot/research/modern-arena";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../../src/bot/research/modern-study";

it("reports the paired bound only for complete, valid study evidence", () => {
	const root = mkdtempSync(join(tmpdir(), "modern-kl-test-"));
	try {
		const input = {
			version: 1,
			seed: 17,
			split: 1,
			pairs: 1,
			maxHands: 10,
			maxActionsPerHand: 10,
			simulations: 2,
			timeMs: 1000,
			depth: 1,
			a: null,
			b: null,
		};
		const parsed = parseModernStudyConfig(input);
		if (!parsed.ok) throw new Error(parsed.reason);
		const configPath = join(root, "config.json");
		const output = join(root, "output");
		writeFileSync(configPath, JSON.stringify(input));
		const store = openModernStore(output, false, parsed.config, [
			"scripts/modern-study.ts",
		]);
		const leg = (team: 0 | 1): ModernMatchResult => ({
			plan: modernStudyPlan(parsed.config, 0, team),
			status: "complete",
			aWin: 1,
			scores: team === 0 ? [8500, 0] : [0, 8500],
			hands: 1,
			actions: 1,
			simulations: 2,
			resets: 0,
			deadlineStops: 0,
			elapsedMs: 1,
		});
		store.write("pair-0-team-0.json", leg(0));
		store.write("pair-0-team-1.json", leg(1));
		store.close();
		const run = () =>
			spawnSync(
				process.execPath,
				[
					"--import",
					"tsx",
					"scripts/modern-kl-bound.ts",
					configPath,
					output,
					"0.025",
				],
				{ encoding: "utf8", timeout: 30000 },
			);
		const complete = run();
		expect(complete.status, complete.stderr).toBe(0);
		expect(JSON.parse(complete.stdout).lowerBound).toBeCloseTo(0.025);
		expect(JSON.parse(complete.stdout)).toMatchObject({
			dealerImbalance: 0.75,
			uniformDealerLowerBound: 0,
		});
		const path = join(output, "pair-0-team-1.json");
		writeFileSync(
			path,
			JSON.stringify({
				...leg(1),
				status: "incomplete",
				reason: "hand cap",
				aWin: null,
			}),
		);
		const incomplete = run();
		expect(incomplete.status, incomplete.stderr).toBe(0);
		expect(JSON.parse(incomplete.stdout)).toMatchObject({
			eligible: false,
			lowerBound: null,
		});
		writeFileSync(path, JSON.stringify({ ...leg(1), aWin: 0 }));
		const corrupted = run();
		expect(corrupted.status).not.toBe(0);
		expect(corrupted.stderr).toContain("invalid retained match");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
