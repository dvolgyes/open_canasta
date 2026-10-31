import { expect, it } from "vitest";
import { buildDecks, type Card } from "../../src/canasta";
import { modernMeldTransition } from "../../src/canasta/modern-melds";

const deck = buildDecks();
const cards = (ids: readonly string[]): Card[] =>
	ids.map((id) => {
		const card = deck.find((candidate) => candidate.id === id);
		if (!card) throw new Error(`missing card ${id}`);
		return card;
	});
const check = (
	added: readonly string[],
	options: {
		previous?: readonly string[];
		opening?: boolean;
		closedRanks?: readonly ("7" | "K")[];
		unfinishedWildMeld?: boolean;
	} = {},
) =>
	modernMeldTransition({
		previous: cards(options.previous ?? []),
		added: cards(added),
		opening: options.opening ?? false,
		closedRanks: options.closedRanks ?? [],
		unfinishedWildMeld: options.unfinishedWildMeld ?? false,
	});

it("requires pure sevens, seven-card maximum, and distinct physical cards", () => {
	expect(check(["0-7C", "0-7D", "0-7H"]).ok).toBe(true);
	expect(check(["0-7C", "0-7D", "0-2C"], { opening: true }).ok).toBe(false);
	expect(
		check(["0-7C", "0-7D", "0-7H", "0-7S", "1-7C", "1-7D", "1-7H"]).ok,
	).toBe(true);
	expect(
		check(["0-7C", "0-7D", "0-7H", "0-7S", "1-7C", "1-7D", "1-7H", "1-7S"]).ok,
	).toBe(false);
	expect(check(["0-7C", "0-7C", "0-7D"]).ok).toBe(false);
});

it("allows wilds in opening melds and after five naturals, but keeps pure aces pure", () => {
	expect(check(["0-KC", "0-KD", "0-2C"], { opening: true }).ok).toBe(true);
	expect(check(["0-KC", "0-KD", "0-2C"]).ok).toBe(false);
	expect(
		check(["0-2C"], { previous: ["0-KC", "0-KD", "0-KH", "0-KS", "1-KC"] }).ok,
	).toBe(true);
	expect(check(["0-AC", "0-AD", "0-2C"], { opening: true }).ok).toBe(true);
	expect(
		check(["0-2C"], {
			previous: ["0-AC", "0-AD", "0-AH", "0-AS", "1-AC"],
			opening: true,
		}).ok,
	).toBe(false);
	expect(
		check(["0-2C", "0-2D", "0-JK0"], {
			previous: ["0-KC", "0-KD", "0-KH", "0-KS", "1-KC"],
			opening: true,
		}).ok,
	).toBe(false);
});

it("enforces the team's wild-meld commitment and globally closed ranks", () => {
	expect(check(["0-2C", "0-2D", "0-JK0"]).ok).toBe(true);
	expect(
		check(["0-2H"], {
			previous: ["0-2C", "0-2D", "0-JK0"],
			unfinishedWildMeld: true,
		}).ok,
	).toBe(true);
	expect(
		check(["0-KC", "0-KD", "0-2C"], { opening: true, unfinishedWildMeld: true })
			.ok,
	).toBe(false);
	expect(check(["0-KC", "0-KD", "0-KH"], { closedRanks: ["K"] }).ok).toBe(
		false,
	);
	expect(check(["0-3C", "0-3D", "0-3H"]).ok).toBe(false);
});
