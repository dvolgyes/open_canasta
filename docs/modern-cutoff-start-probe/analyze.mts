import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { evaluateModern } from "../../src/bot/modern-search";
import { validModernResult } from "../../src/bot/research/modern-evidence";
import {
	modernStudyPlan,
	parseModernStudyConfig,
} from "../../src/bot/research/modern-study";
import { modernStartMatch } from "../../src/canasta/modern-match";
import { modernScoreHand } from "../../src/canasta/modern-special-scoring";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const parse = (input: unknown) => {
	const result = parseModernStudyConfig(input);
	if (!result.ok) throw new Error(result.reason);
	return result.config;
};
const empty = () => ({
	hands: 0,
	agrees: 0,
	disagrees: 0,
	cutoffTies: 0,
	finalTies: 0,
});
const totals = {
	overall: empty(),
	earlierPilot: empty(),
	earlierReplication: empty(),
	depthPilot: empty(),
};
const pairs = new Map<number, Set<number>>();
const check = (
	result: unknown,
	expected: ReturnType<typeof modernStudyPlan>,
	budgets: number | { a: number; b: number },
	group: keyof typeof totals,
) => {
	if (!validModernResult(result, expected, budgets))
		throw new Error("invalid retained result");
	if (
		result.hands !== 1 ||
		!["hand cap", "scenario hand"].includes(result.reason) ||
		result.deadlineStops !== 0
	)
		throw new Error("unfinished hand or missed budget");
	const sides = pairs.get(expected.seed) ?? new Set<number>();
	if (sides.has(expected.aTeam)) throw new Error("duplicate side for a deal");
	sides.add(expected.aTeam);
	pairs.set(expected.seed, sides);
	const started = modernStartMatch(expected.seed, expected.dealer);
	if (!started.ok) throw new Error(started.reason);
	if (expected.initialTeamScore === undefined)
		throw new Error("missing symmetric start score");
	const teamScores = [
		expected.initialTeamScore,
		expected.initialTeamScore,
	] as const;
	const hand = {
		...started.match.hand,
		teamScores,
		turnStart: { ...started.match.hand.turnStart, teamScores },
	};
	const value = evaluateModern(hand)[0];
	const raw = modernScoreHand(hand);
	if (
		value === undefined ||
		!raw ||
		Math.sign(value - 0.5) !== Math.sign(raw[0].total - raw[1].total)
	)
		throw new Error("cutoff and direct scores disagree");
	const predicted = Math.sign(value - 0.5);
	const final = Math.sign(result.scores[0] - result.scores[1]);
	for (const item of [totals.overall, totals[group]]) {
		item.hands++;
		if (predicted === 0) item.cutoffTies++;
		else if (final === 0) item.finalTies++;
		else if (predicted === final) item.agrees++;
		else item.disagrees++;
	}
};

const base = read("docs/modern-band-vs-handcrafted-screen.json");
for (const [name, path, seed, split] of [
	[
		"earlierPilot",
		"docs/modern-iteration-balanced-hand-results/results.jsonl",
		base.seed,
		26,
	],
	[
		"earlierReplication",
		"docs/modern-eight-vs-two-replication-results/results.jsonl.gz",
		10913,
		0,
	],
] as const) {
	const data = path.endsWith(".gz")
		? gunzipSync(readFileSync(path)).toString("utf8")
		: readFileSync(path, "utf8");
	const rows = data
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	if (rows.length !== 24) throw new Error(`unexpected ${name} sample`);
	for (const row of rows) {
		if (
			!Number.isInteger(row.pair) ||
			row.pair < 0 ||
			row.pair >= 12 ||
			![0, 1].includes(row.side)
		)
			throw new Error("invalid retained index");
		const config = parse({
			...base,
			seed,
			split,
			pairs: 12,
			maxHands: 1,
			initialTeamScore: [0, 3000, 5000][Math.floor(row.pair / 4)],
		});
		const adapted = {
			...row.result,
			elapsedMs: 0,
			policyStats: {
				a: {
					decisions: row.counts.a.decisions,
					simulations: row.counts.a.simulations,
					deadlineStops: row.counts.a.misses,
				},
				b: {
					decisions: row.counts.b.decisions,
					simulations: row.counts.b.simulations,
					deadlineStops: row.counts.b.misses,
				},
			},
		};
		check(
			adapted,
			modernStudyPlan(config, row.pair, row.side),
			{ a: 8, b: 2 },
			name,
		);
	}
}
for (const score of [0, 3000, 5000]) {
	const config = parse(
		read(`docs/modern-depth-pilot-configs/score-${score}.json`),
	);
	for (let pair = 0; pair < config.pairs; pair++)
		for (const side of [0, 1] as const) {
			const result = read(
				`docs/modern-depth-pilot-results/score-${score}/pair-${pair}-team-${side}.json`,
			);
			check(result, modernStudyPlan(config, pair, side), 8, "depthPilot");
		}
}
if (
	pairs.size !== 36 ||
	[...pairs.values()].some((sides) => sides.size !== 2) ||
	totals.overall.hands !== 72
)
	throw new Error("unexpected paired-deal sample");
process.stdout.write(`${JSON.stringify({ deals: pairs.size, ...totals })}\n`);
