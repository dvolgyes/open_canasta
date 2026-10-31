import { expect, it } from "vitest";
import {
	type CardBelief,
	type CardTransfer,
	inferCards,
} from "../../src/bot/card-knowledge";
import {
	type ExactCardEvent,
	type ExactCardWorld,
	exactCardHistory,
	uniformDiscardLikelihood,
} from "../../src/bot/research/exact-card-history";

function expectPossibleWorlds(
	belief: CardBelief,
	worlds: readonly ExactCardWorld[],
): void {
	for (const world of worlds) {
		for (const [index, cards] of world.rows.entries()) {
			const bounds = belief.players[index + 1];
			if (!bounds) throw new Error("missing inferred row");
			for (const face of belief.faces) {
				const count = cards.filter((card) => card === face).length;
				expect(count).toBeGreaterThanOrEqual(bounds.minimum[face] ?? 0);
				expect(count).toBeLessThanOrEqual(bounds.maximum[face] ?? 0);
			}
		}
	}
}

it("keeps every possible duplicate-card history within its conservative bounds", () => {
	for (const discard of ["A", "B", "C", "D"] as const) {
		for (const transfer of ["none", "forward", "reverse"] as const) {
			const events: ExactCardEvent[] = [
				{ kind: "gain", player: 0, faces: ["A"] },
				{ kind: "discard", player: 0, face: discard },
				...(transfer !== "none"
					? [
							{
								kind: "hidden-transfer" as const,
								from: transfer === "forward" ? 0 : 1,
								to: transfer === "forward" ? 1 : 0,
							},
						]
					: []),
			];
			const exact = exactCardHistory({
				unknown: ["A", "B", "C", "D"],
				publicCards: ["A"],
				rowCounts: [2, 2],
				events,
				discardLikelihood: uniformDiscardLikelihood,
				maxStates: 1000,
			});
			if (!exact.ok) throw new Error(exact.reason);
			const transfers: CardTransfer[] = [
				{ player: 1, gained: ["A"], removed: [], drawn: 0 },
				{ player: 1, gained: [], removed: [discard], drawn: 0 },
				...(transfer !== "none"
					? [
							{
								player: transfer === "forward" ? 1 : 2,
								gained: [],
								removed: [],
								drawn: 0,
								unknownRemoved: 1,
							},
							{
								player: transfer === "forward" ? 2 : 1,
								gained: [],
								removed: [],
								drawn: 1,
							},
						]
					: []),
			];
			const belief = inferCards({
				deck: ["A", "A", "B", "C", "D", "E"],
				observer: 0,
				own: ["E"],
				publicCards: [discard],
				counts:
					transfer === "forward"
						? [1, 1, 3]
						: transfer === "reverse"
							? [1, 3, 1]
							: [1, 2, 2],
				history: { initialCounts: [1, 2, 2], events: transfers },
			});
			expectPossibleWorlds(belief, exact.worlds);
		}
	}
});

it("retains possible hands after a public card is taken and discarded again", () => {
	for (const first of ["A", "B", "C", "D"] as const) {
		for (const second of ["A", "B", "C", "D"] as const) {
			const exact = exactCardHistory({
				unknown: ["A", "B", "C", "D"],
				publicCards: ["A"],
				rowCounts: [2, 2],
				events: [
					{ kind: "gain", player: 0, faces: ["A"] },
					{ kind: "discard", player: 0, face: first },
					{ kind: "gain", player: 1, faces: [first] },
					{ kind: "discard", player: 1, face: second },
				],
				discardLikelihood: uniformDiscardLikelihood,
				maxStates: 1000,
			});
			if (!exact.ok) throw new Error(exact.reason);
			const belief = inferCards({
				deck: ["A", "A", "B", "C", "D", "E"],
				observer: 0,
				own: ["E"],
				publicCards: [second],
				counts: [1, 2, 2],
				history: {
					initialCounts: [1, 2, 2],
					events: [
						{ player: 1, gained: ["A"], removed: [], drawn: 0 },
						{ player: 1, gained: [], removed: [first], drawn: 0 },
						{ player: 2, gained: [first], removed: [], drawn: 0 },
						{ player: 2, gained: [], removed: [second], drawn: 0 },
					],
				},
			});
			expectPossibleWorlds(belief, exact.worlds);
		}
	}
});
