import { expect, it } from "vitest";
import { CommunityCover } from "../../src/community/cover";
import { SEAT_GRACE_MS } from "../../src/p2p/limits";
import type { Seat } from "../../src/protocol";

it("waits through reload grace, covers the hand, and restores the same human only at its end", () => {
	const policy = new CommunityCover();
	const input = {
		now: 0,
		hand: { match: 1, hand: 4 },
		complete: false,
		humans: ["E"] as Seat[],
		online: new Set<Seat>(),
		seats: [{ seat: "E" as const, holder: "abcdefghijklmnop", gen: 7 }],
	};
	expect(policy.changes(input)).toEqual([]);
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS - 1 })).toEqual([]);
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS })).toEqual([
		{ seat: "E", hand: { match: 1, hand: 4 }, recruitment: "online" },
	]);
	const covered = {
		...input,
		now: SEAT_GRACE_MS,
		seats: input.seats.map((row) => ({
			...row,
			coverHand: { match: 1, hand: 4 },
			recruiting: "online" as const,
		})),
		online: new Set<Seat>(["E"]),
	};
	expect(policy.changes(covered)).toEqual([]);
	expect(policy.changes({ ...covered, complete: true })).toEqual([
		{ seat: "E", hand: null, recruitment: null },
	]);
	expect(new CommunityCover().changes(covered)).toEqual([]);
});

it("does not cover an initial player before a hand and ends temporary cover at the hand boundary", () => {
	const policy = new CommunityCover();
	const input = {
		now: 0,
		hand: null,
		complete: false,
		humans: ["N"] as Seat[],
		online: new Set<Seat>(),
		seats: [{ seat: "N" as const, holder: "abcdefghijklmnop", gen: 1 }],
	};
	policy.changes(input);
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS * 10 })).toEqual([]);
	expect(
		policy.changes({
			...input,
			now: SEAT_GRACE_MS * 10,
			hand: { match: 1, hand: 3 },
			seats: input.seats.map((row) => ({
				...row,
				coverHand: { match: 1, hand: 2 },
			})),
		}),
	).toEqual([{ seat: "N", hand: null, recruitment: "online" }]);
});

it("offers one replacement seat at a time while covering each missing seat for this hand", () => {
	const policy = new CommunityCover();
	const seats = [
		{ seat: "N" as const, holder: "abcdefghijklmnop", gen: 1 },
		{ seat: "E" as const, holder: "qrstuvwxyzABCDEF", gen: 1 },
	];
	const input = {
		now: 0,
		hand: { match: 1, hand: 5 },
		complete: false,
		humans: ["N", "E"] as Seat[],
		online: new Set<Seat>(),
		seats,
	};
	policy.changes(input);
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS })).toEqual([
		{ seat: "N", hand: { match: 1, hand: 5 }, recruitment: "online" },
		{ seat: "E", hand: { match: 1, hand: 5 } },
	]);
});

it("keeps an invited seat private and preserves its admission kind", () => {
	const policy = new CommunityCover();
	const input = {
		now: 0,
		hand: { match: 1, hand: 2 },
		complete: false,
		humans: ["S"] as Seat[],
		online: new Set<Seat>(),
		seats: [{ seat: "S" as const, holder: "abcdefghijklmnop", gen: 1 }],
		recruitment: { S: "invited" as const },
	};
	policy.changes(input);
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS })).toEqual([
		{ seat: "S", hand: { match: 1, hand: 2 }, recruitment: "invited" },
	]);
});

it("does not start temporary cover or recruitment for a permanent bot", () => {
	const policy = new CommunityCover();
	const input = {
		now: 0,
		hand: { match: 1, hand: 2 },
		complete: false,
		humans: ["S"] as Seat[],
		online: new Set<Seat>(),
		permanentBots: new Set<Seat>(["S"]),
		seats: [{ seat: "S" as const, holder: "abcdefghijklmnop", gen: 1 }],
	};
	policy.changes(input);
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS })).toEqual([]);
	expect(
		policy.changes({
			...input,
			seats: input.seats.map((row) => ({
				...row,
				recruiting: "online" as const,
			})),
		}),
	).toEqual([{ seat: "S", hand: null, recruitment: null }]);
});

it.each([
	["holder", "qrstuvwxyzABCDEF", 1],
	["generation", "abcdefghijklmnop", 2],
])(
	"starts a new grace period when a seat changes %s",
	(_changed, holder, gen) => {
		const policy = new CommunityCover();
		const input = {
			now: 0,
			hand: { match: 1, hand: 2 },
			complete: false,
			humans: ["E"] as Seat[],
			online: new Set<Seat>(),
			seats: [{ seat: "E" as const, holder: "abcdefghijklmnop", gen: 1 }],
		};
		policy.changes(input);
		const replacement = {
			...input,
			now: SEAT_GRACE_MS,
			seats: [{ seat: "E" as const, holder, gen }],
		};
		expect(policy.changes(replacement)).toEqual([]);
		expect(policy.changes({ ...replacement, now: SEAT_GRACE_MS * 2 })).toEqual([
			{ seat: "E", hand: { match: 1, hand: 2 }, recruitment: "online" },
		]);
	},
);

it("does not carry cover into the same hand number of a new match", () => {
	const policy = new CommunityCover();
	const input = {
		now: 0,
		hand: { match: 1, hand: 1 },
		complete: false,
		humans: ["E"] as Seat[],
		online: new Set<Seat>(["E"]),
		seats: [
			{
				seat: "E" as const,
				holder: "abcdefghijklmnop",
				gen: 1,
				coverHand: { match: 1, hand: 1 },
			},
		],
	};
	expect(policy.changes(input)).toEqual([]);
	expect(policy.changes({ ...input, hand: { match: 2, hand: 1 } })).toEqual([
		{ seat: "E", hand: null },
	]);
});

it("forgets absence when a seat is no longer managed as human", () => {
	const policy = new CommunityCover();
	const input = {
		now: 0,
		hand: { match: 1, hand: 1 },
		complete: false,
		humans: ["N"] as Seat[],
		online: new Set<Seat>(),
		seats: [{ seat: "N" as const, holder: "abcdefghijklmnop", gen: 1 }],
	};
	policy.changes(input);
	policy.changes({ ...input, humans: [], now: SEAT_GRACE_MS });
	expect(policy.changes({ ...input, now: SEAT_GRACE_MS })).toEqual([]);
});
