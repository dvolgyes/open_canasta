import { modernPlayableActions } from "../src/bot/modern-actions";
import {
	inferModern,
	observeModern,
	sampleModernPosition,
} from "../src/bot/modern-inference";
import { chooseModernPosition } from "../src/bot/modern-search";
import { buildDecks } from "../src/canasta/cards";
import { modernApplyAction, modernNewHand } from "../src/canasta/modern-hand";
import { mulberry32 } from "../src/canasta/random";

const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
if (!dealt.ok) throw new Error(dealt.reason);
const drawn = modernApplyAction(dealt.hand, 0, { type: "draw" });
if (!drawn.ok) throw new Error(drawn.reason);
const reachable = modernApplyAction(drawn.hand, 0, {
	type: "meld",
	cards: ["0-AC", "0-AS", "1-JK0"],
});
if (!reachable.ok) throw new Error(reachable.reason);
const reachableObservation = observeModern(reachable.hand, 0);
const reachableSample = sampleModernPosition(
	reachableObservation,
	inferModern(reachableObservation.view, 0, reachableObservation.history),
	mulberry32(2),
);
process.stdout.write(
	`${JSON.stringify({
		scenario: "reachable meld",
		observedCanUndo: reachableObservation.canUndo,
		observedCanRetract: reachableObservation.canRetract,
		realUndo: modernApplyAction(reachable.hand, 0, { type: "undo" }).ok,
		sampledUndo: modernApplyAction(reachableSample, 0, { type: "undo" }).ok,
		realRetract: modernApplyAction(reachable.hand, 0, { type: "retract" }).ok,
		sampledRetract: modernApplyAction(reachableSample, 0, { type: "retract" })
			.ok,
	})}\n`,
);
const deck = buildDecks();
const ids = ["0-8C", "0-8D", "0-8H", "0-2S", "0-2H"];
const own = ids.map((id) => {
	const card = deck.find((item) => item.id === id);
	if (!card) throw new Error(`missing card ${id}`);
	return card;
});
const base = {
	...dealt.hand.turnStart,
	phase: "play" as const,
	hands: [own, [], [], []] as const,
	stock: deck.filter((card) => !ids.includes(card.id)),
	teams: [
		{ opened: true, threes: [], melds: [] },
		{ opened: false, threes: [], melds: [] },
	] as const,
};
const initial = { ...base, turnStart: base, undo: [] };
const melded = modernApplyAction(initial, 0, {
	type: "meld",
	cards: ids.slice(0, 3),
});
if (!melded.ok) throw new Error(melded.reason);
const observation = observeModern(melded.hand, 0);
const belief = inferModern(observation.view, 0, observation.history);
const sample = sampleModernPosition(observation, belief, mulberry32(1));
const search = await chooseModernPosition(observation, {
	timeMs: 30000,
	maxIterations: 4,
	maxDepth: 4,
	rng: mulberry32(1),
});
process.stdout.write(
	`${JSON.stringify({
		scenario: "constructed forced retraction",
		observedCanUndo: observation.canUndo,
		observedCanRetract: observation.canRetract,
		realUndo: modernApplyAction(melded.hand, 0, { type: "undo" }).ok,
		sampledUndo: modernApplyAction(sample, 0, { type: "undo" }).ok,
		realActions: modernPlayableActions(melded.hand).map(
			(action) => action.type,
		),
		sampledActions: modernPlayableActions(sample).map((action) => action.type),
		selected: search.action?.type,
		rootChoices: search.choices.length,
		iterations: search.iterations,
	})}\n`,
);
