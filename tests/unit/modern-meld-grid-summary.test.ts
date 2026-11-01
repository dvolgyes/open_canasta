import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openModernStore } from "../../scripts/modern-store";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../../src/bot/research/modern-study";

it("selects from complete paired grid evidence and rejects corrupted legs", () => {
	const root = mkdtempSync(join(tmpdir(), "modern-meld-grid-"));
	try {
		for (const weight of [-12, -4, 0, 4, 8, 16])
			for (const score of [0, 3000, 5000]) {
				const label = `${weight < 0 ? `neg${-weight}` : `pos${weight}`}-${score}`;
				const parsed = parseModernStudyConfig(
					JSON.parse(
						readFileSync(`docs/modern-meld-grid-configs/${label}.json`, "utf8"),
					),
				);
				if (!parsed.ok) throw new Error(parsed.reason);
				const store = openModernStore(join(root, label), false, parsed.config, [
					"scripts/modern-study.ts",
				]);
				for (let index = 0; index < 8; index++)
					for (const side of [0, 1] as const) {
						const wins = weight === 8 ? 12 : weight === 4 ? 10 : 8;
						const aWins = 2 * index + side < wins;
						const aScore = score + (aWins ? 100 : 0);
						const bScore = score + (aWins ? 0 : 100);
						store.write(`pair-${index}-team-${side}.json`, {
							plan: modernStudyPlan(parsed.config, index, side),
							status: "incomplete",
							reason: "hand cap",
							aWin: null,
							scores: side === 0 ? [aScore, bScore] : [bScore, aScore],
							hands: 1,
							actions: 1,
							simulations: 2,
							resets: 0,
							deadlineStops: 0,
							elapsedMs: 1,
						});
					}
				store.close();
			}
		const run = () =>
			spawnSync(
				process.execPath,
				["--import", "tsx", "docs/modern-meld-grid-summarize.mts", root],
				{ encoding: "utf8", timeout: 30000 },
			);
		const complete = run();
		expect(complete.status, complete.stderr).toBe(0);
		expect(JSON.parse(complete.stdout)).toMatchObject({
			status: "complete",
			selectedWeight: 8,
			predictionMet: true,
		});
		const path = join(root, "pos8-0", "pair-0-team-0.json");
		const original = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(path, JSON.stringify({ ...original, simulations: 3 }));
		const corrupted = run();
		expect(corrupted.status).not.toBe(0);
		expect(corrupted.stderr).toContain("invalid retained hand");
		writeFileSync(path, JSON.stringify(original));
		for (const score of [0, 3000, 5000])
			for (const side of [0, 1]) {
				const target = join(root, `pos8-${score}`, `pair-5-team-${side}.json`);
				const leg = JSON.parse(readFileSync(target, "utf8"));
				writeFileSync(
					target,
					JSON.stringify({
						...leg,
						scores: side === 0 ? [score, score + 100] : [score + 100, score],
					}),
				);
			}
		const tie = run();
		expect(tie.status, tie.stderr).toBe(0);
		expect(JSON.parse(tie.stdout)).toMatchObject({
			selectedWeight: 4,
			predictionMet: false,
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
