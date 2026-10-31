import { buildDecks, type Card } from "../canasta/cards";
import type { Seat } from "../canasta/hand";
import type {
	ModernHandSnapshot,
	ModernHandState,
	ModernTeamState,
} from "../canasta/modern-hand";
import type { ModernHandView } from "../canasta/modern-view";
import { cardFace } from "../game/canasta-history";
import type { ModernPublicHistory } from "../game/modern-history";
import { type CardBelief, inferCards, sampleCards } from "./card-knowledge";

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
