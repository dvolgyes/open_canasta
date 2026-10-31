import { type Card, isWild } from "../canasta/cards";
import { teamOf } from "../canasta/hand";
import {
	type ModernAction,
	type ModernHandState,
	modernApplyAction,
} from "../canasta/modern-hand";
import {
	MODERN_SPECIAL_HAND_SCORES,
	type ModernSpecialHandKind,
} from "../canasta/modern-special-hands";
import { modernCardPoints } from "../canasta/modern-special-scoring";
import { cardFace } from "../game/canasta-history";

/** Face-based action keys avoid treating the two physical copies as distinct choices. */
export function modernActionKey(
	hand: ModernHandState,
	action: ModernAction,
): string {
	const face = (id: string) => {
		const card = hand.hands[hand.turn].find((item) => item.id === id);
		if (!card) throw new Error("action refers to a card outside the hand");
		return cardFace(card);
	};
	switch (action.type) {
		case "discard":
			return `discard:${face(action.card)}`;
		case "meld":
		case "take-pile":
			return `${action.type}:${action.cards.map(face).toSorted().join(",")}`;
		case "extend":
			return `extend:${action.meldId}:${action.cards.map(face).toSorted().join(",")}`;
		case "special":
			return `special:${action.kind}`;
		default:
			return action.type;
	}
}

function* subsets(
	cards: readonly Card[],
	max: number,
	start = 0,
	prefix: readonly Card[] = [],
): Generator<readonly Card[]> {
	if (prefix.length > 0) yield prefix;
	if (prefix.length >= max) return;
	for (let i = start; i < cards.length; i++) {
		const card = cards[i];
		if (card) yield* subsets(cards, max, i + 1, [...prefix, card]);
	}
}

/** Enumerate legal atomic actions; callers must still prove that a tentative opening can finish. */
export function modernSearchActions(
	hand: ModernHandState,
	expired: () => boolean = () => false,
): ModernAction[] {
	if (hand.outcome) return [];
	const seat = hand.turn;
	const own = hand.hands[seat];
	const melds = hand.teams[teamOf(seat)].melds;
	const actions = new Map<string, ModernAction>();
	const add = (action: ModernAction) => {
		if (modernApplyAction(hand, seat, action).ok)
			actions.set(modernActionKey(hand, action), action);
	};
	if (hand.phase === "draw") {
		add({ type: "draw" });
		const top = hand.pile.at(-1);
		const matches = top
			? own.filter((card) => card.rank === top.rank && !isWild(card))
			: [];
		for (let i = 0; i < matches.length && !expired(); i++)
			for (let j = i + 1; j < matches.length && !expired(); j++) {
				const first = matches[i];
				const second = matches[j];
				if (first && second)
					add({ type: "take-pile", cards: [first.id, second.id] });
			}
		return [...actions.values()];
	}
	if (hand.phase === "pile-opening") add({ type: "commit-pile" });
	else {
		for (const card of own) add({ type: "discard", card: card.id });
		add({ type: "commit-opening" });
		for (const kind of Object.keys(
			MODERN_SPECIAL_HAND_SCORES,
		) as ModernSpecialHandKind[])
			add({ type: "special", kind });
	}
	const ranks = new Set([
		...own
			.filter((card) => !isWild(card) && card.rank !== "3")
			.map((card) => card.rank),
		...melds.flatMap((meld) => (meld.kind === "natural" ? [meld.rank] : [])),
	]);
	for (const rank of ranks) {
		if (expired()) break;
		const pool = own.filter((card) => card.rank === rank || isWild(card));
		const existing = melds.find(
			(meld) => meld.kind === "natural" && meld.rank === rank,
		);
		for (const cards of subsets(pool, 7)) {
			if (expired()) break;
			const ids = cards.map((card) => card.id);
			add(
				existing
					? { type: "extend", meldId: existing.id, cards: ids }
					: { type: "meld", cards: ids },
			);
		}
	}
	const wildMeld = melds.find((meld) => meld.kind === "wild");
	for (const cards of subsets(own.filter(isWild), 7)) {
		if (expired()) break;
		const ids = cards.map((card) => card.id);
		add(
			wildMeld
				? { type: "extend", meldId: wildMeld.id, cards: ids }
				: { type: "meld", cards: ids },
		);
	}
	if (actions.size === 0) add({ type: "undo" });
	return [...actions.values()];
}

