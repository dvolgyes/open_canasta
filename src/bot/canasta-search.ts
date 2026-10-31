/** Canasta observations and simulation policy for the game-independent search. */
import {
	type Action,
	applyAction,
	buildDecks,
	type Card,
	cardPoints,
	type HandState,
	type HandView,
	initialSatisfied,
	isRed3,
	isWild,
	type Seat,
	scoreHand,
	teamOf,
	viewFor,
} from "../canasta";
import {
	cardFace,
	type PublicHistory,
	publicCards,
} from "../game/canasta-history";
import { canCompleteOpening } from "./canasta-opening";
import {
	type PriorWeights,
	priorFeatures,
	validPriorWeights,
	weightedPriorScore,
} from "./canasta-prior";
import { type CardBelief, inferCards, sampleCards } from "./card-knowledge";
import { scoreAction } from "./heuristic";
import { type SearchOptions, type SearchResult, search } from "./mcts";

export interface CanastaObservation {
	readonly seat: Seat;
	readonly view: HandView;
	readonly turnStart: HandView;
	readonly nextMeldNo: number;
	readonly startMeldNo: number;
	readonly meldedSeats?: readonly Seat[];
	readonly history?: PublicHistory;
}

/** The sole boundary from replicated state: never pass opponents' cards, stock order, or seed. */
export function observeCanasta(
	hand: HandState,
	seat: Seat,
	history?: PublicHistory,
): CanastaObservation {
	const view = { ...viewFor(hand, seat), revealed: null };
	const turnStart = {
		...viewFor({ ...hand.turnStart, turnStart: hand.turnStart }, seat),
		revealed: null,
	};
	return {
		seat,
		view,
		turnStart,
		nextMeldNo: hand.nextMeldNo,
		startMeldNo: hand.turnStart.nextMeldNo,
		meldedSeats: hand.meldedSeats,
		history,
	};
}

export function inferCanasta(observation: CanastaObservation): CardBelief {
	const { view, seat, history } = observation;
	const deck = buildDecks();
	return inferCards({
		deck: deck.map(cardFace),
		observer: seat,
		own: view.own.map(cardFace),
		publicCards: publicCards(view).map(cardFace),
		counts: view.handCounts,
		history,
		excluded: deck.filter(isRed3).map(cardFace),
	});
}

export function sampleCanasta(
	observation: CanastaObservation,
	belief: CardBelief,
	rng: () => number,
): HandState {
	const { view, seat } = observation;
	const allocation = sampleCards(belief, rng);
	const visible = [...view.own, ...publicCards(view)];
	const used = new Set(visible.map((c) => c.id));
	const pool = new Map<string, Card[]>();
	for (const card of buildDecks())
		if (!used.has(card.id)) {
			const face = cardFace(card);
			const group = pool.get(face) ?? [];
			group.push(card);
			pool.set(face, group);
		}
	const hands = allocation.map((faces, i) =>
		i === seat
			? [...view.own]
			: faces.map((f) => {
					const card = pool.get(f)?.pop();
					if (!card) throw new Error("sample exceeds available physical cards");
					return card;
				}),
	);
	const stock = required(hands.pop());
	const snapshot = (v: HandView, nextMeldNo: number) => ({
		rules: v.rules,
		teamScores: v.teamScores,
		dealer: v.dealer,
		turn: v.turn,
		phase: v.phase,
		hands: hands.map((h, i) => (i === seat ? [...v.own] : h)),
		stock,
		pile: v.pile,
		teams: v.teams,
		turnMeldPoints: v.turnMeldPoints,
		turnActions: v.turnActions,
		turnTaken: v.taken,
		meldedSeats: observation.meldedSeats,
		nextMeldNo,
		outcome: v.outcome,
	});
	return {
		...snapshot(view, observation.nextMeldNo),
		turnStart: snapshot(observation.turnStart, observation.startMeldNo),
	};
}

function actionKey(hand: HandState, action: Action): string {
	const own = required(hand.hands[hand.turn]);
	const opening = !initialSatisfied(hand, teamOf(hand.turn));
	const fromPile = new Set(hand.turnStart.pile.map((c) => c.id));
	const faces = (ids: readonly string[]) =>
		ids
			.map(
				(id) =>
					cardFace(required(own.find((c) => c.id === id))) +
					(opening && fromPile.has(id) ? ":pile" : ""),
			)
			.sort()
			.join(",");
	switch (action.type) {
		case "discard":
			return `discard:${faces([action.card])}`;
		case "meld":
			return `meld:${faces(action.cards)}`;
		case "extend":
			return `extend:${action.meldId}:${faces(action.cards)}`;
		case "takePile":
			return `take:${action.extend ?? "new"}:${faces(action.cards)}`;
		default:
			return action.type;
	}
}

