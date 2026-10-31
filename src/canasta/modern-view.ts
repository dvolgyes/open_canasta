import type { Card, Rank } from "./cards";
import type { Seat } from "./hand";
import type {
	ModernHandState,
	ModernOutcome,
	ModernTeamState,
} from "./modern-hand";

export type ModernPublicCard = Pick<Card, "rank" | "suit">;
export type ModernPublicMeld =
	| {
			readonly id: string;
			readonly kind: "natural";
			readonly rank: Rank;
			readonly cards: readonly ModernPublicCard[];
	  }
	| {
			readonly id: string;
			readonly kind: "wild";
			readonly cards: readonly ModernPublicCard[];
	  };
export interface ModernPublicTeam {
	readonly melds: readonly ModernPublicMeld[];
	readonly threes: readonly ModernPublicCard[];
	readonly opened: boolean;
}

function publicCards(cards: readonly Card[]): ModernPublicCard[] {
	return cards.map(({ rank, suit }) => ({ rank, suit }));
}

function publicTeam(team: ModernTeamState): ModernPublicTeam {
	return {
		opened: team.opened,
		threes: publicCards(team.threes),
		melds: team.melds.map((meld) =>
			meld.kind === "natural"
				? {
						id: meld.id,
						kind: "natural",
						rank: meld.rank,
						cards: publicCards(meld.cards),
					}
				: { id: meld.id, kind: "wild", cards: publicCards(meld.cards) },
		),
	};
}

/** The cards and counts visible to one player. */
export interface ModernHandView {
	readonly rulesVersion: ModernHandState["rulesVersion"];
	readonly teamScores: readonly [number, number];
	readonly dealer: Seat;
	readonly turn: Seat;
	readonly phase: ModernHandState["phase"];
	readonly outcome: ModernOutcome | null;
	readonly hand: readonly Card[];
	readonly handCounts: readonly number[];
	readonly bonusCounts: readonly number[];
	readonly stockCount: number;
	readonly pile: readonly ModernPublicCard[];
	readonly teams: readonly [ModernPublicTeam, ModernPublicTeam];
	readonly specialCards: readonly ModernPublicCard[];
	/** Hands and pending bonus cards are revealed for scoring after the hand. */
	readonly revealed: readonly (readonly ModernPublicCard[])[] | null;
}

export function modernViewFor(
	hand: ModernHandState,
	seat: Seat,
): ModernHandView {
	if (![0, 1, 2, 3].includes(seat)) throw new Error("invalid viewing seat");
	return {
		rulesVersion: hand.rulesVersion,
		teamScores: hand.teamScores,
		dealer: hand.dealer,
		turn: hand.turn,
		phase: hand.phase,
		outcome: hand.outcome,
		hand: hand.hands[seat],
		handCounts: hand.hands.map((cards) => cards.length),
		bonusCounts: hand.bonuses.map((cards) => cards.length),
		stockCount: hand.stock.length,
		pile: publicCards(hand.pile),
		teams: [publicTeam(hand.teams[0]), publicTeam(hand.teams[1])],
		specialCards:
			hand.outcome?.kind === "special"
				? publicCards(hand.hands[hand.outcome.seat])
				: [],
		revealed: hand.outcome
			? hand.hands.map((cards, i) =>
					publicCards([...cards, ...(hand.bonuses[i] ?? [])]),
				)
			: null,
	};
}
