import { expect, it } from "vitest";
import { buildDecks, mulberry32, shuffle } from "../../src/canasta";
import {
	type ModernAction,
	type ModernHandState,
	type ModernNewHandInput,
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { modernScoreHand } from "../../src/canasta/modern-special-scoring";

it("deals 13 cards per player, exposes and replaces every three, and conserves the deck", () => {
	for (let seed = 0; seed < 64; seed++) {
		const result = modernNewHand({ seed, dealer: 2, teamScores: [0, 0] });
		if (!result.ok) throw new Error(result.reason);
		const hand = result.hand;
		expect(hand.rulesVersion).toBe("canasta-com-modern-v1");
		expect(hand.turn).toBe(3);
		expect(hand.phase).toBe("draw");
		expect(hand.pile).toEqual([]);
		for (const cards of hand.hands) {
			expect(cards).toHaveLength(13);
			expect(cards.every((card) => card.rank !== "3")).toBe(true);
		}
		const threes = hand.teams.flatMap((team) => team.threes);
		expect(threes.every((card) => card.rank === "3")).toBe(true);
		const all = [...hand.hands.flat(), ...hand.stock, ...hand.pile, ...threes];
		expect(all).toHaveLength(108);
		expect(new Set(all.map((card) => card.id)).size).toBe(108);
		expect(hand.stock).toHaveLength(56 - threes.length);
	}
});

it("deals every player's original hand before drawing replacements", () => {
	const seed = 42;
	const deck = shuffle(buildDecks(), mulberry32(seed));
	const result = modernNewHand({ seed, dealer: 3, teamScores: [0, 0] });
	if (!result.ok) throw new Error(result.reason);
	for (let seat = 0; seat < 4; seat++) {
		const original = deck
			.slice(seat * 13, (seat + 1) * 13)
			.filter((card) => card.rank !== "3");
		for (const card of original)
			expect(result.hand.hands[seat]?.map((item) => item.id)).toContain(
				card.id,
			);
	}
});

it("reproduces a deal from its seed and rejects invalid setup", () => {
	const input = {
		seed: 123,
		dealer: 1 as const,
		teamScores: [0, 1550] as const,
	};
	expect(modernNewHand(input)).toEqual(modernNewHand(input));
	expect(modernNewHand({ ...input, seed: -1 }).ok).toBe(false);
	expect(modernNewHand({ ...input, seed: Number.NaN }).ok).toBe(false);
	expect(
		modernNewHand({ ...input, teamScores: [0, Number.POSITIVE_INFINITY] }).ok,
	).toBe(false);
	expect(modernNewHand(null as unknown as ModernNewHandInput).ok).toBe(false);
	expect(
		modernNewHand({
			...input,
			teamScores: null,
		} as unknown as ModernNewHandInput).ok,
	).toBe(false);
	const scores: [number, number] = [0, 0];
	const copied = modernNewHand({ ...input, teamScores: scores });
	if (!copied.ok) throw new Error(copied.reason);
	scores[0] = 100;
	expect(copied.hand.teamScores).toEqual([0, 0]);
	const dealt = modernNewHand(input);
	if (!dealt.ok) throw new Error(dealt.reason);
	expect(
		modernApplyAction(
			{ ...dealt.hand, rulesVersion: "unknown" } as unknown as ModernHandState,
			dealt.hand.turn,
			{ type: "draw" },
		).ok,
	).toBe(false);
	expect(
		modernApplyAction(dealt.hand, dealt.hand.turn, {
			type: "unknown",
		} as unknown as ModernAction).ok,
	).toBe(false);
	expect(
		modernApplyAction(
			dealt.hand,
			dealt.hand.turn,
			null as unknown as ModernAction,
		).ok,
	).toBe(false);
	expect(modernApplyAction(dealt.hand, 0, { type: "draw" }).ok).toBe(false);
});

it("exposes a drawn three, draws a replacement, and keeps the draw after undo", () => {
	const dealt = modernNewHand({ seed: 0, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const three = dealt.hand.stock.find((card) => card.rank === "3");
	const replacement = dealt.hand.stock.find((card) => card.rank !== "3");
	if (!three || !replacement)
		throw new Error("fixture needs a three and replacement");
	const stock = [
		three,
		replacement,
		...dealt.hand.stock.filter(
			(card) => card.id !== three.id && card.id !== replacement.id,
		),
	];
	const before = { ...dealt.hand, stock };
	const result = modernApplyAction(before, 0, { type: "draw" });
	if (!result.ok) throw new Error(result.reason);
	expect(result.hand.hands[0].map((card) => card.id)).toContain(replacement.id);
	expect(result.hand.teams[0].threes.map((card) => card.id)).toContain(
		three.id,
	);
	expect(result.hand.stock).toHaveLength(stock.length - 2);
	expect(result.hand.turnStart.hands[0]).toEqual(result.hand.hands[0]);
	expect(modernApplyAction(result.hand, 0, { type: "undo" }).ok).toBe(false);
});

it("ends the hand immediately when the last drawn card is a three", () => {
	const dealt = modernNewHand({ seed: 0, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const three = dealt.hand.stock.find((card) => card.rank === "3");
	if (!three) throw new Error("fixture needs a three");
	const before = { ...dealt.hand, stock: [three] };
	const result = modernApplyAction(before, 0, { type: "draw" });
	if (!result.ok) throw new Error(result.reason);
	expect(result.hand.outcome).toEqual({ kind: "stock" });
	expect(result.hand.hands[0].map((card) => card.id)).toContain(three.id);
	expect(result.hand.teams[0].threes.map((card) => card.id)).not.toContain(
		three.id,
	);
	expect(result.hand.stock).toEqual([]);
});

it("melds and retracts a legal seven group without undoing the stock draw", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const ids = ["0-7C", "1-7C", "0-7D", "0-7H", "0-4C"];
	const deck = buildDecks();
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const stock = deck.filter((card) => !ids.includes(card.id));
	const baseline = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock,
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...baseline, turnStart: baseline, undo: [] };
	const meld = modernApplyAction(hand, 0, {
		type: "meld",
		cards: ids.slice(0, 3),
	});
	if (!meld.ok) throw new Error(meld.reason);
	expect(meld.hand.hands[0].map((card) => card.id)).toEqual(["0-7H", "0-4C"]);
	expect(meld.hand.teams[0].melds[0]).toMatchObject({
		kind: "natural",
		rank: "7",
	});
	const extended = modernApplyAction(meld.hand, 0, {
		type: "extend",
		meldId: "m1",
		cards: ["0-7H"],
	});
	if (!extended.ok) throw new Error(extended.reason);
	expect(extended.hand.teams[0].melds[0]?.cards).toHaveLength(4);
	const firstUndo = modernApplyAction(extended.hand, 0, { type: "undo" });
	if (!firstUndo.ok) throw new Error(firstUndo.reason);
	expect(firstUndo.hand.hands).toEqual(meld.hand.hands);
	expect(firstUndo.hand.teams).toEqual(meld.hand.teams);
	const undone = modernApplyAction(firstUndo.hand, 0, { type: "undo" });
	if (!undone.ok) throw new Error(undone.reason);
	expect(undone.hand.hands).toEqual(hand.hands);
	expect(undone.hand.stock).toEqual(stock);
	expect(undone.hand.teams).toEqual(hand.teams);
});

it("commits a valid opening and permits undo before the turn ends", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const ids = [
		"0-AC",
		"0-AD",
		"0-AH",
		"0-KC",
		"0-KD",
		"0-KH",
		"0-KS",
		"0-7C",
		"0-7D",
		"0-7H",
		"0-7S",
		"1-7C",
		"0-2C",
		"0-5C",
	];
	const deck = buildDecks();
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const baseline = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	let hand: ModernHandState = { ...baseline, turnStart: baseline, undo: [] };
	for (const group of [ids.slice(0, 3), ids.slice(3, 7), ids.slice(7, 12)]) {
		const step = modernApplyAction(hand, 0, { type: "meld", cards: group });
		if (!step.ok) throw new Error(step.reason);
		hand = step.hand;
	}
	expect(hand.teams[0].opened).toBe(false);
	const discarded = modernApplyAction(hand, 0, {
		type: "discard",
		card: "0-5C",
	});
	if (!discarded.ok) throw new Error(discarded.reason);
	expect(discarded.hand.teams[0].opened).toBe(true);
	expect(discarded.hand.turn).toBe(1);
	expect(discarded.hand.bonuses[0]).toHaveLength(4);
	expect(discarded.hand.stock).toHaveLength(hand.stock.length - 4);
	const all = [
		...discarded.hand.hands.flat(),
		...discarded.hand.stock,
		...discarded.hand.pile,
		...discarded.hand.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((meld) => meld.cards),
		]),
		...discarded.hand.bonuses.flat(),
	];
	expect(all).toHaveLength(108);
	expect(new Set(all.map((card) => card.id)).size).toBe(108);
	const committed = modernApplyAction(hand, 0, { type: "commit-opening" });
	if (!committed.ok) throw new Error(committed.reason);
	expect(committed.hand.teams[0].opened).toBe(true);
	expect(
		modernApplyAction(committed.hand, 0, {
			type: "extend",
			meldId: "m2",
			cards: ["0-2C"],
		}).ok,
	).toBe(false);
	const undone = modernApplyAction(committed.hand, 0, { type: "undo" });
	if (!undone.ok) throw new Error(undone.reason);
	expect(undone.hand.teams[0].opened).toBe(false);
	expect(
		modernApplyAction(undone.hand, 0, {
			type: "extend",
			meldId: "m2",
			cards: ["0-2C"],
		}).ok,
	).toBe(true);
});