/** Lazy combinations keep deadline checks inside enumeration, including large pile pickups. */
function* subsets(
	cards: readonly Card[],
	max: number,
	at = 0,
	prefix: readonly Card[] = [],
): Generator<readonly Card[]> {
	yield prefix;
	if (prefix.length === max) return;
	for (let i = at; i < cards.length; i++)
		yield* subsets(cards, max, i + 1, [...prefix, required(cards[i])]);
}

export function searchActions(
	hand: HandState,
	expired: () => boolean = () => false,
	rollout = false,
): Action[] {
	if (hand.outcome) return [];
	const seat = hand.turn;
	const own = required(hand.hands[seat]);
	const melds = hand.teams[teamOf(seat)].melds;
	const actions = new Map<string, Action>();
	const add = (action: Action) => {
		if (applyAction(hand, seat, action).ok)
			actions.set(actionKey(hand, action), action);
	};
	if (hand.phase === "draw") add({ type: "draw" });
	else for (const card of own) add({ type: "discard", card: card.id });
	const ranks =
		hand.phase === "draw"
			? [hand.pile.at(-1)?.rank]
			: [
					...new Set([
						...own.filter((c) => !isWild(c)).map((c) => c.rank),
						...melds.map((meld) => meld.rank),
					]),
				];
	for (const rank of ranks) {
		if (rank === undefined || expired()) break;
		const pool = own.filter((c) => c.rank === rank || isWild(c));
		const meld = melds.find((m) => m.rank === rank);
		const offer = (cards: readonly Card[]) => {
			if (hand.phase === "play" && cards.length === 0) return;
			const ids = cards.map((c) => c.id);
			if (hand.phase === "draw")
				add({
					type: "takePile",
					cards: ids,
					...(meld ? { extend: meld.id } : {}),
				});
			else if (meld) add({ type: "extend", cards: ids, meldId: meld.id });
			else add({ type: "meld", cards: ids });
		};
		// Complete natural groups and every wild-card count include one-step concealed canastas.
		const naturals = pool.filter((c) => !isWild(c));
		const wilds = pool.filter(isWild);
		const wildOptions = rollout
			? [[], wilds.slice(0, 1), wilds.slice(0, 2), wilds.slice(0, 3)]
			: subsets(wilds, Math.min(3, wilds.length));
		for (const wild of wildOptions) {
			if (expired()) break;
			offer([...naturals, ...wild]);
			if (rollout)
				for (let n = 0; n <= Math.min(4, naturals.length); n++)
					offer([...naturals.slice(0, n), ...wild]);
		}
		if (!rollout)
			for (const cards of subsets(pool, hand.phase === "draw" ? 3 : 4)) {
				if (expired()) break;
				offer(cards);
			}
	}
	// Retractions are recovery actions, never a rollout cycle when a forward action exists.
	if (actions.size === 0) add({ type: "resetTurn" });
	return [...actions.values()];
}

/** Prove a meld can finish the turn before selecting it; an interrupted proof is not a success. */
function canFinish(
	hand: HandState,
	seat: Seat,
	expired: () => boolean,
	seen: Set<string>,
): boolean {
	if (hand.outcome || hand.turn !== seat) return true;
	if (
		required(hand.hands[seat]).some(
			(c) => applyAction(hand, seat, { type: "discard", card: c.id }).ok,
		)
	)
		return true;
	if (expired()) return false;
	// After a pile pickup, concealed going out cannot waive the opening minimum.
	const team = teamOf(seat);
	if (!initialSatisfied(hand, team) && hand.turnStart.phase === "draw")
		return canCompleteOpening(hand, seat, expired);
	const borrowed = new Set(hand.turnStart.pile.map((c) => c.id));
	const category = (c: Card) =>
		`${c.rank}:${Number(isRed3(c))}:${Number(borrowed.has(c.id))}`;
	const oldMelds = new Set(hand.turnStart.teams[team].melds.map((m) => m.id));
	const key =
		required(hand.hands[seat]).map(category).sort().join(",") +
		":" +
		hand.turnMeldPoints +
		":" +
		hand.teams[teamOf(seat)].melds
			.map(
				(meld) =>
					`${meld.rank}:${Number(oldMelds.has(meld.id))}:` +
					meld.cards
						.map((c) => c.rank)
						.sort()
						.join(","),
			)
			.sort()
			.join("|");
	if (seen.has(key)) return false;
	seen.add(key);
	const continuations: HandState[] = [];
	// Within each interchangeable card class, consume opening-eligible points first.
	// This also makes the proof generator independent of physical duplicate identity.
	const ordered = {
		...hand,
		hands: hand.hands.map((cards, i) =>
			i !== seat
				? cards
				: [...cards].sort(
						(a, b) =>
							(borrowed.has(b.id) ? 0 : cardPoints(b)) -
								(borrowed.has(a.id) ? 0 : cardPoints(a)) ||
							category(a).localeCompare(category(b)),
					),
		),
	};
	for (const action of searchActions(ordered, expired, true)) {
		if (expired()) return false;
		if (action.type !== "meld" && action.type !== "extend") continue;
		const step = applyAction(hand, seat, action);
		if (step.ok) continuations.push(step.hand);
	}
	// Clearing borrowed cards may be required before black threes can supply opening points.
	// Try point gains first, then larger clearances; each continuation strictly shrinks the hand.
	continuations.sort(
		(a, b) =>
			b.turnMeldPoints - a.turnMeldPoints ||
			required(a.hands[seat]).length - required(b.hands[seat]).length,
	);
	for (const next of continuations)
		if (canFinish(next, seat, expired, seen)) return true;
	return false;
}

