import { teamOf } from "../canasta";
import {
	type ModernAction,
	type ModernHandState,
	modernApplyAction,
} from "../canasta/modern-hand";
import { modernOpeningCheck } from "../canasta/modern-opening";
import {
	MODERN_SPECIAL_HAND_SCORES,
	type ModernSpecialHandKind,
} from "../canasta/modern-special-hands";
import {
	modernScoreHand,
	modernTeamScore,
} from "../canasta/modern-special-scoring";
import { engineSeat, tableSeat, waitingText } from "../game/canasta";
import type { ModernState } from "../game/modern";
import { englishTranslator, type Translate } from "../i18n";
import { SEATS } from "../protocol";
import {
	type ActionOption,
	cardView,
	commandLines,
	emptyView,
	optionsFor,
	type SideView,
	seatViews,
	sideLabel,
	type TableView,
	type TableViewInput,
	translateWait,
} from "./table-model";

export type ModernTableInput = Omit<TableViewInput, "state"> & {
	readonly state: ModernState;
};

function option(
	action: ModernAction,
	hand: ModernHandState,
	t: Translate,
): ActionOption {
	const cards =
		action.type === "discard"
			? [action.card]
			: "cards" in action
				? action.cards
				: [];
	const labels: Record<ModernAction["type"], string> = {
		draw: "Draw a card from the stock",
		undo: "Undo the last action",
		retract: "Take back the last card",
		"commit-opening": "Complete the opening",
		"commit-pile": "Complete the pile pickup",
		"take-pile": "Take the discard pile",
		meld: "Lay down a meld",
		extend: "Add to a meld",
		discard: "Discard selected card",
		special: "Declare a special hand",
	};
	const specialNames: Record<ModernSpecialHandKind, string> = {
		"natural-pairs": "Natural pairs",
		"wild-pairs": "Wild pairs",
		"miami-pairs": "Miami pairs",
		garbage: "Garbage",
		"zip-code": "Zip code",
	};
	const meld =
		action.type === "extend"
			? hand.teams
					.flatMap((team) => team.melds)
					.find((item) => item.id === action.meldId)
			: undefined;
	const meldName = meld
		? meld.kind === "natural"
			? meld.rank
			: t("Wild cards")
		: "";
	const text =
		action.type === "extend"
			? `${t(labels[action.type])}: ${meldName}`
			: action.type === "special"
				? `${t(labels[action.type])}: ${t(specialNames[action.kind])}`
				: t(labels[action.type]);
	return {
		key: JSON.stringify(action),
		label: [{ kind: "text", text }],
		action,
		cards,
	};
}