it("preserves bonus cards when the stock runs out during their replacement", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const take = (ids: readonly string[]) =>
		ids.map((id) => {
			const card = deck.find((item) => item.id === id);
			if (!card) throw new Error(`missing ${id}`);
			return card;
		});
	const allocated = ["0-4C", "0-5C", "0-6C", "0-3H", "0-3D", "0-8C"];
	const baseline = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [
			take(["0-4C", "0-5C"]),
			take(["0-6C"]),
			deck.filter((card) => !allocated.includes(card.id)),
			[],
		] as const,
		stock: take(["0-8C"]),
		bonuses: [[], take(["0-3H", "0-3D"]), [], []] as const,
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...baseline, turnStart: baseline, undo: [] };
	const step = modernApplyAction(hand, 0, { type: "discard", card: "0-4C" });
	if (!step.ok) throw new Error(step.reason);
	expect(step.hand.outcome).toEqual({ kind: "stock" });
	expect(step.hand.teams[1].threes.map((card) => card.id)).toContain("0-3H");
	expect(step.hand.hands[1].map((card) => card.id)).toContain("0-3D");
	expect(step.hand.bonuses[1]).toEqual([]);
	const all = [
		...step.hand.hands.flat(),
		...step.hand.stock,
		...step.hand.pile,
		...step.hand.teams.flatMap((team) => team.threes),
		...step.hand.bonuses.flat(),
	];
	expect(all).toHaveLength(108);
	expect(new Set(all.map((card) => card.id)).size).toBe(108);
});