function playableActions(
	hand: HandState,
	expired: () => boolean,
	rollout = false,
): Action[] {
	const candidates = searchActions(hand, expired, rollout);
	const allowed: Action[] = [];
	for (const action of candidates) {
		if (
			action.type === "draw" ||
			action.type === "discard" ||
			action.type === "resetTurn"
		) {
			allowed.push(action);
			continue;
		}
		if (expired()) break;
		const step = applyAction(hand, hand.turn, action);
		if (step.ok && canFinish(step.hand, hand.turn, expired, new Set()))
			allowed.push(action);
	}
	if (
		allowed.length === 0 &&
		applyAction(hand, hand.turn, { type: "resetTurn" }).ok
	)
		allowed.push({ type: "resetTurn" });
	return allowed;
}

export function evaluateCanasta(hand: HandState): readonly number[] {
	const scores = scoreHand(hand);
	if (hand.outcome) {
		const totals = scores.map(
			(score, i) => score.total + (hand.teamScores[i] ?? 0),
		);
		if (
			totals.some((total) => total >= hand.rules.targetScore) &&
			totals[0] !== totals[1]
		)
			return required(totals[0]) > required(totals[1]) ? [1, 0] : [0, 1];
	}
	const difference = scores[0].total - scores[1].total;
	// Bounded score utility includes the partner's remaining cards and both sides' table scores.
	const value = 0.5 + 0.5 * Math.tanh(difference / 1000);
	return [value, 1 - value];
}

export interface CanastaSearchOptions extends SearchOptions<Action> {
	/** Omitted preserves the legacy prior; null removes prior bias, including expansion ordering. */
	readonly priorWeights?: PriorWeights | null;
}

export async function chooseCanasta(
	observation: CanastaObservation,
	options: CanastaSearchOptions,
): Promise<SearchResult<Action>> {
	if (!Number.isFinite(options.timeMs) || options.timeMs < 0)
		throw new Error("timeMs must be finite and nonnegative");
	if (
		options.priorWeights !== undefined &&
		options.priorWeights !== null &&
		!validPriorWeights(options.priorWeights)
	)
		throw new Error("invalid prior weights");
	const now = options.now ?? (() => performance.now());
	const started = now();
	const rng = options.rng ?? Math.random;
	const belief = inferCanasta(observation);
	const initial = sampleCanasta(observation, belief, rng);
	if (initial.turn !== observation.seat || initial.outcome)
		return {
			action: undefined,
			iterations: 0,
			elapsedMs: now() - started,
			choices: [],
		};
	const fallback =
		searchActions(initial, () => true)[0] ?? searchActions(initial)[0];
	const scores = new WeakMap<HandState, Map<Action, number>>();
	const score = (s: HandState, a: Action): number => {
		let values = scores.get(s);
		if (!values) {
			values = new Map();
			scores.set(s, values);
		}
		let value = values.get(a);
		if (value === undefined) {
			value = scoreAction(s, s.turn, a);
			values.set(a, value);
		}
		return value;
	};
	const result = await search(
		{
			sample: () => sampleCanasta(observation, belief, rng),
			player: (s) => teamOf(s.turn),
			key: actionKey,
			actions: playableActions,
			rolloutActions: (s, expired) => playableActions(s, expired, true),
			apply: (s, a) => {
				const step = applyAction(s, s.turn, a);
				if (!step.ok)
					throw new Error(`search generated an illegal action: ${step.reason}`);
				return step.hand;
			},
			terminal: (s) => s.outcome !== null,
			evaluate: evaluateCanasta,
			prior: (s, a) =>
				options.priorWeights === null
					? 0
					: Math.tanh(
							(options.priorWeights === undefined
								? score(s, a)
								: weightedPriorScore(
										priorFeatures(s, s.turn, a),
										options.priorWeights,
									)) / 100,
						),
			rollout: (s, actions, random) => {
				if (random() < 0.15)
					return required(actions[Math.floor(random() * actions.length)]);
				return actions.reduce((best, a) =>
					score(s, a) > score(s, best) ? a : best,
				);
			},
		},
		{
			widening: 1,
			...options,
			timeMs: Math.max(0, options.timeMs - (now() - started)),
			rng,
			now,
			fallback,
		},
	);
	return { ...result, elapsedMs: now() - started };
}

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("missing required search data");
	return value;
}