export function modernTableView(input: ModernTableInput): TableView {
	const { state, seat, config } = input;
	const t = input.t ?? englishTranslator;
	const shared: TableViewInput = { ...input, state: null };
	const base = emptyView(shared, "waiting", "");
	const match = state.match;
	const dealWait = waitingText(SEATS, [...input.present]);
	if (!match)
		return {
			...base,
			target: 8500,
			heading: t("Lobby"),
			details: t("Table lobby"),
			prompt: dealWait
				? translateWait(dealWait, config.names, t, true)
				: t("The first hand is dealt now."),
			awaitingPlayer: dealWait !== undefined,
			seats: seatViews(shared, t, true, undefined, () => 0),
			lines: commandLines(shared, 0, undefined),
		};
	const hand = match.hand;
	const actor = tableSeat(hand.turn);
	const turnWait = waitingText([actor], [...input.present]);
	const lines = commandLines(shared, match.handNo, undefined);
	const phase =
		match.winner !== null
			? "complete"
			: hand.outcome !== null
				? "hand-over"
				: "play";
	const yourTurn =
		phase === "play" &&
		actor === seat &&
		!input.terminal &&
		!(input.bots?.has(seat) ?? false) &&
		!lines.some(
			(line) => line.state === "sending" || line.state === "pending",
		) &&
		turnWait === undefined;
	const candidates: ModernAction[] = [
		{ type: "draw" },
		{ type: "undo" },
		{ type: "retract" },
		{ type: "commit-opening" },
		{ type: "commit-pile" },
		...Object.keys(MODERN_SPECIAL_HAND_SCORES).map((kind) => ({
			type: "special" as const,
			kind: kind as ModernSpecialHandKind,
		})),
		...hand.hands[engineSeat(seat)].map((card) => ({
			type: "discard" as const,
			card: card.id,
		})),
	];
	const options = yourTurn
		? candidates
				.filter((action) => modernApplyAction(hand, hand.turn, action).ok)
				.map((action) => option(action, hand, t))
		: [];
	const ownSide = teamOf(engineSeat(seat));
	const side = (index: 0 | 1): SideView => {
		const team = hand.teams[index];
		const opening = modernOpeningCheck({
			teamScore: hand.teamScores[index],
			melds: team.melds.map((meld) => meld.cards),
			ineligible:
				teamOf(hand.turn) === index
					? hand.turnStart.pile.map((card) => card.id)
					: [],
		});
		const points = modernTeamScore({
			melds: team.melds.map((meld) => meld.cards),
			threes: team.threes,
			hands: [[], []],
			wentOut: false,
		});
		const tablePoints = points?.total ?? 0;
		return {
			label: sideLabel(index, t),
			owner: t(index === ownSide ? "ours" : "theirs"),
			score: match.scores[index],
			mine: index === ownSide,
			melds: team.melds.map((meld) => ({
				id: meld.id,
				rank: meld.kind === "natural" ? meld.rank : "JK",
				cards: meld.cards.map((card) => cardView(card, t)),
				canasta: meld.cards.length === 7,
			})),
			redThrees: team.threes.map((card) => cardView(card, t)),
			initialMade: team.opened,
			initialMeld: team.opened
				? ""
				: opening.points
					? t("First meld: {points} of {minimum} points", {
							points: opening.points,
							minimum: opening.minimum ?? 125,
						})
					: t("First meld: at least {minimum} points", {
							minimum: opening.minimum ?? 125,
						}),
			handPoints: t("Table points: {points}", { points: tablePoints }),
			handPointsDetail: t(
				"Table points exclude cards in hand and the going-out bonus.",
			),
			handSum: String(tablePoints),
		};
	};
	const scored = hand.outcome ? modernScoreHand(hand) : undefined;
	const rows = scored
		? (
				[
					["Melds", "melds"],
					["Canasta bonuses", "canastas"],
					["Threes", "threes"],
					["Special penalties", "specialPenalties"],
					["Cards in hand", "handPenalty"],
					["Going out", "outBonus"],
					["Special hand", "specialHand"],
					["Hand score", "total"],
				] as const
			).map(([label, key]) => ({
				label: t(label),
				values: [scored[0][key], scored[1][key]] as const,
			}))
		: [];
	const top = hand.pile.at(-1);
	return {
		...base,
		phase,
		handNo: match.handNo,
		at: state.actions,
		target: 8500,
		heading: t("Hand {number}", { number: match.handNo }),
		details: t("Dealer: {dealer}", {
			dealer: config.names[tableSeat(hand.dealer)],
		}),
		prompt:
			phase === "complete"
				? t("The match is over.")
				: phase === "hand-over"
					? t("The hand is over.")
					: turnWait
						? translateWait(turnWait, config.names, t)
						: yourTurn
							? t("Select cards to meld, extend, take the pile or discard.")
							: t("Waiting for {name}.", { name: config.names[actor] }),
		awaitingPlayer: turnWait !== undefined && phase === "play",
		yourTurn,
		sides: [side(0), side(1)],
		seats: seatViews(
			shared,
			t,
			false,
			phase === "play" ? actor : undefined,
			(owner) => hand.hands[engineSeat(owner)].length,
		),
		own: hand.hands[engineSeat(seat)].map((card) => cardView(card, t)),
		taken: actor === seat ? hand.turnTaken : [],
		stockCount: hand.stock.length,
		pile: {
			top: top ? cardView(top, t) : undefined,
			count: hand.pile.length,
			frozen: undefined,
			crosswise: undefined,
		},
		options,
		scoring: scored
			? {
					outcome: t("The hand is over."),
					rows: [...rows, { label: t("Match score"), values: match.scores }],
					countdown:
						phase === "hand-over" ? (input.scoringCountdown ?? 10) : undefined,
				}
			: undefined,
		winner:
			match.winner === null
				? ""
				: t(
						match.winner === ownSide
							? "Your side ({side}) won the match."
							: "Your side ({side}) lost the match.",
						{ side: sideLabel(ownSide, t) },
					),
		lines,
	};
}

export function modernSelectionOptions(
	input: ModernTableInput,
	view: TableView,
	selected: readonly string[],
): ActionOption[] {
	const shown = optionsFor(view.options, selected);
	const match = input.state.match;
	if (!view.yourTurn || !match || selected.length === 0) return shown;
	const actions: ModernAction[] = [
		{ type: "meld", cards: selected },
		...match.hand.teams[teamOf(engineSeat(input.seat))].melds.map((meld) => ({
			type: "extend" as const,
			meldId: meld.id,
			cards: selected,
		})),
		...(selected.length === 2
			? [{ type: "take-pile" as const, cards: selected }]
			: []),
	];
	return [
		...shown,
		...actions
			.filter(
				(action) =>
					modernApplyAction(match.hand, engineSeat(input.seat), action).ok,
			)
			.map((action) =>
				option(action, match.hand, input.t ?? englishTranslator),
			),
	];
}
