import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const [input, ...extra] = process.argv.slice(2);
if (!input || extra.length)
	throw new Error(
		"usage: node --import tsx scripts/analyze-classic-1000.mjs STUDY_DIRECTORY",
	);
const root = resolve(input);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const { verifyClassic1000 } = await import(
	pathToFileURL(resolve("src/bot/research/classic-prerequisite.ts"))
);
const { boundedEstimate } = await import(
	pathToFileURL(resolve("src/bot/research/statistics.ts"))
);
const { studySeed } = await import(
	pathToFileURL(resolve("src/bot/research/campaign.ts"))
);
const { validRequestRecord } = await import(
	pathToFileURL(resolve("src/bot/research/openrouter.ts"))
);
const { accountedNanodollars } = await import(
	pathToFileURL(resolve("src/bot/research/price-guard.ts"))
);
const verified = verifyClassic1000(root);
const stages = [
	"training",
	"candidate-zero",
	"reference-zero",
	"champion-zero-100",
];
const records = stages.flatMap((stage) =>
	readdirSync(join(root, stage))
		.filter((file) => /^(train|promotion|evaluation)-.*\.json$/.test(file))
		.sort()
		.map((file) => ({ stage, file, ...read(join(root, stage, file)) })),
);
if (
	records.length !== 1100 ||
	records.some(
		(r) =>
			r.result.status !== "complete" ||
			r.result.simulations !== r.result.actions * 8,
	)
)
	throw new Error("1100 complete fixed-budget matches required");
for (const r of records) {
	const s = r.result,
		p = r.task.plan;
	if (
		JSON.stringify(s.plan) !== JSON.stringify(p) ||
		Math.max(...s.scores) < 5000 ||
		s.scores[0] === s.scores[1] ||
		s.aWin !== Number((s.scores[0] > s.scores[1] ? 0 : 1) === p.aTeam)
	)
		throw new Error("invalid match winner");
}
for (const stage of stages) {
	const m = read(join(root, stage, "manifest.json"));
	if (
		m.commit !== verified.commit ||
		m.identity.sourceSha256 !== verified.sourceSha256
	)
		throw new Error("source revision changed");
}
const metrics = (selected) => {
	const pairs = new Map();
	for (const r of selected) {
		const key = r.file.replace(/-[01]\.json$/, "");
		const legs = pairs.get(key) ?? [];
		legs.push(r);
		pairs.set(key, legs);
	}
	for (const legs of pairs.values())
		if (
			legs.length !== 2 ||
			new Set(legs.map((r) => r.task.plan.aTeam)).size !== 2 ||
			legs[0].task.plan.seed !== legs[1].task.plan.seed
		)
			throw new Error("invalid pairing");
	const values = [...pairs.values()].map(
		(legs) => (legs[0].result.aWin + legs[1].result.aWin) / 2,
	);
	const wins = selected.reduce((sum, r) => sum + r.result.aWin, 0),
		losses = selected.length - wins;
	return {
		matches: selected.length,
		pairs: pairs.size,
		wins,
		losses,
		winRate: wins / selected.length,
		winLossRatio: losses ? wins / losses : "Infinity",
		pairedEstimate: boundedEstimate(values, pairs.size, 0.025),
	};
};
const comparisons = {};
for (const label of ["incumbent", "candidate-anchor", "champion-anchor"])
	comparisons[label] = metrics(
		records.filter(
			(r) =>
				r.stage === "training" && r.file.startsWith(`promotion-70-${label}-`),
		),
	);
for (const stage of stages.slice(1))
	comparisons[stage] = metrics(records.filter((r) => r.stage === stage));
const oldSeeds = new Set(
	records
		.filter((r) => r.stage !== "champion-zero-100")
		.map((r) => r.task.plan.seed),
);
const freshSeeds = new Set(
	records
		.filter((r) => r.stage === "champion-zero-100")
		.map((r) => r.task.plan.seed),
);
if (
	freshSeeds.size !== 50 ||
	[...freshSeeds].some((seed) => oldSeeds.has(seed))
)
	throw new Error("extra control seeds are not fresh");
