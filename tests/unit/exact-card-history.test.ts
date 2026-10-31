import { expect, it } from "vitest";
import {
	exactCardHistory,
	uniformDiscardLikelihood,
} from "../../src/bot/research/exact-card-history";

it("conditions duplicate-face histories on an explicit discard model", () => {
	const contexts: {
		player: number;
		eventIndex: number;
		publicCards: readonly string[];
	}[] = [];
	const result = exactCardHistory({
		unknown: ["A", "B", "C"],
		rowCounts: [1, 2],
		publicCards: ["A"],
		events: [
			{ kind: "gain", player: 0, faces: ["A"] },
			{ kind: "discard", player: 0, face: "A" },
		],
		discardLikelihood: (hand, face, context) => {
			contexts.push(context);
			return uniformDiscardLikelihood(hand, face);
		},
		maxStates: 100,
	});
	if (!result.ok) throw new Error(result.reason);
	expect(contexts.length).toBeGreaterThan(0);
	expect(
		contexts.every(
			(context) =>
				context.player === 0 &&
				context.eventIndex === 1 &&
				context.publicCards.length === 0,
		),
	).toBe(true);
	expect(result.evidenceProbability).toBeCloseTo(2 / 3);
	expect(
		result.worlds.reduce((sum, world) => sum + world.probability, 0),
	).toBeCloseTo(1);
	const probability = result.worlds.reduce(
		(sum, world) =>
			sum + (world.rows[0]?.includes("A") ? world.probability : 0),
		0,
	);
	expect(probability).toBeCloseTo(0.5);
	expect(
		result.worlds.every((world) => world.publicCards.join(",") === "A"),
	).toBe(true);
	for (const world of result.worlds) {
		expect([...world.rows.flat(), ...world.publicCards].sort()).toEqual([
			"A",
			"A",
			"B",
			"C",
		]);
	}
	const preferA = exactCardHistory({
		unknown: ["A", "B", "C"],
		rowCounts: [1, 2],
		publicCards: ["A"],
		events: [
			{ kind: "gain", player: 0, faces: ["A"] },
			{ kind: "discard", player: 0, face: "A" },
		],
		discardLikelihood: (hand, face) =>
			hand.includes("A")
				? Number(face === "A")
				: uniformDiscardLikelihood(hand, face),
		maxStates: 100,
	});
	if (!preferA.ok) throw new Error(preferA.reason);
	expect(
		preferA.worlds.reduce(
			(sum, world) =>
				sum + (world.rows[0]?.includes("A") ? world.probability : 0),
			0,
		),
	).toBeCloseTo(1 / 3);
});

it("weights identical physical copies and conditions an observed hand", () => {
	const input = {
		unknown: ["A", "A", "B"],
		rowCounts: [0, 3],
		publicCards: [],
		events: [{ kind: "hidden-transfer" as const, from: 1, to: 0 }],
		discardLikelihood: uniformDiscardLikelihood,
		maxStates: 100,
	};
	const result = exactCardHistory(input);
	if (!result.ok) throw new Error(result.reason);
	const probability = result.worlds.reduce(
		(sum, world) =>
			sum + (world.rows[0]?.includes("A") ? world.probability : 0),
		0,
	);
	expect(probability).toBeCloseTo(2 / 3);
	const observed = exactCardHistory({
		...input,
		events: [...input.events, { kind: "observe", player: 0, faces: ["A"] }],
	});
	if (!observed.ok) throw new Error(observed.reason);
	expect(
		observed.worlds.every((world) => world.rows[0]?.join(",") === "A"),
	).toBe(true);
});