it("counts unrevealed bonus cards in their owner's hand when the hand ends", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const aces = deck.filter((card) => card.rank === "A").slice(0, 3);
	const ids = new Set(aces.map((card) => card.id));
	const threes = deck.filter((card) => card.rank === "3");
	const others = deck.filter((card) => card.rank !== "3" && !ids.has(card.id));
	const hand = {
		...dealt.hand,
		hands: [others, aces.slice(0, 2), [], []] as const,
		bonuses: [[], aces.slice(2), [], []] as const,
		stock: [],
		pile: [],
		teams: [
			{ melds: [], threes, opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
		outcome: { kind: "stock" as const },
	};
	const scores = modernScoreHand(hand);
	expect(scores?.[1]).toMatchObject({
		handPenalty: -60,
		specialPenalties: -1500,
		total: -1560,
	});
	expect(
		modernScoreHand({
			...hand,
			bonuses: [aces.slice(0, 1), aces.slice(2), [], []],
		}),
	).toBeUndefined();
});

it("requires an opening before giving the remaining pile to an unopened team", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (ids: readonly string[]) =>
		ids.map((id) => {
			const card = deck.find((item) => item.id === id);
			if (!card) throw new Error(`missing ${id}`);
			return card;
		});
	const own = [
		"0-8C",
		"0-8D",
		"0-AC",
		"0-AD",
		"0-AH",
		"0-KC",
		"0-KD",
		"0-KH",
		"0-KS",
		"0-7C",
		"0-7D",
		"0-7H",
		"0-7S",
		"1-7C",
		"0-5C",
	];
	const pile = ["0-6C", "1-8C"];
	const baseline = {
		...dealt.hand.turnStart,
		hands: [get(own), [], [], []] as const,
		pile: get(pile),
		stock: deck.filter((card) => ![...own, ...pile].includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: false },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	let hand: ModernHandState = { ...baseline, turnStart: baseline, undo: [] };
	const picked = modernApplyAction(hand, 0, {
		type: "take-pile",
		cards: ["0-8C", "0-8D"],
	});
	if (!picked.ok) throw new Error(picked.reason);
	hand = picked.hand;
	expect(hand.phase).toBe("pile-opening");
	expect(hand.hands[0].map((card) => card.id)).not.toContain("0-6C");
	expect(
		modernApplyAction(hand, 0, {
			type: "commit-pile",
		}).ok,
	).toBe(false);
	for (const cards of [own.slice(2, 5), own.slice(5, 9), own.slice(9, 14)]) {
		const step = modernApplyAction(hand, 0, { type: "meld", cards });
		if (!step.ok) throw new Error(step.reason);
		hand = step.hand;
	}
	const committed = modernApplyAction(hand, 0, {
		type: "commit-pile",
	});
	if (!committed.ok) throw new Error(committed.reason);
	expect(committed.hand.phase).toBe("play");
	expect(committed.hand.teams[0].opened).toBe(true);
	expect(committed.hand.hands[0].map((card) => card.id)).toContain("0-6C");
	expect(committed.hand.pile).toEqual([]);
	expect(committed.hand.turnTaken).toEqual(pile);
	const undo = modernApplyAction(committed.hand, 0, { type: "undo" });
	if (!undo.ok) throw new Error(undo.reason);
	expect(undo.hand.phase).toBe("pile-opening");
	expect(undo.hand.pile.map((card) => card.id)).toEqual(["0-6C"]);
	const discarded = modernApplyAction(committed.hand, 0, {
		type: "discard",
		card: "0-5C",
	});
	if (!discarded.ok) throw new Error(discarded.reason);
	expect(discarded.hand.bonuses[0]).toEqual([]);
	expect(
		modernScoreHand({ ...discarded.hand, outcome: { kind: "stock" } }),
	).toBeDefined();
});

it("takes the pile immediately after opening and rejects an overfull matching meld", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (ids: readonly string[]) =>
		ids.map((id) => {
			const card = deck.find((item) => item.id === id);
			if (!card) throw new Error(`missing ${id}`);
			return card;
		});
	const own = ["0-8C", "0-8D", "0-5C"];
	const pile = ["0-6C", "1-8C"];
	const meld = ["0-8H", "0-8S", "1-8D", "1-8H"];
	const baseline = {
		...dealt.hand.turnStart,
		hands: [get(own), [], [], []] as const,
		pile: get(pile),
		stock: deck.filter((card) => ![...own, ...pile, ...meld].includes(card.id)),
		teams: [
			{
				melds: [
					{
						id: "m1",
						kind: "natural" as const,
						rank: "8" as const,
						cards: get(meld),
					},
				],
				threes: [],
				opened: true,
			},
			{ melds: [], threes: [], opened: false },
		] as const,
		nextMeldNo: 2,
	};
	const hand: ModernHandState = { ...baseline, turnStart: baseline, undo: [] };
	const action: ModernAction = { type: "take-pile", cards: own.slice(0, 2) };
	const step = modernApplyAction(hand, 0, action);
	if (!step.ok) throw new Error(step.reason);
	expect(step.hand.phase).toBe("play");
	expect(step.hand.pile).toEqual([]);
	expect(step.hand.teams[0].melds[0]?.cards).toHaveLength(7);
	expect(step.hand.hands[0].map((card) => card.id)).toEqual(["0-5C", "0-6C"]);
	const undone = modernApplyAction(step.hand, 0, { type: "undo" });
	if (!undone.ok) throw new Error(undone.reason);
	expect(undone.hand.pile).toEqual(hand.pile);
	expect(undone.hand.hands).toEqual(hand.hands);
	const overfull = {
		...hand,
		teams: [
			{
				...hand.teams[0],
				melds: [
					{
						id: "m1",
						kind: "natural" as const,
						rank: "8" as const,
						cards: get([...meld, "1-8S"]),
					},
				],
			},
			hand.teams[1],
		] as const,
	};
	expect(modernApplyAction(overfull, 0, action).ok).toBe(false);
	expect(
		modernApplyAction(hand, 0, { type: "take-pile", cards: ["0-8C", "0-8C"] })
			.ok,
	).toBe(false);
});

