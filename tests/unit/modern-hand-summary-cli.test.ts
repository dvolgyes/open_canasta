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

it("summarizes only valid, paired, finished one-hand scenarios", () => {
	const root = mkdtempSync(join(tmpdir(), "modern-hand-summary-"));
	try {
		const input = {
			version: 1,
			seed: 18,
			split: 1,
			pairs: 1,
			maxHands: 1,
			maxActionsPerHand: 10,
			simulations: 2,
			timeMs: 1000,
			depth: 3,
			aDepth: 8,
			bDepth: 3,
			initialTeamScore: 5000,
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
			status: "incomplete",
			reason: "scenario hand",
			aWin: null,
			scores: team === 0 ? [9000, 5000] : [5000, 9000],
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
					"scripts/modern-hand-summary.ts",
					configPath,
					output,
				],
				{ encoding: "utf8", timeout: 30000 },
			);
		const complete = run();
		expect(complete.status, complete.stderr).toBe(0);
		expect(JSON.parse(complete.stdout)).toMatchObject({
			eligible: true,
			handWins: 2,
			handLosses: 0,
			incompleteHands: 0,
		});
		const secondPath = join(output, "pair-0-team-1.json");
		writeFileSync(
			secondPath,
			JSON.stringify({ ...leg(1), reason: "action cap" }),
		);
		const incomplete = run();
		expect(incomplete.status).toBe(2);
		expect(JSON.parse(incomplete.stdout)).toMatchObject({
			eligible: false,
			incompleteHands: 1,
		});
		writeFileSync(
			secondPath,
			JSON.stringify({ ...leg(1), simulations: 1, deadlineStops: 1 }),
		);
		const missedBudget = run();
		expect(missedBudget.status).toBe(2);
		expect(JSON.parse(missedBudget.stdout)).toMatchObject({
			eligible: false,
			deadlineStops: 1,
		});
		rmSync(secondPath);
		const unpaired = run();
		expect(unpaired.status).toBe(2);
		expect(JSON.parse(unpaired.stdout)).toMatchObject({
			eligible: false,
			unpairedLegs: 1,
		});
		writeFileSync(secondPath, JSON.stringify({ ...leg(1), simulations: 3 }));
		const corrupted = run();
		expect(corrupted.status).not.toBe(0);
		expect(corrupted.stderr).toContain("invalid retained match");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
