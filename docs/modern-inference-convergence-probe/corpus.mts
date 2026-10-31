import { readFileSync } from "node:fs";
import { inferCards } from "../../src/bot/card-knowledge";
import {
	modernActionKey,
	modernSearchActions,
} from "../../src/bot/modern-actions";
import { buildDecks } from "../../src/canasta/cards";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import { modernStartMatch } from "../../src/canasta/modern-match";
import { modernViewFor } from "../../src/canasta/modern-view";
import { cardFace } from "../../src/game/canasta-history";
import {
	type ModernPublicHistory,
	recordModernTransfer,
} from "../../src/game/modern-history";

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
const deck = buildDecks();
const faces = deck.map(cardFace);
const threes = deck.filter((card) => card.rank === "3").map(cardFace);
const corpus = [];
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
	let history: ModernPublicHistory | undefined;
	const indices = new Set(
		Array.from({ length: 8 }, (_, i) =>
			Math.floor(((group.length - 1) * i) / 7),
		),
	);
	if (indices.size !== 8) throw new Error("hand too short");
	for (const row of group) {
		if (hand.phase !== row.phase || hand.outcome !== null)
			throw new Error(`phase mismatch ${seed}:${row.decision}`);
		if (indices.has(row.decision)) {
			const seat = hand.turn;
			const view = modernViewFor(hand, seat);
			const exposed = [
				...view.pile,
				...view.teams.flatMap((team) => [
					...team.threes,
					...team.melds.flatMap((meld) => meld.cards),
				]),
			];
			const input = {
				deck: faces,
				observer: seat,
				own: view.hand.map(cardFace),
				publicCards: exposed.map(cardFace),
				counts: [...view.handCounts, ...view.bonusCounts],
				history,
				excludedByPlayer: [threes, threes, threes, threes, [], [], [], []],
			};
			inferCards(input);
			corpus.push({ seed, score, decision: row.decision, input });
		}
		const action = modernSearchActions(hand).find(
			(candidate) => modernActionKey(hand, candidate) === row.baselineAction,
		);
		if (!action) throw new Error(`missing action ${seed}:${row.decision}`);
		const applied = modernApplyAction(hand, hand.turn, action);
		if (!applied.ok) throw new Error(applied.reason);
		history = recordModernTransfer(history, hand, applied.hand);
		hand = applied.hand;
	}
	if (hand.outcome === null) throw new Error("unfinished hand");
}
if (corpus.length !== 120) throw new Error("corpus incomplete");
process.stdout.write(`${JSON.stringify(corpus)}\n`);
