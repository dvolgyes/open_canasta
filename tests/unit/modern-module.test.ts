import { expect, it } from "vitest";
import { modernApplyAction } from "../../src/canasta/modern-hand";
import {
	createCanastaModule,
	resetRequestPayload,
	resetVotePayload,
	startPayload,
} from "../../src/game/canasta";
import { chatPayload } from "../../src/game/chat";
import { parseModernAction } from "../../src/game/modern";
import { parseModernMatch } from "../../src/game/modern-state";
import type { ApplyContext } from "../../src/game/module";
import {
	PROTOCOL_VERSION,
	SEATS,
	type Seat,
	type TableConfig,
} from "../../src/protocol";

const tableId = "modern-table";
const commandId = "00000000-0000-4000-8000-000000000001";
const config = {
	names: { N: "North", E: "East", S: "South", W: "West" },
	rules: "modern",
} as unknown as TableConfig;
const module = createCanastaModule(() => 0);

function context(seat: Seat, present: readonly Seat[] = SEATS): ApplyContext {
	return {
		tableId,
		config,
		seat,
		present,
		holder: `holder-${seat}`,
		commandId,
		seq: 1,
	};
}

it("starts and validates a modern table, then accepts a legal action from its acting seat", () => {
	const initial = module.initialState(tableId, config);
	expect(initial.game).toBe("canasta-modern");
	expect(module.isState(initial, tableId)).toBe(true);
	const absent = module.apply(
		initial,
		context("N", ["N"]),
		startPayload(tableId),
	);
	expect(absent.ok).toBe(false);
	const started = module.apply(initial, context("N"), startPayload(tableId));
	if (!started.ok) throw new Error(started.reason);
	const match = parseModernMatch(started.state.match);
	if (!match) throw new Error("no valid modern match");
	const seat = SEATS[match.hand.turn];
	if (!seat) throw new Error("missing acting seat");
	const command = {
		v: PROTOCOL_VERSION,
		tableId,
		type: "action",
		match: 1,
		hand: 1,
		at: 0,
		action: { type: "draw" },
	};
	const other = SEATS.find((item) => item !== seat);
	if (!other) throw new Error("missing other seat");
	expect(module.apply(started.state, context(other), command).ok).toBe(false);
	expect(
		module.apply(started.state, context(seat), { ...command, at: 1 }).ok,
	).toBe(false);
	const drawn = module.apply(started.state, context(seat), command);
	if (!drawn.ok) throw new Error(drawn.reason);
	expect(module.isState(drawn.state, tableId)).toBe(true);
	expect(parseModernMatch(drawn.state.match)?.hand.phase).toBe("play");
	expect(drawn.state.actions).toBe(1);
	expect(
		module.isState(
			{
				...drawn.state,
				history: { initialCounts: [0, 0, 0, 0, 0, 0, 0, 0], events: [] },
			},
			tableId,
		),
	).toBe(false);
	const chat = module.apply(
		drawn.state,
		context(seat),
		chatPayload(tableId, "hello"),
	);
	expect(chat.ok).toBe(true);
});

it("rejects malformed actions, incompatible rules, and corrupt replicas", () => {
	for (const action of [
		{ type: "take-pile", cards: ["0-4C"] },
		{ type: "meld", cards: ["0-4C", "0-4C"] },
		{ type: "extend", meldId: "bad", cards: ["0-4C"] },
		{ type: "discard", card: "not-a-card" },
		{ type: "special", kind: "unknown" },
	])
		expect(parseModernAction(action)).toBeUndefined();
	const initial = module.initialState(tableId, config);
	const classic = { ...config, rules: "classic" } as TableConfig;
	expect(
		module.apply(
			initial,
			{ ...context("N"), config: classic },
			startPayload(tableId),
		).ok,
	).toBe(false);
	const started = module.apply(initial, context("N"), startPayload(tableId));
	if (!started.ok) throw new Error(started.reason);
	const match = parseModernMatch(started.state.match);
	if (!match) throw new Error("no valid modern match");
	const duplicate = match.hand.hands[0][0];
	if (!duplicate) throw new Error("empty hand");
	expect(
		module.isState(
			{
				...started.state,
				match: {
					...match,
					hand: {
						...match.hand,
						stock: [duplicate, ...match.hand.stock.slice(1)],
					},
				},
			},
			tableId,
		),
	).toBe(false);
});

it("uses the shared reset approval workflow for modern games", () => {
	const initial = module.initialState(tableId, config);
	const started = module.apply(initial, context("N"), startPayload(tableId));
	if (!started.ok) throw new Error(started.reason);
	const requested = module.apply(
		started.state,
		context("N"),
		resetRequestPayload(tableId),
	);
	if (!requested.ok) throw new Error(requested.reason);
	let state = requested.state;
	for (const seat of ["E", "S", "W"] as const) {
		const vote = module.apply(
			state,
			context(seat),
			resetVotePayload(tableId, commandId, true),
		);
		if (!vote.ok) throw new Error(vote.reason);
		state = vote.state;
	}
	expect(state.match).toBeNull();
	expect(state.reset).toBeNull();
	expect(module.isState(state, tableId)).toBe(true);
});

it("replicates and settles complete modern hands through the game boundary", () => {
	for (const seed of [1, 2, 3]) {
		const engine = createCanastaModule((bound) => seed % bound);
		const initial = engine.initialState(tableId, config);
		const started = engine.apply(initial, context("N"), startPayload(tableId));
		if (!started.ok) throw new Error(started.reason);
		let state = started.state;
		for (let count = 0; count < 200; count++) {
			const match = parseModernMatch(state.match);
			if (!match) throw new Error("invalid replicated match");
			if (match.settled) break;
			const actor = SEATS[match.hand.turn];
			if (!actor) throw new Error("invalid actor");
			const action =
				match.hand.phase === "draw"
					? { type: "draw" as const }
					: match.hand.hands[match.hand.turn]
							.map((card) => ({ type: "discard" as const, card: card.id }))
							.find(
								(candidate) =>
									modernApplyAction(match.hand, match.hand.turn, candidate).ok,
							);
			if (!action) throw new Error("no legal action");
			const next = engine.apply(state, context(actor), {
				v: PROTOCOL_VERSION,
				tableId,
				type: "action",
				match: 1,
				hand: match.handNo,
				at: state.actions,
				action,
			});
			if (!next.ok) throw new Error(next.reason);
			expect(
				engine.isState(next.state, tableId),
				`seed ${seed}, action ${count}`,
			).toBe(true);
			state = next.state;
		}
		expect(parseModernMatch(state.match)?.settled, `seed ${seed}`).toBe(true);
	}
});