it("returns the last melded card to make a legal discard on an empty pile", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const ids = ["0-8C", "0-8D", "0-8H", "0-8S", "0-7C", "0-AC"];
	const own = ids.map((id) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	});
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own, [], [], []] as const,
		stock: deck.filter((card) => !ids.includes(card.id)),
		teams: [
			{ melds: [], threes: [], opened: true },
			{ melds: [], threes: [], opened: false },
		] as const,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const meld = modernApplyAction(hand, 0, {
		type: "meld",
		cards: ids.slice(0, 4),
	});
	if (!meld.ok) throw new Error(meld.reason);
	expect(
		modernApplyAction(meld.hand, 0, { type: "discard", card: "0-7C" }).ok,
	).toBe(false);
	const retracted = modernApplyAction(meld.hand, 0, { type: "retract" });
	if (!retracted.ok) throw new Error(retracted.reason);
	expect(
		retracted.hand.teams[0].melds[0]?.cards.map((card) => card.id),
	).toEqual(ids.slice(0, 3));
	expect(retracted.hand.hands[0].map((card) => card.id)).toContain("0-8S");
	expect(
		modernApplyAction(retracted.hand, 0, { type: "discard", card: "0-8S" }).ok,
	).toBe(true);
	const further = modernApplyAction(retracted.hand, 0, { type: "retract" });
	if (!further.ok) throw new Error(further.reason);
	expect(further.hand.hands).toEqual(hand.hands);
	expect(further.hand.teams).toEqual(hand.teams);
	const all = [
		...retracted.hand.hands.flat(),
		...retracted.hand.stock,
		...retracted.hand.pile,
		...retracted.hand.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((item) => item.cards),
		]),
	];
	expect(all).toHaveLength(108);
	expect(new Set(all.map((card) => card.id)).size).toBe(108);
});