function positionKey(hand: ModernHandState): string {
	const borrowed = new Set(hand.turnStart.pile.map((card) => card.id));
	const face = (card: Card) =>
		`${cardFace(card)}:${borrowed.has(card.id) ? 1 : 0}`;
	return JSON.stringify({
		phase: hand.phase,
		own: hand.hands[hand.turn].map(face).toSorted(),
		pile: hand.pile.map(face),
		teams: hand.teams.map((team) => ({
			opened: team.opened,
			melds: team.melds
				.map((meld) => [meld.kind, ...meld.cards.map(face).toSorted()])
				.toSorted((a, b) => a.join(",").localeCompare(b.join(","))),
		})),
	});
}

/** Prove that the current player can finish without retracting a tentative meld. */
function canFinish(
	hand: ModernHandState,
	seat: number,
	expired: () => boolean,
	cache: Map<string, boolean>,
): boolean {
	if (hand.outcome !== null || hand.turn !== seat) return true;
	if (expired()) return false;
	const key = positionKey(hand);
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	for (const card of hand.hands[hand.turn]) {
		if (
			modernApplyAction(hand, hand.turn, { type: "discard", card: card.id }).ok
		) {
			cache.set(key, true);
			return true;
		}
	}
	for (const kind of Object.keys(
		MODERN_SPECIAL_HAND_SCORES,
	) as ModernSpecialHandKind[]) {
		if (modernApplyAction(hand, hand.turn, { type: "special", kind }).ok) {
			cache.set(key, true);
			return true;
		}
	}
	const side = hand.teams[teamOf(hand.turn)];
	if (!side.opened) {
		const ineligible = new Set(hand.turnStart.pile.map((card) => card.id));
		const potential = [
			...hand.hands[hand.turn],
			...side.melds.flatMap((meld) => meld.cards),
		]
			.filter((card) => !ineligible.has(card.id))
			.reduce((sum, card) => sum + modernCardPoints(card), 0);
		const score = hand.teamScores[teamOf(hand.turn)];
		const minimum = score < 3000 ? 125 : score < 5000 ? 155 : 180;
		if (potential < minimum) {
			cache.set(key, false);
			return false;
		}
	}
	const priority = (action: ModernAction) => {
		if (action.type === "commit-pile" || action.type === "commit-opening")
			return 10000;
		if (action.type !== "meld" && action.type !== "extend") return 0;
		return hand.hands[hand.turn]
			.filter((card) => action.cards.includes(card.id))
			.reduce((sum, card) => sum + modernCardPoints(card), 0);
	};
	const continuations = modernSearchActions(hand, expired).toSorted(
		(a, b) => priority(b) - priority(a),
	);
	for (const action of continuations) {
		if (expired()) return false;
		if (
			action.type !== "meld" &&
			action.type !== "extend" &&
			action.type !== "commit-opening" &&
			action.type !== "commit-pile"
		)
			continue;
		const step = modernApplyAction(hand, hand.turn, action);
		if (step.ok && canFinish(step.hand, seat, expired, cache)) {
			cache.set(key, true);
			return true;
		}
	}
	if (!expired()) cache.set(key, false);
	return false;
}

/** Exclude tentative actions for which no legal completion has been proved before the deadline. */
export function modernPlayableActions(
	hand: ModernHandState,
	expired: () => boolean = () => false,
): ModernAction[] {
	const playable: ModernAction[] = [];
	const cache = new Map<string, boolean>();
	for (const action of modernSearchActions(hand, expired)) {
		if (
			action.type === "draw" ||
			action.type === "discard" ||
			action.type === "special" ||
			action.type === "undo"
		) {
			playable.push(action);
			continue;
		}
		if (expired()) break;
		const step = modernApplyAction(hand, hand.turn, action);
		if (step.ok && canFinish(step.hand, hand.turn, expired, cache))
			playable.push(action);
	}
	return playable;
}