for (const r of records.filter((r) => r.stage === "champion-zero-100")) {
	const match = /^evaluation-(\d+)-([01])\.json$/.exec(r.file);
	if (
		!match ||
		+match[1] >= 50 ||
		r.task.plan.aTeam !== +match[2] ||
		r.task.plan.seed !== studySeed(1779033703, 4, +match[1]) ||
		r.task.a.kind !== "mcts" ||
		r.task.b.kind !== "mcts" ||
		r.task.b.weights !== null ||
		JSON.stringify(r.task.a.weights) !== JSON.stringify(verified.champion) ||
		JSON.stringify(r.task.a.budget) !== JSON.stringify(r.task.b.budget)
	)
		throw new Error("extra control configuration mismatch");
}
const self = records.filter((r) =>
	r.file.startsWith("promotion-70-champion-anchor-"),
);
const selfPairs = new Map();
for (const r of self) {
	const key = r.file.replace(/-[01]\.json$/, "");
	const list = selfPairs.get(key) ?? [];
	list.push(r);
	selfPairs.set(key, list);
}
for (const legs of selfPairs.values()) {
	const a = legs[0].result,
		b = legs[1].result;
	if (
		JSON.stringify(a.scores) !== JSON.stringify(b.scores) ||
		a.actions !== b.actions ||
		a.hands !== b.hands ||
		a.simulations !== b.simulations ||
		a.aWin + b.aWin !== 1
	)
		throw new Error("reference self-play did not replay symmetrically");
}
const checkpoint = read(join(root, "training/checkpoint.json"));
const updates = readFileSync(join(root, "training/events.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line))
	.filter((event) => event.kind === "update");
if (updates.length !== 70) throw new Error("missing optimizer updates");
const trainingSignal = {
	updates: updates.length,
	zeroDifferenceUpdates: updates.filter(
		(event) => event.fitnessPlus === event.fitnessMinus,
	).length,
	distinctTrainingOpponents: new Set(
		records
			.filter(
				(record) =>
					record.stage === "training" && record.file.startsWith("train-"),
			)
			.map((record) => JSON.stringify(record.task.b.weights)),
	).size,
	differenceCounts: {},
};
for (const event of updates) {
	const difference = event.fitnessPlus - event.fitnessMinus;
	trainingSignal.differenceCounts[difference] =
		(trainingSignal.differenceCounts[difference] ?? 0) + 1;
}
const llm = read(join(root, "llm-test/summary.json"));
const llmManifest = existsSync(join(root, "llm-test/manifest.json"))
	? read(join(root, "llm-test/manifest.json"))
	: null;
let accounted = 0,
	reported = 0,
	requests = 0,
	unknown = 0,
	failed = 0,
	exposure = 0;
for (const stage of ["llm-test", "llm-confirmation"]) {
	const dir = join(root, stage);
	if (!existsSync(dir)) continue;
	for (const name of readdirSync(dir).filter((n) =>
		/^request-.*\.json$/.test(n),
	)) {
		const r = read(join(dir, name));
		if (
			!validRequestRecord(r) ||
			name !== `request-${r.id}.json` ||
			!Number.isSafeInteger(r.reservedNanodollars) ||
			r.reservedNanodollars <= 0
		)
			throw new Error("invalid request record");
		requests++;
		reported += r.costUsd ?? 0;
		accounted += accountedNanodollars(r.costUsd ?? 0);
		unknown += Number(r.costUsd === undefined);
		failed += Number(r.status === "failure");
		exposure +=
			r.costUsd === undefined
				? (r.reservedNanodollars ?? 0)
				: accountedNanodollars(r.costUsd);
	}
}
if (exposure > 1e9)
	throw new Error("aggregate spending exceeded the authorization");
const paidAccounting = {
	requests,
	reportedCostUsd: reported,
	accountedCostUsd: accounted / 1e9,
	maximumAccountedExposureUsd: exposure / 1e9,
	unresolvedCosts: unknown,
	failedRequests: failed,
	authorizedUsd: 1,
};
const confirmationPath = join(root, "llm-confirmation/summary.json");
const confirmation = existsSync(confirmationPath)
	? read(confirmationPath)
	: null;
const confirmationDir = join(root, "llm-confirmation");
const confirmationLegs = existsSync(confirmationDir)
	? readdirSync(confirmationDir)
			.filter((n) => /^evaluation-\d+-[01]\.json$/.test(n))
			.map((file) => ({ file, ...read(join(confirmationDir, file)) }))
	: [];
if (
	confirmationLegs.some(
		(r) =>
			r.result.status === "complete" &&
			(r.result.aWin !==
				Number(
					(r.result.scores[0] > r.result.scores[1] ? 0 : 1) ===
						r.task.plan.aTeam,
				) ||
				Math.max(...r.result.scores) < 5000),
	)
)
	throw new Error("invalid confirmation winner");
const confirmationWins = confirmationLegs.reduce(
		(s, r) => s + (r.result.aWin ?? 0),
		0,
	),
	confirmationCompleted = confirmationLegs.filter(
		(r) => r.result.status === "complete",
	).length;
const confirmationReport = {
	status: confirmation?.status ?? (confirmation ? "complete" : "not-started"),
	plannedMatches: 20,
	completedMatches: confirmationCompleted,
	incompleteMatches:
		confirmationLegs.length -
		confirmationCompleted +
		(confirmation?.interruptedMatchIds?.length ?? 0),
	notStartedMatches:
		20 -
		confirmationLegs.length -
		(confirmation?.interruptedMatchIds?.length ?? 0),
	wins: confirmationWins,
	losses: confirmationCompleted - confirmationWins,
	winRate: confirmationCompleted
		? confirmationWins / confirmationCompleted
		: null,
	estimate: confirmation,
	superiorityEstablished:
		confirmation?.completed === 10 && confirmation.lower > 0.5,
};
const files = [];
function walk(dir) {
	for (const name of readdirSync(dir).sort()) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (/\.(json|jsonl)$/.test(name))
			files.push({
				path: path.slice(root.length + 1),
				text: readFileSync(path, "utf8"),
			});
	}
}
walk(root);
const archives = [];
const groups = [
	files.filter((f) => !f.path.startsWith("llm-")),
	files.filter((f) => f.path.startsWith("llm-")),
];
for (let g = 0; g < groups.length; g++) {
	let part = 1;
	const pack = (rows) =>
		gzipSync(
			JSON.stringify({
				format: 1,
				files: rows,
				analysisScript: readFileSync(new URL(import.meta.url), "utf8"),
			}),
		);
	const flush = (batch) => {
		if (!batch.length) return;
		const archive = pack(batch);
		if (archive.length > 450 * 1024 && batch.length > 1) {
			const middle = Math.ceil(batch.length / 2);
			flush(batch.slice(0, middle));
			flush(batch.slice(middle));
			return;
		}
		if (archive.length >= 500 * 1024)
			throw new Error("single archive exceeds file-size limit");
		if (JSON.parse(gunzipSync(archive)).files.length !== batch.length)
			throw new Error("archive verification failed");
		const path = `docs/classic-1000-${g === 0 ? "local" : "llm"}-records-${part++}.json.gz`;
		writeFileSync(path, archive);
		archives.push(path);
	};
	flush(groups[g]);
}
const csv = [
	[
		"stage",
		"record",
		"seed",
		"policy_seed",
		"a_team",
		"a_win",
		"ns_score",
		"ew_score",
		"hands",
		"actions",
		"simulations",
		"resets",
		"elapsed_ms",
	].join(","),
];
for (const r of records) {
	const p = r.task.plan,
		s = r.result;
	csv.push(
		[
			r.stage,
			r.file,
			p.seed,
			p.policySeed,
			p.aTeam,
			s.aWin,
			...s.scores,
			s.hands,
			s.actions,
			s.simulations,
			s.resets,
			s.elapsedMs,
		].join(","),
	);
}
const csvPath = "docs/classic-1000-matches.csv";
writeFileSync(csvPath, `${csv.join("\n")}\n`);
const artifact = (path) => ({
	path,
	sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
	bytes: statSync(path).size,
});
const report = {
	version: 1,
	producingCommit: verified.commit,
	sourceSha256: verified.sourceSha256,
	originalRecordsSha256: verified.recordsSha256,
	originalStudyMatches: 1000,
	additionalChampionControlMatches: 100,
	completedLocalMatches: records.length,
	incompleteLocalMatches: 0,
	totalHands: records.reduce((sum, r) => sum + r.result.hands, 0),
	totalActions: records.reduce((sum, r) => sum + r.result.actions, 0),
	totalSimulations: records.reduce((sum, r) => sum + r.result.simulations, 0),
	totalResets: records.reduce((sum, r) => sum + r.result.resets, 0),
	uniqueDealSeeds: new Set(records.map((r) => r.task.plan.seed)).size,
	additionalControlFreshSeeds: freshSeeds.size,
	referenceSelfplaySymmetricPairs: selfPairs.size,
	promotions: checkpoint.promotions,
	superiority: checkpoint.superiority,
	noninferiority: checkpoint.noninferiority,
	candidate: checkpoint.candidate,
	champion: checkpoint.champion,
	comparisons,
	trainingSignal,
	llm: {
		...llm,
		model: llmManifest?.settings.model ?? null,
		originalCommit: llmManifest?.commit ?? null,
		producingCommit: llm.producingCommit ?? llmManifest?.commit ?? null,
		settings: llmManifest?.settings ?? null,
	},
	paidAccounting,
	llmConfirmation: confirmationReport,
	artifacts: [
		...archives.map(artifact),
		artifact(csvPath),
		artifact("docs/classic-1000-aborted-records.json.gz"),
	],
	limitations: [
		"One optimizer seed; strength is measured only at eight simulations and depth 12.",
		"Zero priors removes tree bias and prior expansion ordering; rollout heuristics remain.",
		"The LLM comparison uses the retained heuristic-filtered menu and is a small diagnostic.",
		"The two stopped source revisions are excluded from the final comparison and preserved separately.",
	],
};
writeFileSync(
	"docs/classic-1000-results.json",
	`${JSON.stringify(report, null, "\t")}\n`,
);
console.log(
	JSON.stringify(
		{
			completedLocalMatches: report.completedLocalMatches,
			comparisons,
			llm: llm.status,
			artifacts: report.artifacts,
		},
		null,
		2,
	),
);
