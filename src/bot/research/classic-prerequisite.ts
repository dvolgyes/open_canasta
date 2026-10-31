/** Verify the local study before loading credentials or constructing a paid opponent. */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validPriorWeights } from "../canasta-prior";
import { studySeed } from "./campaign";

function read(path: string) {
	if (statSync(path).size > 1024 * 1024)
		throw new Error("study record exceeds 1 MiB");
	return JSON.parse(readFileSync(path, "utf8"));
}

export function verifyClassic1000(root: string) {
	const complete = read(join(root, "local-complete.json"));
	if (
		complete.matches !== 1000 ||
		!validPriorWeights(complete.champion) ||
		!validPriorWeights(complete.candidate)
	)
		throw new Error(
			"1000 completed MCTS matches are required before LLM testing",
		);
	const hash = createHash("sha256");
	let source = "",
		commit = "",
		count = 0;
	const expected: {
		stage: string;
		id: string;
		split: number;
		index: number;
	}[] = [];
	for (let update = 1; update <= 70; update++)
		for (const label of ["plus", "minus"])
			expected.push({
				stage: "training",
				id: `train-${update}-${label}-0`,
				split: 0,
				index: update - 1,
			});
	for (let block = 0; block < 100; block++)
		for (const label of ["incumbent", "candidate-anchor", "champion-anchor"])
			expected.push({
				stage: "training",
				id: `promotion-70-${label}-${block}`,
				split: label === "incumbent" ? 1 : 2,
				index: block,
			});
	for (const stage of ["candidate-zero", "reference-zero"])
		for (let block = 0; block < 30; block++)
			expected.push({
				stage,
				id: `evaluation-${block}`,
				split: 3,
				index: block,
			});
	const seed = 1779033703;
	for (const stage of ["training", "candidate-zero", "reference-zero"]) {
		const manifest = read(join(root, stage, "manifest.json"));
		const fingerprint = manifest.identity?.sourceSha256;
		if (
			typeof fingerprint !== "string" ||
			!/^[a-f0-9]{64}$/.test(fingerprint) ||
			typeof manifest.commit !== "string" ||
			!/^[a-f0-9]{40}$/.test(manifest.commit) ||
			(source && (source !== fingerprint || commit !== manifest.commit))
		)
			throw new Error("local study source revisions do not match");
		source = fingerprint;
		commit = manifest.commit;
		const jobs = expected.filter((job) => job.stage === stage);
		const names = readdirSync(join(root, stage)).filter((name) =>
			/^(train|promotion|evaluation)-.*\.json$/.test(name),
		);
		if (names.length !== jobs.length * 2)
			throw new Error("local study match count mismatch");
		for (const job of jobs)
			for (const aTeam of [0, 1]) {
				const name = `${job.id}-${aTeam}.json`,
					path = join(root, stage, name);
				const record = read(path),
					task = record.task,
					result = record.result;
				if (
					!task ||
					!result ||
					!task.plan ||
					task.plan.seed !== studySeed(seed, job.split, job.index) ||
					task.plan.policySeed !== studySeed(seed, job.split + 32, job.index) ||
					task.plan.dealer !== job.index % 4 ||
					task.plan.aTeam !== aTeam ||
					JSON.stringify(task.plan) !== JSON.stringify(result.plan) ||
					result.status !== "complete" ||
					![0, 1].includes(result.aWin) ||
					!Array.isArray(result.scores) ||
					result.scores.length !== 2 ||
					!result.scores.every(Number.isFinite) ||
					Math.max(...result.scores) < 5000 ||
					result.scores[0] === result.scores[1] ||
					result.aWin !==
						Number((result.scores[0] > result.scores[1] ? 0 : 1) === aTeam) ||
					!Number.isSafeInteger(result.actions) ||
					result.actions < 1 ||
					result.simulations !== result.actions * 8 ||
					[task.a, task.b].some(
						(policy) =>
							policy?.kind !== "mcts" ||
							(policy.weights !== null && !validPriorWeights(policy.weights)) ||
							policy.budget?.kind !== "iterations" ||
							policy.budget.iterations !== 8 ||
							policy.budget.depth !== 12 ||
							policy.budget.emergencyTimeMs !== 60000,
					) ||
					(stage !== "training" && task.b.weights !== null)
				)
					throw new Error(`invalid or incomplete MCTS match: ${stage}/${name}`);
				hash.update(`${stage}/${name}`).update(readFileSync(path));
				count++;
			}
	}
	const training = read(join(root, "training", "summary.json"));
	if (
		JSON.stringify(training.champion) !== JSON.stringify(complete.champion) ||
		JSON.stringify(training.candidate) !== JSON.stringify(complete.candidate)
	)
		throw new Error("local champion does not match the training result");
	return {
		matches: count,
		champion: complete.champion,
		candidate: complete.candidate,
		sourceSha256: source,
		commit,
		recordsSha256: hash.digest("hex"),
	};
}
