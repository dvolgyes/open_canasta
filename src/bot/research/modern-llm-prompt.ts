import type { ModernAction } from "../../canasta/modern-hand";
import { cardFace } from "../../game/canasta-history";
import { knownCards } from "../card-knowledge";
import { modernActionKey, modernSearchActions } from "../modern-actions";
import {
	inferModern,
	type ModernObservation,
	sampleModernPosition,
} from "../modern-inference";

/** The model receives only these strings; action objects remain in the trusted closure. */
export interface ModernLlmRequest {
	readonly prompt: string;
	readonly labels: readonly string[];
	select(
		value: unknown,
	):
		| { readonly ok: true; readonly action: ModernAction }
		| { readonly ok: false; readonly reason: string };
}

export type ModernLlmPromptResult =
	| { readonly ok: true; readonly request: ModernLlmRequest }
	| { readonly ok: false; readonly reason: string };

export interface ModernLlmPromptOptions {
	readonly rng: () => number;
	readonly timeMs: number;
	readonly maxChoices?: number;
	readonly maxActionChecks?: number;
	readonly maxPromptChars?: number;
	readonly signal?: AbortSignal;
	readonly now?: () => number;
}

const RULES = [
	"You are playing the provisional canasta-com-modern-v1 rules, in partnerships 0 and 2 versus 1 and 3, to 8500 points.",
	"A hand starts with 13 cards per player; draw one card or take the discard pile with two natural cards matching its top rank.",
	"Threes are exposed and replaced; neither threes nor wild cards may be taken as a pile top.",
	"A meld holds three to seven cards; natural melds need at least two naturals and at most two wild cards, and sevens must be natural.",
	"Opening requires 125 points below 3000, 155 below 5000, otherwise 180, plus a natural triple; cards from the pile do not count.",
	"When an unopened side takes the pile, the top card is melded first and the rest arrives only after the opening is committed.",
	"After opening from a stock draw, a player who does not go out receives up to four bonus cards if the opponents have not opened, otherwise up to three, while leaving eight in stock; they are revealed on that player's next turn.",
	"A mixed canasta cannot be part of the initial meld; after opening, adding wild cards to a natural meld requires at least five naturals.",
	"Aces can become mixed only when initially melded during the opening; a pure ace meld cannot later receive wild cards.",
	"Seven-card melds are canastas and close their rank; going out requires two canastas and no incomplete pure ace, seven, or wild meld.",
	"A completed natural canasta scores 500 and a mixed canasta 300; a pure ace or seven canasta scores 2500, while an incomplete one loses 2500.",
	"An incomplete wild meld loses 2000; a completed wild meld scores 3000 with no jokers, 2500 with four jokers, and 2000 otherwise.",
	"Three or more aces or sevens in one player's hand incur a 1500-point penalty for each such rank.",
	"Red and black threes score separately: 100, 300, 500, or 1000 for one through four of a color; the score is negative with no canasta, zero with one, and positive with two or more.",
	"Card values are 50 for jokers, 20 for aces and twos, 10 for eights through kings, and 5 for fours through sevens.",
	"If a side has no canasta, the face value of its melded cards counts against it; going out adds 100 points.",
	"Threes cannot be discarded; wild cards can be discarded only when forced or going out, and an empty pile cannot receive an ace, seven, wild, or closed rank.",
	"Legal special hands of 14 cards can end a hand after a stock draw before the team opens; their displayed names have fixed scores: natural-pairs 2500, wild-pairs 2000, miami-pairs 2500, garbage 3000, zip-code 2500.",
	"Natural-pairs is seven natural rank pairs; wild-pairs is six natural pairs including aces and sevens plus a pair of twos or jokers; miami-pairs is five natural pairs including aces and sevens plus two twos and two jokers.",
	"Garbage has natural rank groups of 3, 3, 4, and 4; zip-code has rank groups of 2, 2, 3, 3, and 4.",
	"Card labels use C, D, H, S for suits and JK for a joker; a face can occur twice.",
	"Labels use meld:cards, extend:meld-id:cards, take-pile:cards, discard:card, or an action name; undo reverses the latest turn action and retract returns its last melded card when legal.",
	'Reply with JSON in the form {"choice":N}, where N is one listed action index. Actions are atomic, so later melds and the final discard are separate decisions.',
].join("\n");

