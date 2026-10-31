import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REFERENCE_PRIOR } from "../../src/bot/canasta-prior";
import { studySeed } from "../../src/bot/research/campaign";
import { verifyClassic1000 } from "../../src/bot/research/classic-prerequisite";

it("requires the complete paired study and rejects missing, failed, non-MCTS, or mismatched records", () => {
	const root = mkdtempSync(join(tmpdir(), "canasta-prerequisite-"));
	const save = (path: string, value: unknown) =>
		writeFileSync(join(root, path), JSON.stringify(value));
	const policy = {
		kind: "mcts",
		weights: REFERENCE_PRIOR,
		budget: {
			kind: "iterations",
			iterations: 8,
			depth: 12,
			emergencyTimeMs: 60000,
		},
	};
	try {
		expect(() => verifyClassic1000(root)).toThrow();
		save("local-complete.json", {
			matches: 1000,
			champion: REFERENCE_PRIOR,
			candidate: REFERENCE_PRIOR,
		});
		for (const stage of ["training", "candidate-zero", "reference-zero"]) {
			mkdirSync(join(root, stage));
			save(`${stage}/manifest.json`, {
				identity: { sourceSha256: "a".repeat(64) },
				commit: "b".repeat(40),
			});
		}
		save("training/summary.json", {
			champion: REFERENCE_PRIOR,
			candidate: REFERENCE_PRIOR,
		});
		expect(() => verifyClassic1000(root)).toThrow(/count/);
		const pair = (stage: string, id: string, split: number, index: number) => {
			for (const aTeam of [0, 1]) {
				const plan = {
					seed: studySeed(1779033703, split, index),
					policySeed: studySeed(1779033703, split + 32, index),
					dealer: index % 4,
					aTeam,
				};
				save(`${stage}/${id}-${aTeam}.json`, {
					task: {
						plan,
						a: policy,
						b: stage === "training" ? policy : { ...policy, weights: null },
					},
					result: {
						plan,
						status: "complete",
						aWin: Number(aTeam === 0),
						scores: [5010, 4500],
						actions: 500,
						simulations: 4000,
					},
				});
			}
		};
		for (let update = 1; update <= 70; update++)
			for (const label of ["plus", "minus"])
				pair("training", `train-${update}-${label}-0`, 0, update - 1);
		for (let block = 0; block < 100; block++)
			for (const label of ["incumbent", "candidate-anchor", "champion-anchor"])
				pair(
					"training",
					`promotion-70-${label}-${block}`,
					label === "incumbent" ? 1 : 2,
					block,
				);
		for (const stage of ["candidate-zero", "reference-zero"])
			for (let block = 0; block < 30; block++)
				pair(stage, `evaluation-${block}`, 3, block);
		expect(verifyClassic1000(root)).toMatchObject({
			matches: 1000,
			champion: REFERENCE_PRIOR,
		});
		const path = "candidate-zero/evaluation-0-0.json";
		const original = JSON.parse(readFileSync(join(root, path), "utf8"));
		for (const record of [
			{ ...original, result: { ...original.result, status: "incomplete" } },
			{ ...original, task: { ...original.task, b: { kind: "llm" } } },
			{ ...original, result: { ...original.result, simulations: 3999 } },
			{ ...original, result: { ...original.result, scores: [40, 50] } },
			{
				...original,
				task: { ...original.task, plan: { ...original.task.plan, seed: 1 } },
			},
		]) {
			save(path, record);
			expect(() => verifyClassic1000(root)).toThrow(/invalid or incomplete/);
		}
		save(path, original);
		save("reference-zero/manifest.json", {
			identity: { sourceSha256: "c".repeat(64) },
			commit: "b".repeat(40),
		});
		expect(() => verifyClassic1000(root)).toThrow(/source revisions/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
