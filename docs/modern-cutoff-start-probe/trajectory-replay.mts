/** Face-key replay is not proof of the original physical-card choices or final scores. */
import { readFileSync } from "node:fs";
import {
	modernActionKey,
	modernSearchActions,
} from "../../src/bot/modern-actions";
import { evaluateModern } from "../../src/bot/modern-search";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import { modernStartMatch } from "../../src/canasta/modern-match";
import { modernScoreHand } from "../../src/canasta/modern-special-scoring";

const rows = readFileSync(
	"docs/modern-band-sensitivity-results/results.jsonl",
	"utf8",
)
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
const groups = new Map<string, typeof rows>();
for (const row of rows) {
	const key = `${row.score}:${row.seed}`;
	const group = groups.get(key) ?? [];
	if (row.decision !== group.length)
		throw new Error(`invalid trajectory ${key}`);
	group.push(row);
	groups.set(key, group);
}
if (groups.size !== 15 || rows.length !== 1260)
	throw new Error("unexpected source");
const bucket = () => ({ positions: 0, ties: 0, agrees: 0, disagrees: 0 });
const totals = {
	overall: bucket(),
	early: bucket(),
	middle: bucket(),
	late: bucket(),
};
const perHand = [];
for (const group of groups.values()) {
	const { seed, score } = group[0];
	const started = modernStartMatch(seed, (seed - 5137) % 4);
	if (!started.ok) throw new Error(started.reason);
	const teamScores = [score, score] as const;
	let hand = {
		...started.match.hand,
		teamScores,
		turnStart: { ...started.match.hand.turnStart, teamScores },
	};
	const ranks: number[] = [];
	for (const row of group) {
		if (hand.phase !== row.phase || hand.outcome !== null)
			throw new Error(`phase mismatch ${seed}:${row.decision}`);
		const value = evaluateModern(hand)[0];
		if (value === undefined) throw new Error("missing value");
		const current = modernScoreHand(hand);
		if (
			!current ||
			Math.sign(value - 0.5) !== Math.sign(current[0].total - current[1].total)
		)
			throw new Error(`score mismatch ${seed}:${row.decision}`);
		ranks.push(Math.sign(value - 0.5));
		const action = modernSearchActions(hand).find(
			(candidate) => modernActionKey(hand, candidate) === row.baselineAction,
		);
		if (!action)
			throw new Error(
				`missing action ${seed}:${row.decision}:${row.baselineAction}`,
			);
		const applied = modernApplyAction(hand, hand.turn, action);
		if (!applied.ok) throw new Error(applied.reason);
		hand = applied.hand;
	}
	if (hand.outcome === null)
		throw new Error(`unfinished hand ${seed}:${score}`);
	const final = modernScoreHand(hand);
	if (!final) throw new Error("invalid final score");
	const winner = Math.sign(final[0].total - final[1].total);
	if (!winner) throw new Error("tied final hand");
	const early = bucket();
	for (let i = 0; i < ranks.length; i++) {
		const stage =
			i / ranks.length < 1 / 3
				? totals.early
				: i / ranks.length < 2 / 3
					? totals.middle
					: totals.late;
		for (const item of [
			totals.overall,
			stage,
			...(i / ranks.length < 1 / 3 ? [early] : []),
		]) {
			item.positions++;
			if (ranks[i] === 0) item.ties++;
			else if (ranks[i] === winner) item.agrees++;
			else item.disagrees++;
		}
	}
	perHand.push({ seed, score, early });
}
process.stdout.write(
	`${JSON.stringify({ hands: groups.size, ...totals, perHand })}\n`,
);