/** Build an offline prompt and a trusted index-to-action selector; this function performs no network I/O. */
export function modernLlmPrompt(
	observation: ModernObservation,
	options: ModernLlmPromptOptions,
): ModernLlmPromptResult {
	const maxChoices = options.maxChoices ?? 4096;
	const maxActionChecks = options.maxActionChecks ?? 100000;
	const maxPromptChars = options.maxPromptChars ?? 150000;
	if (
		!Number.isFinite(options.timeMs) ||
		options.timeMs < 0 ||
		options.timeMs > 60000 ||
		!Number.isSafeInteger(maxChoices) ||
		maxChoices < 1 ||
		maxChoices > 100000 ||
		!Number.isSafeInteger(maxActionChecks) ||
		maxActionChecks < 1 ||
		maxActionChecks > 1000000 ||
		!Number.isSafeInteger(maxPromptChars) ||
		maxPromptChars < 1 ||
		maxPromptChars > 1000000
	)
		throw new Error("invalid modern prompt limits");
	const { view, seat, history } = observation;
	if (
		view.turn !== seat ||
		view.outcome !== null ||
		observation.turnStart.turn !== seat
	)
		return { ok: false, reason: "not the actor's live turn" };
	if (
		history &&
		(history.events.length > 5000 ||
			history.events.reduce(
				(total, event) => total + event.gained.length + event.removed.length,
				0,
			) > 20000 ||
			history.events.some(
				(event) => event.gained.length > 108 || event.removed.length > 108,
			))
	)
		return { ok: false, reason: "public history exceeds prompt limits" };
	const now = options.now ?? (() => performance.now());
	const started = now();
	const expired = () =>
		options.signal?.aborted === true || now() - started >= options.timeMs;
	if (expired()) return { ok: false, reason: "prompt cancelled or timed out" };
	const belief = inferModern(view, seat, history);
	if (expired()) return { ok: false, reason: "prompt cancelled or timed out" };
	const hand = sampleModernPosition(observation, belief, options.rng);
	let actionChecks = 0;
	let actionLimit = false;
	const actions = modernSearchActions(hand, () => {
		if (++actionChecks > maxActionChecks) {
			actionLimit = true;
			return true;
		}
		return expired();
	});
	if (expired()) return { ok: false, reason: "prompt cancelled or timed out" };
	if (actionLimit)
		return { ok: false, reason: "action generation exceeds work limit" };
	for (const [enabled, action] of [
		[observation.canUndo, { type: "undo" }],
		[observation.canRetract, { type: "retract" }],
	] as const)
		if (enabled && !actions.some((candidate) => candidate.type === action.type))
			actions.push(action);
	if (!actions.length) return { ok: false, reason: "no legal actions" };
	if (actions.length > maxChoices)
		return { ok: false, reason: "legal actions exceed prompt limits" };
	const labels = Object.freeze(
		actions.map((action) => modernActionKey(hand, action)),
	);
	const state = {
		rulesVersion: view.rulesVersion,
		seat,
		partner: (seat + 2) % 4,
		dealer: view.dealer,
		teamScores: view.teamScores,
		phase: view.phase,
		hand: view.hand.map(cardFace),
		handCounts: view.handCounts,
		bonusCounts: view.bonusCounts,
		stockCount: view.stockCount,
		pile: view.pile.map(cardFace),
		teams: view.teams.map((team) => ({
			opened: team.opened,
			threes: team.threes.map(cardFace),
			melds: team.melds.map((meld) => ({
				id: meld.id,
				kind: meld.kind,
				cards: meld.cards.map(cardFace),
			})),
		})),
		publicMemory: belief.players.slice(0, 4).map(knownCards),
		history: history
			? {
					initialCounts: [...history.initialCounts],
					events: history.events.map((event) => ({
						player: event.player,
						gained: [...event.gained],
						removed: [...event.removed],
						drawn: event.drawn,
						...(event.unknownRemoved === undefined
							? {}
							: { unknownRemoved: event.unknownRemoved }),
					})),
				}
			: null,
		choices: labels.map((action, index) => ({ index, action })),
	};
	const prompt = `${RULES}\nVisible state and choices (pile is bottom to top; known cards are lower bounds and unknown slots may include additional copies):\n${JSON.stringify(state)}`;
	if (prompt.length > maxPromptChars)
		return { ok: false, reason: "prompt exceeds size limit" };
	if (expired()) return { ok: false, reason: "prompt cancelled or timed out" };
	return {
		ok: true,
		request: Object.freeze({
			prompt,
			labels,
			select(value: unknown) {
				if (options.signal?.aborted)
					return { ok: false as const, reason: "request cancelled" };
				if (
					typeof value !== "number" ||
					!Number.isSafeInteger(value) ||
					value < 0 ||
					value >= actions.length
				)
					return { ok: false as const, reason: "invalid legal-choice index" };
				const action = actions[value];
				return action
					? { ok: true as const, action }
					: { ok: false as const, reason: "missing legal action" };
			},
		}),
	};
}