it("retracts an extension in order, including an identical card face", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const meld = ["0-8C", "0-8D", "0-8H"];
	const own = ["0-8S", "1-8C", "0-4C"];
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own.map(get), [], [], []] as const,
		stock: deck.filter((card) => ![...meld, ...own].includes(card.id)),
		teams: [
			{
				opened: true,
				threes: [],
				melds: [
					{
						id: "m1",
						kind: "natural" as const,
						rank: "8" as const,
						cards: meld.map(get),
					},
				],
			},
			{ opened: false, threes: [], melds: [] },
		] as const,
		nextMeldNo: 2,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const extended = modernApplyAction(hand, 0, {
		type: "extend",
		meldId: "m1",
		cards: own.slice(0, 2),
	});
	if (!extended.ok) throw new Error(extended.reason);
	const first = modernApplyAction(extended.hand, 0, { type: "retract" });
	if (!first.ok) throw new Error(first.reason);
	expect(first.hand.hands[0].map((card) => card.id)).toContain("1-8C");
	expect(first.hand.teams[0].melds[0]?.cards.map((card) => card.id)).toContain(
		"0-8C",
	);
	const second = modernApplyAction(first.hand, 0, { type: "retract" });
	if (!second.ok) throw new Error(second.reason);
	expect(second.hand.hands).toEqual(hand.hands);
	expect(second.hand.teams).toEqual(hand.teams);
});

it("orders post-opening additions so naturals precede a newly legal wild", () => {
	const dealt = modernNewHand({ seed: 1, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	const deck = buildDecks();
	const get = (id: string) => {
		const card = deck.find((item) => item.id === id);
		if (!card) throw new Error(`missing ${id}`);
		return card;
	};
	const meld = ["0-8C", "0-8D", "0-8H"];
	const own = ["0-2C", "0-8S", "1-8C", "0-4C"];
	const base = {
		...dealt.hand.turnStart,
		phase: "play" as const,
		hands: [own.map(get), [], [], []] as const,
		stock: deck.filter((card) => ![...meld, ...own].includes(card.id)),
		teams: [
			{
				opened: true,
				threes: [],
				melds: [
					{
						id: "m1",
						kind: "natural" as const,
						rank: "8" as const,
						cards: meld.map(get),
					},
				],
			},
			{ opened: false, threes: [], melds: [] },
		] as const,
		nextMeldNo: 2,
	};
	const hand = { ...base, turnStart: base, undo: [] };
	const extended = modernApplyAction(hand, 0, {
		type: "extend",
		meldId: "m1",
		cards: own.slice(0, 3),
	});
	if (!extended.ok) throw new Error(extended.reason);
	const retracted = modernApplyAction(extended.hand, 0, { type: "retract" });
	if (!retracted.ok) throw new Error(retracted.reason);
	expect(retracted.hand.hands[0].map((card) => card.id)).toContain("0-2C");
	expect(retracted.hand.teams[0].melds[0]?.cards).toHaveLength(5);
});
