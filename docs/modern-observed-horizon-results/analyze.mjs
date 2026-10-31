import { readFileSync } from "node:fs";

const source = "docs/modern-band-sensitivity-results/results.jsonl";
const rows = readFileSync(source, "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
const hands = new Map();
for (const row of rows) {
	const key = `${row.score}:${row.seed}`;
	const hand = hands.get(key) ?? [];
	if (
		row.decision !== hand.length ||
		(row.phase !== "draw" && row.phase !== "play") ||
		typeof row.baselineAction !== "string"
	)
		throw new Error(`invalid trajectory at ${key}:${row.decision}`);
	hand.push(row);
	hands.set(key, hand);
}
if (hands.size !== 15 || rows.length !== 1260)
	throw new Error("unexpected trajectory sample");

const counts = () => ({ positions: 0, nextPlayerAt3: 0, nextPlayerAt8: 0 });
const result = { overall: counts(), draw: counts(), play: counts() };
for (const hand of hands.values()) {
	for (let index = 0; index + 8 <= hand.length; index++) {
		const row = hand[index];
		const discard = hand
			.slice(index, index + 7)
			.findIndex((step) => step.baselineAction.startsWith("discard:"));
		for (const group of [result.overall, result[row.phase]]) {
			group.positions++;
			if (discard >= 0 && discard < 2) group.nextPlayerAt3++;
			if (discard >= 0) group.nextPlayerAt8++;
		}
	}
}
process.stdout.write(
	`${JSON.stringify({ source, hands: hands.size, ...result })}\n`,
);
