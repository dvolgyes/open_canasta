import { buildDecks, type Card } from "../canasta/cards";
import { type Seat, teamOf } from "../canasta/hand";
import type {
	ModernHandSnapshot,
	ModernHandState,
	ModernTeamState,
} from "../canasta/modern-hand";
import { type ModernHandView, modernViewFor } from "../canasta/modern-view";
import { cardFace } from "../game/canasta-history";
import type { ModernPublicHistory } from "../game/modern-history";
import { type CardBelief, inferCards, sampleCards } from "./card-knowledge";

export interface ModernObservation {
	readonly seat: Seat;
	readonly view: ModernHandView;
	readonly turnStart: ModernHandView;
	readonly canUndo: boolean;
	readonly history?: ModernPublicHistory;
}

/** The actor sees public turn history and their own cards, never the hidden deal. */
export function observeModern(
	hand: ModernHandState,
	seat: Seat,
	history?: ModernPublicHistory,
): ModernObservation {
	const start = { ...hand.turnStart, turnStart: hand.turnStart, undo: [] };
	return {
		seat,
		view: modernViewFor(hand, seat),
		turnStart: modernViewFor(start, seat),
		canUndo: hand.turn === seat && hand.undo.length > 0,
		history,
	};
}

/** Infer hidden hands, bonus rows, and stock from a single player's public observation. */
export function inferModern(
	view: ModernHandView,
	seat: Seat,
	history?: ModernPublicHistory,
): CardBelief {
	const deck = buildDecks();
	const exposed = [
		...view.pile,
		...view.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((meld) => meld.cards),
		]),
	];
	const threes = deck.filter((card) => card.rank === "3").map(cardFace);
	return inferCards({
		deck: deck.map(cardFace),
		observer: seat,
		own: view.hand.map(cardFace),
		publicCards: exposed.map(cardFace),
		counts: [...view.handCounts, ...view.bonusCounts],
		history,
		excludedByPlayer: [threes, threes, threes, threes, [], [], [], []],
	});
}

/** Determinize at the start of the observer's turn, without using the real hidden deal. */
export function sampleModernAtTurnStart(
	view: ModernHandView,
	seat: Seat,
	belief: CardBelief,
	rng: () => number,
): ModernHandState {
	if (view.phase !== "draw" || view.turn !== seat || view.outcome !== null)
		throw new Error("modern sampling requires the observer's start of turn");
	const allocation = sampleCards(belief, rng);
	if (allocation.length !== 9) throw new Error("invalid modern belief rows");
	const ownIds = new Set(view.hand.map((card) => card.id));
	const pool = new Map<string, Card[]>();
	for (const card of buildDecks()) {
		if (ownIds.has(card.id)) continue;
		const face = cardFace(card);
		const cards = pool.get(face) ?? [];
		cards.push(card);
		pool.set(face, cards);
	}
	const take = (face: string): Card => {
		const card = pool.get(face)?.pop();
		if (!card) throw new Error("sample exceeds the physical deck");
		return card;
	};
	const teams = view.teams.map(
		(team): ModernTeamState => ({
			opened: team.opened,
			threes: team.threes.map((card) => take(cardFace(card))),
			melds: team.melds.map((meld) =>
				meld.kind === "natural"
					? {
							id: meld.id,
							kind: "natural",
							rank: meld.rank,
							cards: meld.cards.map((card) => take(cardFace(card))),
						}
					: {
							id: meld.id,
							kind: "wild",
							cards: meld.cards.map((card) => take(cardFace(card))),
						},
			),
		}),
	);
	const first = teams[0];
	const second = teams[1];
	if (!first || !second) throw new Error("invalid modern teams");
	const pile = view.pile.map((card) => take(cardFace(card)));
	const cardsFor = (row: number): Card[] => (allocation[row] ?? []).map(take);
	const hands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [[], [], [], []];
	for (let i = 0; i < 4; i++)
		hands[i] = i === seat ? [...view.hand] : cardsFor(i);
	const bonuses: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [cardsFor(4), cardsFor(5), cardsFor(6), cardsFor(7)];
	const stock = cardsFor(8);
	const meldNumbers = teams.flatMap((team) =>
		team.melds
			.map((meld) => /^m(\d+)$/.exec(meld.id)?.[1])
			.filter((n): n is string => n !== undefined)
			.map(Number),
	);
	const base: ModernHandSnapshot = {
		rulesVersion: view.rulesVersion,
		teamScores: view.teamScores,
		dealer: view.dealer,
		turn: view.turn,
		phase: view.phase,
		hands,
		stock,
		pile,
		teams: [first, second],
		bonuses,
		turnTaken: [],
		nextMeldNo: Math.max(0, ...meldNumbers) + 1,
		outcome: null,
	};
	return { ...base, turnStart: base, undo: [] };
}

