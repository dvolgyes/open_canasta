import { cardPoints } from "./cards";
import { type HandState, type Seat, type TeamState, teamOf } from "./hand";
import { canastaBonus, isCanasta, meldPoints, type TeamIndex } from "./melds";
import type { CanastaRules } from "./rules";

export interface TeamScore {
	readonly melds: number;
	readonly canastaBonus: number;
	readonly redThrees: number;
	readonly outBonus: number;
	/** Cards left in the hands of this side, counted negative. */
	readonly handPenalty: number;
	readonly total: number;
}

/** Scores a finished hand. Each side's total is its melds and bonuses minus the cards left in its hands. */
export function scoreHand(hand: HandState): readonly [TeamScore, TeamScore] {
	return [scoreTeam(hand, 0), scoreTeam(hand, 1)];
}

/** The part of a side's score that is on the table: its melds, canasta bonuses and red threes, as they would count now. */
export function tableScore(
	state: TeamState,
	rules: CanastaRules,
): Pick<TeamScore, "melds" | "canastaBonus" | "redThrees"> {
	const melds = state.melds.reduce(
		(sum, meld) => sum + meldPoints(meld.cards),
		0,
	);
	const canastas = state.melds.reduce(
		(sum, meld) => sum + canastaBonus(meld, rules),
		0,
	);
	const redCount = state.redThrees.length;
	const redValue =
		redCount * rules.redThreeBonus +
		(redCount === 4 ? rules.allRedThreesBonus : 0);
	const redPositive = rules.redThreesNeedCanasta
		? state.melds.some((meld) => isCanasta(meld, rules))
		: state.initialMade;
	return {
		melds,
		canastaBonus: canastas,
		redThrees: redPositive ? redValue : -redValue,
	};
}

function scoreTeam(hand: HandState, team: TeamIndex): TeamScore {
	const {
		melds,
		canastaBonus: canastas,
		redThrees,
	} = tableScore(hand.teams[team], hand.rules);
	const outBonus =
		hand.outcome?.kind === "out" && teamOf(hand.outcome.seat) === team
			? hand.rules.outBonus +
				(hand.outcome.concealed ? hand.rules.concealedOutBonus : 0) +
				(hand.outcome.concealedWithoutCanasta
					? hand.rules.concealedWithoutCanastaBonus
					: 0)
			: 0;
	const seats: readonly Seat[] = [0, 1, 2, 3];
	const handCards = seats
		.filter((seat) => teamOf(seat) === team)
		.flatMap((seat) => hand.hands[seat] ?? []);
	const handPenalty = -handCards.reduce(
		(sum, card) => sum + cardPoints(card),
		0,
	);
	const total = melds + canastas + redThrees + outBonus + handPenalty;
	return {
		melds,
		canastaBonus: canastas,
		redThrees,
		outBonus,
		handPenalty,
		total,
	};
}
