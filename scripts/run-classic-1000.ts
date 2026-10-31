/** The declared 1000-match local study. This driver never reads credentials or calls an LLM. */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { REFERENCE_PRIOR, validPriorWeights } from "../src/bot/canasta-prior";
import { parseStudyConfig } from "../src/bot/research/config";

const [output, resume, ...extra] = process.argv.slice(2);
if (!output || extra.length || (resume !== undefined && resume !== "--resume"))
	throw new Error(
		"usage: node --import tsx scripts/run-classic-1000.ts OUTPUT_DIRECTORY [--resume]",
	);
const root = resolve(output);
if (!resume) mkdirSync(root);
const trainingPath = "docs/classic-1000-training.json";
const parsed = parseStudyConfig(JSON.parse(readFileSync(trainingPath, "utf8")));
if (!parsed.ok || parsed.config.mode !== "train")
	throw new Error("invalid training configuration");
const config = parsed.config;
if (
	config.campaign.updates * config.campaign.trainingPairs * 4 +
		Math.ceil(config.campaign.updates / config.campaign.checkpointEvery) *
			config.campaign.evaluationPairs *
			6 !==
	880
)
	throw new Error("training and promotion must schedule exactly 880 matches");

function run(path: string, name: string): void {
	const out = join(root, name);
	execFileSync(
		process.execPath,
		[
			"--import",
			"tsx",
			"scripts/canasta-study.ts",
			path,
			out,
			...(resume && existsSync(out) ? ["--resume"] : []),
		],
		{ stdio: ["ignore", "inherit", "inherit"] },
	);
}
run(trainingPath, "training");
const summary = JSON.parse(
	readFileSync(join(root, "training", "summary.json"), "utf8"),
);
if (!validPriorWeights(summary.candidate))
	throw new Error("invalid trained candidate");
for (const label of ["candidate", "reference"] as const) {
	const evaluation = {
		version: 1,
		mode: "evaluate",
		parallel: true,
		parallelPairs: 4,
		maxWallMs: 86400000,
		seed: config.campaign.seed,
		pairs: 30,
		alpha: 0.025,
		split: "validation",
		budget: config.campaign.budget,
		maxHands: config.campaign.maxHands,
		maxActionsPerHand: config.campaign.maxActionsPerHand,
		candidate: label === "candidate" ? summary.candidate : REFERENCE_PRIOR,
		opponent: { kind: "mcts", weights: null },
	};
	const path = join(root, `${label}-zero-config.json`);
	const text = `${JSON.stringify(evaluation, null, "\t")}\n`;
	if (existsSync(path)) {
		if (readFileSync(path, "utf8") !== text)
			throw new Error("zero-prior configuration changed");
	} else writeFileSync(path, text, { flag: "wx" });
	run(path, `${label}-zero`);
}
const legs = ["training", "candidate-zero", "reference-zero"].flatMap((name) =>
	readdirSync(join(root, name))
		.filter((file) => /^(train|promotion|evaluation)-.*\.json$/.test(file))
		.map((file) => JSON.parse(readFileSync(join(root, name, file), "utf8"))),
);
if (
	legs.length !== 1000 ||
	legs.some(
		(leg) =>
			leg.result.status !== "complete" ||
			leg.task.a.kind !== "mcts" ||
			leg.task.b.kind !== "mcts",
	)
)
	throw new Error("the 1000-match MCTS prerequisite has not been met");
writeFileSync(
	join(root, "local-complete.json"),
	`${JSON.stringify(
		{
			completedAt: new Date().toISOString(),
			matches: legs.length,
			promotions: summary.promotions,
			candidate: summary.candidate,
			champion: summary.champion,
			zeroPrior: Object.fromEntries(
				["candidate", "reference"].map((label) => [
					label,
					JSON.parse(
						readFileSync(join(root, `${label}-zero`, "summary.json"), "utf8"),
					),
				]),
			),
		},
		null,
		"\t",
	)}\n`,
);
