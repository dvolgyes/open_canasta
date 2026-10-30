import { expect, it } from "vitest";
import {
	chooseCanasta,
	inferCanasta,
	observeCanasta,
	sampleCanasta,
	searchActions,
} from "../../src/bot/canasta-search";
import {
	applyAction,
	buildDecks,
	mulberry32,
	newHand,
	type Seat,
} from "../../src/canasta";
import {
	cardFace,
	type PublicHistory,
	recordTransfer,
} from "../../src/game/canasta-history";

it("offers wild-only extensions to an existing meld without that natural rank in hand", () => {
	const deck = buildDecks();
	const kings = deck.filter((c) => c.rank === "K").slice(0, 6);
	const wild = required(deck.find((c) => c.id === "0-2C"));
	const own = [wild, required(deck.find((c) => c.id === "0-4C"))];
	const base = newHand({ seed: 10, dealer: 3, teamScores: [0, 0] });
	const snapshot = {
		...base,
		phase: "play" as const,
		hands: [own, [], [], []],
		pile: [],
		stock: deck.filter((c) => !own.includes(c) && !kings.includes(c)),
		teams: [
			{
				melds: [{ id: "kings", rank: "K" as const, team: 0, cards: kings }],
				redThrees: [],
				initialMade: true,
			},
			{ melds: [], redThrees: [], initialMade: false },
		] as const,
	};
	const hand = { ...snapshot, turnStart: snapshot };
	const expected = {
		type: "extend",
		meldId: "kings",
		cards: [wild.id],
	} as const;
	expect(applyAction(hand, 0, expected).ok).toBe(true);
	for (const rollout of [false, true]) {
		const actions = searchActions(hand, () => false, rollout);
		expect(actions).toContainEqual(expected);
		expect(
			actions.some((a) => a.type === "extend" && a.cards.length === 0),
		).toBe(false);
	}
});

it("avoids a meld that strands the last card even after the team's opening", async () => {
	const deck = buildDecks();
	const kings = deck.filter((c) => c.rank === "K").slice(0, 3);
	const own = [
		...deck.filter((c) => c.rank === "Q").slice(0, 3),
		required(deck.find((c) => c.id === "0-4C")),
	];
	const base = newHand({ seed: 10, dealer: 3, teamScores: [0, 0] });
	const snapshot = {
		...base,
		phase: "play" as const,
		hands: [own, [], [], []],
		pile: [],
		stock: deck.filter((c) => !own.includes(c) && !kings.includes(c)),
		teams: [
			{
				melds: [{ id: "kings", rank: "K" as const, team: 0, cards: kings }],
				redThrees: [],
				initialMade: true,
			},
			{ melds: [], redThrees: [], initialMade: false },
		] as const,
	};
	const hand = { ...snapshot, turnStart: snapshot };
	const result = await chooseCanasta(observeCanasta(hand, 0), {
		timeMs: 1000,
		maxIterations: 1,
		maxDepth: 1,
		rng: mulberry32(1),
	});
	expect(result.action?.type).toBe("discard");
});

it("keeps opening-point differences between a retained card and its pile duplicate", () => {
	const deck = buildDecks();
	const get = (id: string) => required(deck.find((c) => c.id === id));
	const own = ["0-KC", "0-KD", "0-KS", "0-4C"].map(get);
	const pile = ["1-KS", "0-KH"].map(get);
	const base = newHand({ seed: 10, dealer: 3, teamScores: [0, 0] });
	const snapshot = {
		...base,
		hands: [own, [], [], []],
		pile,
		stock: deck.filter((c) => !own.includes(c) && !pile.includes(c)),
	};
	const hand = { ...snapshot, turnStart: snapshot };
	const pickup = applyAction(hand, 0, {
		type: "takePile",
		cards: ["0-KC", "0-KD"],
	});
	if (!pickup.ok) throw new Error(pickup.reason);
	const extensions = searchActions(pickup.hand).filter(
		(a) => a.type === "extend" && a.cards.length === 1,
	);
	const points = extensions.map((action) => {
		const step = applyAction(pickup.hand, 0, action);
		if (!step.ok) throw new Error(step.reason);
		return step.hand.turnMeldPoints;
	});
	expect(new Set(points)).toEqual(new Set([30, 40]));
});