it("weights initial unordered hands by physical-copy multiplicity", () => {
	const input = {
		unknown: ["A", "A", "B", "C"],
		rowCounts: [2, 2],
		publicCards: [],
		events: [],
		discardLikelihood: uniformDiscardLikelihood,
		maxStates: 100,
	};
	const result = exactCardHistory(input);
	if (!result.ok) throw new Error(result.reason);
	const bothA = result.worlds.reduce(
		(sum, world) =>
			sum +
			(world.rows[0]?.filter((face) => face === "A").length === 2
				? world.probability
				: 0),
		0,
	);
	expect(bothA).toBeCloseTo(1 / 6);
	const observed = exactCardHistory({
		...input,
		events: [{ kind: "observe", player: 0, faces: ["A", "B"] }],
	});
	if (!observed.ok) throw new Error(observed.reason);
	expect(observed.evidenceProbability).toBeCloseTo(1 / 3);
	expect(observed.worlds).toHaveLength(1);
});

it("matches independent labelled-deal enumeration after an observed discard", () => {
	const labelled = ["A1", "A2", "B1", "B2", "C1"];
	let evidence = 0;
	let retainsA = 0;
	for (let i = 0; i < labelled.length; i++) {
		for (let j = i + 1; j < labelled.length; j++) {
			const hand = [labelled[i], labelled[j]];
			const aCount = hand.filter((card) => card?.startsWith("A")).length;
			const mass = aCount / 2 / 10;
			evidence += mass;
			if (aCount === 2) retainsA += mass;
		}
	}
	const result = exactCardHistory({
		unknown: ["A", "A", "B", "B", "C"],
		rowCounts: [2, 3],
		publicCards: [],
		events: [{ kind: "discard", player: 0, face: "A" }],
		discardLikelihood: uniformDiscardLikelihood,
		maxStates: 100,
	});
	if (!result.ok) throw new Error(result.reason);
	expect(result.evidenceProbability).toBeCloseTo(evidence);
	const posterior = result.worlds.reduce(
		(sum, world) =>
			sum + (world.rows[0]?.includes("A") ? world.probability : 0),
		0,
	);
	expect(posterior).toBeCloseTo(retainsA / evidence);
});

it("reports impossible evidence, invalid likelihoods, and state limits as data", () => {
	const input = {
		unknown: ["A", "B", "C"],
		rowCounts: [1, 2],
		publicCards: [],
		discardLikelihood: uniformDiscardLikelihood,
		maxStates: 100,
	};
	expect(
		exactCardHistory({
			...input,
			events: [{ kind: "discard", player: 0, face: "D" }],
		}),
	).toEqual({ ok: false, reason: "impossible evidence" });
	expect(
		exactCardHistory({
			...input,
			events: [{ kind: "discard", player: 0, face: "A" }],
			discardLikelihood: () => 2,
		}),
	).toEqual({ ok: false, reason: "invalid likelihood" });
	expect(
		exactCardHistory({
			...input,
			events: [
				{ kind: "gain", player: 0, faces: ["A"] },
				{ kind: "discard", player: 0, face: "A" },
			],
			publicCards: ["A"],
			discardLikelihood: () => 0.2,
		}),
	).toEqual({ ok: false, reason: "invalid likelihood" });
	expect(exactCardHistory({ ...input, events: [], maxStates: 1 })).toEqual({
		ok: false,
		reason: "state limit exceeded",
	});
	expect(
		exactCardHistory({
			...input,
			rowCounts: [0, 3],
			events: [{ kind: "hidden-transfer", from: 1, to: 0 }],
			maxStates: 1,
		}),
	).toEqual({ ok: false, reason: "state limit exceeded" });
	expect(exactCardHistory({ ...input, events: [], rowCounts: [1, 1] })).toEqual(
		{ ok: false, reason: "invalid input" },
	);
	expect(
		exactCardHistory({
			unknown: ["B"],
			rowCounts: [1],
			publicCards: ["A"],
			events: [
				{ kind: "gain", player: 0, faces: ["A"] },
				{ kind: "discard", player: 0, face: "A" },
				{ kind: "gain", player: 0, faces: ["A"] },
				{ kind: "discard", player: 0, face: "A" },
			],
			discardLikelihood: (_hand, face) => (face === "A" ? 1e-300 : 1),
			maxStates: 100,
		}),
	).toEqual({ ok: false, reason: "numeric underflow" });
});