/** Reconstruct a consistent current position and turn baseline from the actor's observations. */
export function sampleModernPosition(
	observation: ModernObservation,
	belief: CardBelief,
	rng: () => number,
): ModernHandState {
	const { view, turnStart, seat } = observation;
	if (view.turn !== seat || view.outcome !== null || turnStart.turn !== seat)
		throw new Error("modern sampling requires the actor's live turn");
	let state = sampleModernAtTurnStart(
		{ ...view, phase: "draw" },
		seat,
		belief,
		rng,
	);
	state = { ...state, phase: view.phase };
	const side = teamOf(seat);
	const currentIds = new Set(view.hand.map((card) => card.id));
	const startIds = new Set(turnStart.hand.map((card) => card.id));
	const moved = turnStart.hand.filter((card) => !currentIds.has(card.id));
	const movedIds = new Set(moved.map((card) => card.id));
	const slots: { meld: number; card: number; face: string }[] = [];
	for (const [meldIndex, meld] of state.teams[side].melds.entries()) {
		const original = turnStart.teams[side].melds.find(
			(item) => item.id === meld.id,
		);
		const counts = new Map<string, number>();
		for (const card of original?.cards ?? [])
			counts.set(cardFace(card), (counts.get(cardFace(card)) ?? 0) + 1);
		for (const [cardIndex, card] of meld.cards.entries()) {
			const face = cardFace(card);
			const remaining = counts.get(face) ?? 0;
			if (remaining > 0) counts.set(face, remaining - 1);
			else slots.push({ meld: meldIndex, card: cardIndex, face });
		}
	}
	for (const card of moved) {
		const index = slots.findIndex((slot) => slot.face === cardFace(card));
		if (index < 0)
			throw new Error("turn history does not account for a melded card");
		const slot = slots.splice(index, 1)[0];
		if (!slot)
			throw new Error("turn history does not account for a melded card");
		const replacement = state.teams[side].melds[slot.meld]?.cards[slot.card];
		if (!replacement) throw new Error("missing sampled meld card");
		if (replacement.id === card.id) continue;
		const swap = (item: Card) =>
			item.id === card.id
				? replacement
				: item.id === replacement.id
					? card
					: item;
		const hands = state.hands.map((cards) => cards.map(swap)) as [
			Card[],
			Card[],
			Card[],
			Card[],
		];
		const bonuses = state.bonuses.map((cards) => cards.map(swap)) as [
			Card[],
			Card[],
			Card[],
			Card[],
		];
		const teams = state.teams.map(
			(team): ModernTeamState => ({
				...team,
				threes: team.threes.map(swap),
				melds: team.melds.map((meld) => ({
					...meld,
					cards: meld.cards.map(swap),
				})),
			}),
		) as [ModernTeamState, ModernTeamState];
		state = {
			...state,
			hands,
			bonuses,
			teams,
			stock: state.stock.map(swap),
			pile: state.pile.map(swap),
		};
	}
	const baselineIds = new Set<string>();
	const baselineTeams = turnStart.teams.map((team, index): ModernTeamState => {
		const current = state.teams[index];
		if (!current) throw new Error("missing sampled team");
		if (
			team.threes.map(cardFace).toSorted().join(",") !==
			current.threes.map(cardFace).toSorted().join(",")
		)
			throw new Error("turn history changes exposed threes");
		for (const card of current.threes) baselineIds.add(card.id);
		const melds = team.melds.map((old) => {
			const existing = current.melds.find((meld) => meld.id === old.id);
			if (!existing || existing.kind !== old.kind)
				throw new Error("turn history loses an existing meld");
			const available = existing.cards.filter((card) => !movedIds.has(card.id));
			const cards = old.cards.map((face) => {
				const at = available.findIndex(
					(card) => cardFace(card) === cardFace(face),
				);
				if (at < 0) throw new Error("turn history changes an existing meld");
				const found = available.splice(at, 1)[0];
				if (!found) throw new Error("turn history changes an existing meld");
				baselineIds.add(found.id);
				return found;
			});
			return old.kind === "natural"
				? { id: old.id, kind: "natural" as const, rank: old.rank, cards }
				: { id: old.id, kind: "wild" as const, cards };
		});
		return { opened: team.opened, threes: current.threes, melds };
	});
	const first = baselineTeams[0];
	const second = baselineTeams[1];
	if (!first || !second) throw new Error("invalid baseline teams");
	const pileCandidates = [
		...state.pile,
		...state.hands[seat].filter((card) => !startIds.has(card.id)),
		...state.teams[side].melds.flatMap((meld) =>
			meld.cards.filter(
				(card) => !movedIds.has(card.id) && !baselineIds.has(card.id),
			),
		),
	];
	const startPile = turnStart.pile.map((face) => {
		const at = pileCandidates.findIndex(
			(card) => cardFace(card) === cardFace(face),
		);
		if (at < 0) throw new Error("turn history cannot reconstruct the pile");
		const found = pileCandidates.splice(at, 1)[0];
		if (!found) throw new Error("turn history cannot reconstruct the pile");
		return found;
	});
	if (pileCandidates.length)
		throw new Error("turn history has extra pile cards");
	const startHands: [
		readonly Card[],
		readonly Card[],
		readonly Card[],
		readonly Card[],
	] = [...state.hands];
	startHands[seat] = turnStart.hand;
	const meldNumbers = baselineTeams.flatMap((team) =>
		team.melds
			.map((meld) => /^m(\d+)$/.exec(meld.id)?.[1])
			.filter((n): n is string => n !== undefined)
			.map(Number),
	);
	const { turnStart: _turnStart, undo: _undo, ...snapshot } = state;
	const baseline: ModernHandSnapshot = {
		...snapshot,
		phase: turnStart.phase,
		hands: startHands,
		pile: startPile,
		teams: [first, second],
		turnTaken: [],
		nextMeldNo: Math.max(0, ...meldNumbers) + 1,
		outcome: null,
	};
	return {
		...state,
		turnTaken:
			turnStart.phase === "draw" && view.phase !== "draw"
				? startPile.map((card) => card.id)
				: [],
		turnStart: baseline,
		undo: [],
	};
}