it("offers a complete natural canasta and remembers cards returned by reset", () => {
	const deck = buildDecks();
	const own = [
		...deck.filter((c) => c.rank === "K").slice(0, 7),
		required(deck.find((c) => c.id === "0-4C")),
	];
	const base = newHand({ seed: 10, dealer: 3, teamScores: [0, 0] });
	const empty = { melds: [], redThrees: [], initialMade: false };
	const snapshot = {
		...base,
		phase: "play" as const,
		hands: [own, [], [], []],
		pile: [],
		stock: deck.filter((c) => !own.includes(c)),
		teams: [empty, empty] as const,
	};
	const hand = { ...snapshot, turnStart: snapshot };
	const complete = searchActions(hand).find(
		(a) => a.type === "meld" && a.cards.length === 7,
	);
	expect(complete).toBeDefined();
	const melded = applyAction(hand, 0, required(complete));
	if (!melded.ok) throw new Error(melded.reason);
	let history = recordTransfer(undefined, hand, melded.hand, 0);
	const reset = applyAction(melded.hand, 0, { type: "resetTurn" });
	if (!reset.ok) throw new Error(reset.reason);
	history = recordTransfer(history, melded.hand, reset.hand, 0);
	const belief = inferCanasta(observeCanasta(reset.hand, 1, history));
	const knownKings = Object.entries(required(belief.players[0]).minimum)
		.filter(([f]) => f.startsWith("K"))
		.reduce((n, [, count]) => n + count, 0);
	expect(knownKings).toBe(7);
});

it("projects no hidden cards or stock order and samples complete, legal inventories", () => {
	const hand = newHand({ seed: 12, dealer: 3, teamScores: [0, 0] });
	const observation = observeCanasta(hand, 0);
	const altered = {
		...hand,
		stock: [...hand.stock].reverse(),
		hands: hand.hands.map((cards, i) =>
			i === 0 ? cards : [...cards].reverse(),
		),
	};
	expect(observeCanasta(altered, 0)).toEqual(observation);
	const belief = inferCanasta(observation);
	const stocks = new Set<string>();
	for (let seed = 0; seed < 12; seed++) {
		const sample = sampleCanasta(observation, belief, mulberry32(seed));
		const all = [
			...sample.hands.flat(),
			...sample.stock,
			...sample.pile,
			...sample.teams.flatMap((team) => [
				...team.redThrees,
				...team.melds.flatMap((m) => m.cards),
			]),
		];
		expect(all.map((c) => c.id).sort()).toEqual(
			buildDecks()
				.map((c) => c.id)
				.sort(),
		);
		expect(sample.hands[0]).toEqual(hand.hands[0]);
		expect(sample.hands.map((h) => h.length)).toEqual(
			hand.hands.map((h) => h.length),
		);
		stocks.add(sample.stock.map(cardFace).join());
	}
	expect(stocks.size).toBeGreaterThan(1);
});

it("keeps actual hands within inferred bounds throughout public transfers and retractions", () => {
	for (const seed of [14, 31, 85]) {
		let hand = newHand({ seed, dealer: 3, teamScores: [0, 0] });
		let history: PublicHistory | undefined;
		const rng = mulberry32(seed);
		for (let turn = 0; turn < 80 && !hand.outcome; turn++) {
			const actions = searchActions(hand);
			const action = required(actions[Math.floor(rng() * actions.length)]);
			const step = applyAction(hand, hand.turn, action);
			expect(step.ok).toBe(true);
			if (!step.ok) break;
			history = recordTransfer(history, hand, step.hand, hand.turn);
			hand = step.hand;
			for (const seat of [0, 1, 2, 3] as const) {
				const belief = inferCanasta(observeCanasta(hand, seat, history));
				for (let player = 0; player < 4; player++)
					for (const face of belief.faces) {
						const actual = required(hand.hands[player]).filter(
							(c) => cardFace(c) === face,
						).length;
						expect(actual).toBeGreaterThanOrEqual(
							required(required(belief.players[player]).minimum[face]),
						);
						expect(actual).toBeLessThanOrEqual(
							required(required(belief.players[player]).maximum[face]),
						);
					}
			}
		}
	}
}, 20000);

it("returns accepted decisions without changing the live state, within a short budget", async () => {
	for (const seed of [8, 19, 27]) {
		let hand = newHand({ seed, dealer: 3, teamScores: [0, 0] });
		for (let i = 0; i < 5 && !hand.outcome; i++) {
			const before = JSON.stringify(hand);
			const result = await chooseCanasta(
				observeCanasta(hand, hand.turn as Seat),
				{ timeMs: 25, rng: mulberry32(seed + i) },
			);
			expect(result.action).toBeDefined();
			expect(JSON.stringify(hand)).toBe(before);
			const step = applyAction(hand, hand.turn, required(result.action));
			expect(step.ok).toBe(true);
			if (step.ok) hand = step.hand;
		}
	}
});

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("missing required search data");
	return value;
}
