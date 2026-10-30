import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("runs paired TypeScript workers, retains unfinished legs and rejects incompatible or corrupted resume data", () => {
	const root = mkdtempSync(join(tmpdir(), "canasta-study-test-"));
	try {
		const config = {
			...JSON.parse(readFileSync("docs/classic-capacity-pilot.json", "utf8")),
			maxActionsPerHand: 1,
			maxWallMs: 10000,
		};
		const path = join(root, "config.json"),
			out = join(root, "results");
		writeFileSync(path, JSON.stringify(config));
		const run = (resume = false) =>
			spawnSync(
				process.execPath,
				[
					"--import",
					"tsx",
					"scripts/canasta-study.ts",
					path,
					out,
					...(resume ? ["--resume"] : []),
				],
				{ encoding: "utf8", timeout: 20000 },
			);
		const first = run();
		expect(first.status, first.stderr).toBe(1);
		expect(first.stdout, first.stderr).not.toBe("");
		expect(JSON.parse(first.stdout)).toMatchObject({
			planned: 1,
			completed: 0,
			lower: 0,
			upper: 1,
		});
		const legs = [0, 1].map((i) =>
			JSON.parse(readFileSync(join(out, `evaluation-0-${i}.json`), "utf8")),
		);
		expect(legs[0].task.plan.seed).toBe(legs[1].task.plan.seed);
		expect(legs.map((l) => l.result.plan.aTeam)).toEqual([0, 1]);
		expect(legs.every((l) => l.result.reason === "action cap")).toBe(true);
		const resumed = run(true);
		expect(resumed.status, resumed.stderr).toBe(1);
		expect(resumed.stdout).toBe(first.stdout);
		expect(resumed.stderr).not.toContain("match evaluation-");
		writeFileSync(
			join(out, "run.lock"),
			JSON.stringify({ pid: 0, host: "test" }),
		);
		expect(run(true).stderr).toContain("run.lock exists");
		rmSync(join(out, "run.lock"));
		writeFileSync(path, JSON.stringify({ ...config, seed: config.seed + 1 }));
		expect(run(true).stderr).toContain("identical configuration");
		writeFileSync(path, JSON.stringify(config));
		writeFileSync(
			join(out, "evaluation-0-0.json"),
			JSON.stringify({
				...legs[0],
				result: {
					...legs[0].result,
					status: "complete",
					aWin: 1,
					scores: [0, 0],
				},
			}),
		);
		expect(run(true).stderr).toContain("invalid cached match");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 20000);
