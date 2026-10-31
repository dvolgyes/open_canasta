import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("stops and resumes without advancing past incomplete grid evidence", () => {
	const repository = process.cwd();
	const root = mkdtempSync(join(repository, ".modern-grid-test-"));
	try {
		for (const name of [
			"src",
			"scripts",
			"node_modules",
			"package.json",
			"package-lock.json",
			"tsconfig.json",
		])
			symlinkSync(join(repository, name), join(root, name));
		const configs = join(root, "docs", "modern-meld-grid-configs");
		mkdirSync(configs, { recursive: true });
		const config = JSON.parse(
			readFileSync("docs/modern-meld-grid-configs/neg12-0.json", "utf8"),
		);
		writeFileSync(
			join(configs, "neg12-0.json"),
			JSON.stringify({ ...config, pairs: 1, maxActionsPerHand: 1 }),
		);
		const run = () =>
			spawnSync("sh", [join(repository, "docs/modern-meld-grid-runner.sh")], {
				cwd: root,
				encoding: "utf8",
				timeout: 30000,
				env: { ...process.env, MODERN_MELD_LOG_DIR: join(root, "logs") },
			});
		const first = run();
		expect(first.status, first.stderr).toBe(2);
		const output = join(root, "docs", "modern-meld-grid-results", "neg12-0");
		const summary = JSON.parse(
			readFileSync(join(output, "hand-summary.json"), "utf8"),
		);
		expect(summary).toMatchObject({ eligible: false, incompleteHands: 2 });
		expect(
			existsSync(join(root, "docs", "modern-meld-grid-results", "neg12-3000")),
		).toBe(false);
		const replay = run();
		expect(replay.status, replay.stderr).toBe(2);
		expect(
			JSON.parse(readFileSync(join(output, "hand-summary.json"), "utf8")),
		).toEqual(summary);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60000);
