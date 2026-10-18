import {
	type Action,
	type CanastaRules,
	type Card,
	type HandView,
	isCanasta,
	type Meld,
} from "../canasta";

/** A card as the model reads it: rank then suit letter, for example "10H", "2S" or "JK". */
export function cardLabel(card: Pick<Card, "rank" | "suit">): string {
	return `${card.rank}${card.suit ?? ""}`;
}

/** Every card the seat can name by id: its own hand, the pile, and both sides' melds and red threes. */
export function cardsById(view: HandView): ReadonlyMap<string, Card> {
	const cards = new Map<string, Card>();
	const add = (list: readonly Card[]) => {
		for (const card of list) cards.set(card.id, card);
	};
	add(view.own);
	add(view.pile);
	for (const team of view.teams) {
		add(team.redThrees);
		for (const meld of team.melds) add(meld.cards);
	}
	return cards;
}

export function meldLabel(meld: Meld, view: HandView): string {
	const canasta = isCanasta(meld, view.rules) ? ", canasta" : "";
	return `${meld.rank}s (${meld.cards.map(cardLabel).join(" ")}${canasta})`;
}

/** A side has at most one meld of each rank, so the rank names the meld as the prompt lists it. */
function meldName(meldId: string, view: HandView): string {
	const meld = view.teams
		.flatMap((side) => side.melds)
		.find((candidate) => candidate.id === meldId);
	return meld ? `your side's meld of ${meld.rank}s` : `meld ${meldId}`;
}

function labelsOf(ids: readonly string[], cards: ReadonlyMap<string, Card>) {
	return ids.map((id) => {
		const card = cards.get(id);
		return card ? cardLabel(card) : id;
	});
}

function counted(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The rules that a model needs to choose a move, one sentence group per line, written from the rule values. */
export function rulesText(rules: CanastaRules): string[] {
	const wildLimit = rules.wildsAtMostNaturals
		? ", and never more wild cards than natural cards"
		: "";
	const pile = rules.pileAlwaysFrozen
		? "The discard pile is always frozen: it can be taken only with a natural pair of its top card's rank from the hand."
		: "The discard pile is frozen for a side before its first meld, and for everyone while it holds a wild card or a red three. A frozen pile can be taken only with a natural pair of its top card's rank from the hand.";
	const concealed = [
		`Going out scores ${rules.outBonus}.`,
		`Going out concealed (no meld before, and a canasta of your own in the same turn) scores ${rules.outBonus + rules.concealedOutBonus}.`,
		...(rules.concealedWithoutCanastaBonus > 0
			? [
					`Going out concealed on the side's earlier canasta scores ${rules.outBonus + rules.concealedWithoutCanastaBonus}.`,
				]
			: []),
		...(rules.concealedAfterPickup
			? []
			: ["Taking the pile in that turn loses the concealed bonus."]),
	];
	const allRedThrees = 4 * rules.redThreeBonus + rules.allRedThreesBonus;
	return [
		`Draw ${counted(rules.drawCount, "card")} from the stock, or take the whole discard pile; then discard one card, unless you go out.`,
		`A meld holds at least 2 natural cards and at most ${rules.maxWildsPerMeld} wild cards${wildLimit}. ${rules.canastaSize} cards make a canasta: a natural one scores ${rules.naturalCanastaBonus}, a mixed one ${rules.mixedCanastaBonus}.`,
		pile,
		...(rules.canastaRankBlocksPile
			? [
					"A side cannot take the pile while its top card is of a rank in which the side has a canasta.",
				]
			: []),
		`A side needs at least ${counted(rules.canastasToGoOut, "canasta")} to go out.`,
		concealed.join(" "),
		`Red threes score ${rules.redThreeBonus} each, ${allRedThrees} for all four, for a side that ${rules.redThreesNeedCanasta ? "has a canasta" : "has made its first meld"}; otherwise they count against it.`,
	];
}

/** One legal action in words, with the card labels filled in from the seat's view. */
export function actionLabel(action: Action, view: HandView): string {
	const cards = cardsById(view);
	switch (action.type) {
		case "draw":
			if (view.stockCount === 0) return "End the hand: the stock is empty";
			return view.rules.drawCount === 1
				? "Draw a card from the stock"
				: `Draw ${view.rules.drawCount} cards from the stock`;
		case "takePile": {
			const top = view.pile.at(-1);
			// Onto an existing meld the top card can go alone, with no hand card.
			const using =
				action.cards.length === 0
					? ""
					: ` with ${labelsOf(action.cards, cards).join(" ")}`;
			const topText = top ? cardLabel(top) : "";
			const target =
				action.extend === undefined
					? "as a new meld"
					: `added to ${meldName(action.extend, view)}`;
			return `Take the pile (top ${topText})${using}, ${target}`;
		}
		case "meld":
			return `Lay down a meld of ${labelsOf(action.cards, cards).join(" ")}`;
		case "extend":
			return `Add ${labelsOf(action.cards, cards).join(" ")} to ${meldName(action.meldId, view)}`;
		case "discard":
			return `Discard ${labelsOf([action.card], cards)[0]}`;
		case "resetTurn":
			return "Take back this turn's melds and reset the turn";
	}
}
