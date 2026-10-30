/** Count-based public knowledge, independent of card identities and game rules. */
export interface CardTransfer {
	readonly player: number;
	readonly gained: readonly string[];
	readonly removed: readonly string[];
	readonly drawn: number;
}

export interface CardHistory {
	readonly initialCounts: readonly number[];
	readonly events: readonly CardTransfer[];
}

export interface CardObservation {
	readonly deck: readonly string[];
	readonly observer: number;
	readonly own: readonly string[];
	readonly publicCards: readonly string[];
	readonly counts: readonly number[];
	readonly history?: CardHistory;
	/** Faces which cannot remain in any player's hand (for example, exposed red threes). */
	readonly excluded?: readonly string[];
}

export interface CardBounds {
	readonly count: number;
	readonly minimum: Readonly<Record<string, number>>;
	readonly maximum: Readonly<Record<string, number>>;
}

export interface CardBelief {
	readonly faces: readonly string[];
	readonly remaining: Readonly<Record<string, number>>;
	/** The stock is the final row. */
	readonly players: readonly CardBounds[];
}

/** A readable guaranteed multiset plus the number of still-unknown slots. */
export function knownCards(bounds: CardBounds): {
	known: string[];
	unknown: number;
} {
	const known = Object.entries(bounds.minimum).flatMap(([face, count]) =>
		Array<string>(count).fill(face),
	);
	return { known, unknown: bounds.count - known.length };
}

function counts(cards: readonly string[]): Record<string, number> {
	const result: Record<string, number> = Object.create(null);
	for (const card of cards) result[card] = (result[card] ?? 0) + 1;
	return result;
}

function integer(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

/** Conservative count intervals, not a posterior over player intentions or physical copies. */
export function inferCards(input: CardObservation): CardBelief {
	const total = counts(input.deck);
	const faces = Object.keys(total);
	const remaining = { ...total };
	for (const card of input.publicCards) {
		if (!(remaining[card] && remaining[card] > 0))
			throw new Error("public cards exceed the deck");
		remaining[card] = (remaining[card] ?? 0) - 1;
	}
	if (
		!integer(input.observer) ||
		input.observer >= input.counts.length ||
		input.counts.some((n) => !integer(n)) ||
		input.own.length !== input.counts[input.observer]
	)
		throw new Error("invalid observer or hand counts");
	const stockCount =
		input.deck.length -
		input.publicCards.length -
		input.counts.reduce((a, b) => a + b, 0);
	if (stockCount < 0) throw new Error("hand counts exceed the deck");
	const initial = input.history?.initialCounts ?? input.counts;
	if (
		initial.length !== input.counts.length ||
		initial.some((n) => !integer(n))
	)
		throw new Error("invalid initial hand counts");
	const rows = initial.map((count) => ({
		count,
		minimum: Object.fromEntries(faces.map((face) => [face, 0])),
		maximum: Object.fromEntries(
			faces.map((face) => [face, Math.min(required(total[face]), count)]),
		),
	}));
	const tightenRow = (row: (typeof rows)[number]): void => {
		let changed = true;
		while (changed) {
			changed = false;
			const low = faces.reduce((sum, f) => sum + required(row.minimum[f]), 0);
			const high = faces.reduce((sum, f) => sum + required(row.maximum[f]), 0);
			if (low > row.count || high < row.count)
				throw new Error("history contradicts hand counts");
			for (const f of faces) {
				const min = Math.max(
					required(row.minimum[f]),
					row.count - high + required(row.maximum[f]),
				);
				const max = Math.min(
					required(row.maximum[f]),
					row.count - low + required(row.minimum[f]),
				);
				if (min > max) throw new Error("history has impossible card counts");
				changed ||= min !== row.minimum[f] || max !== row.maximum[f];
				row.minimum[f] = min;
				row.maximum[f] = max;
			}
		}
	};
	for (const event of input.history?.events ?? []) {
		const row = rows[event.player];
		if (!integer(event.player) || !row || !integer(event.drawn))
			throw new Error("invalid history transfer");
		const gained = counts(event.gained);
		const removed = counts(event.removed);
		if ([...event.gained, ...event.removed].some((f) => total[f] === undefined))
			throw new Error("history card is absent from deck");
		// Removals refer to the hand before the transfer; a pile's top goes straight to the table.
		for (const f of faces) {
			const take = removed[f] ?? 0;
			if (take > required(row.maximum[f]))
				throw new Error("history removes unavailable cards");
			row.minimum[f] =
				Math.max(0, required(row.minimum[f]) - take) + (gained[f] ?? 0);
			row.maximum[f] = Math.min(
				required(total[f]),
				required(row.maximum[f]) - take + (gained[f] ?? 0) + event.drawn,
			);
		}
		row.count += event.gained.length + event.drawn - event.removed.length;
		if (!integer(row.count)) throw new Error("history removes too many cards");
		tightenRow(row);
	}
	if (rows.some((row, i) => row.count !== input.counts[i]))
		throw new Error("history does not reach current hand counts");
	const own = counts(input.own);
	if (input.own.some((f) => total[f] === undefined))
		throw new Error("own card is absent from deck");
	for (const [i, row] of rows.entries()) {
		for (const f of faces) {
			if (i === input.observer) {
				const n = own[f] ?? 0;
				if (n < required(row.minimum[f]) || n > required(row.maximum[f]))
					throw new Error("own hand contradicts history");
				row.minimum[f] = n;
				row.maximum[f] = n;
			} else if (input.excluded?.includes(f)) row.maximum[f] = 0;
		}
	}
	rows.push({
		count: stockCount,
		minimum: Object.fromEntries(faces.map((f) => [f, 0])),
		maximum: { ...remaining },
	});
	let changed = true;
	while (changed) {
		const before = JSON.stringify(rows);
		for (const row of rows) tightenRow(row);
		for (const f of faces) {
			const low = rows.reduce((sum, row) => sum + required(row.minimum[f]), 0);
			const high = rows.reduce((sum, row) => sum + required(row.maximum[f]), 0);
			for (const row of rows) {
				row.minimum[f] = Math.max(
					required(row.minimum[f]),
					required(remaining[f]) - high + required(row.maximum[f]),
				);
				row.maximum[f] = Math.min(
					required(row.maximum[f]),
					required(remaining[f]) - low + required(row.minimum[f]),
				);
				if (required(row.minimum[f]) > required(row.maximum[f]))
					throw new Error("cards contradict deck multiplicities");
			}
		}
		changed = before !== JSON.stringify(rows);
	}
	const belief = { faces, remaining, players: rows };
	// Marginal intervals alone do not prove joint feasibility.
	allocate(belief, () => 0.5);
	return belief;
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[result[i], result[j]] = [required(result[j]), required(result[i])];
	}
	return result;
}

/** Randomized integral max flow: always respects joint capacities, without rejection loops. */
function allocate(belief: CardBelief, rng: () => number): string[][] {
	const rows = belief.players;
	const faces = shuffled(belief.faces, rng);
	const n = 2 + faces.length + rows.length;
	const sink = n - 1;
	const capacity = Array.from({ length: n }, () => Array<number>(n).fill(0));
	const output = rows.map((row) =>
		faces.flatMap((f) => Array<string>(required(row.minimum[f])).fill(f)),
	);
	for (const [i, face] of faces.entries()) {
		required(capacity[0])[i + 1] =
			required(belief.remaining[face]) -
			rows.reduce((s, r) => s + required(r.minimum[face]), 0);
		for (const [j, row] of rows.entries())
			required(capacity[i + 1])[faces.length + 1 + j] =
				required(row.maximum[face]) - required(row.minimum[face]);
	}
	for (const [j, row] of rows.entries())
		required(capacity[faces.length + 1 + j])[sink] =
			row.count - required(output[j]).length;
	const original = capacity.map((row) => [...row]);
	const order = shuffled(
		Array.from({ length: n }, (_, i) => i),
		rng,
	);
	for (;;) {
		const parent = Array<number>(n).fill(-1);
		parent[0] = 0;
		const queue = [0];
		for (let q = 0; q < queue.length && parent[sink] === -1; q++) {
			const u = required(queue[q]);
			for (const v of order)
				if (parent[v] === -1 && required(required(capacity[u])[v]) > 0) {
					parent[v] = u;
					queue.push(v);
				}
		}
		if (parent[sink] === -1) break;
		let amount = Infinity;
		for (let v = sink; v !== 0; v = required(parent[v]))
			amount = Math.min(
				amount,
				required(required(capacity[required(parent[v])])[v]),
			);
		for (let v = sink; v !== 0; v = required(parent[v])) {
			const from = required(capacity[required(parent[v])]);
			const to = required(capacity[v]);
			from[v] = required(from[v]) - amount;
			to[required(parent[v])] = required(to[required(parent[v])]) + amount;
		}
	}
	for (const [i, face] of faces.entries())
		for (let j = 0; j < rows.length; j++) {
			const at = faces.length + 1 + j;
			required(output[j]).push(
				...Array<string>(
					required(required(original[i + 1])[at]) -
						required(required(capacity[i + 1])[at]),
				).fill(face),
			);
		}
	if (output.some((cards, i) => cards.length !== required(rows[i]).count))
		throw new Error("no deal satisfies the card constraints");
	return output.map((cards) => shuffled(cards, rng));
}

/** Samples a feasible allocation; randomized flow is deliberately not claimed to be uniform. */
export function sampleCards(belief: CardBelief, rng: () => number): string[][] {
	// Usually a shuffled remainder satisfies the intervals. Flow handles tight constraints
	// without unbounded rejection; neither branch assumes distinguishable duplicate copies.
	const fixed = belief.players.map((row) =>
		belief.faces.flatMap((f) =>
			Array<string>(required(row.minimum[f])).fill(f),
		),
	);
	const rest = belief.faces.flatMap((f) =>
		Array<string>(
			required(belief.remaining[f]) -
				belief.players.reduce((n, row) => n + required(row.minimum[f]), 0),
		).fill(f),
	);
	for (let attempt = 0; attempt < 8; attempt++) {
		const deck = shuffled(rest, rng);
		let at = 0;
		const candidate = belief.players.map((row, i) => {
			const size = row.count - required(fixed[i]).length;
			const cards = [...required(fixed[i]), ...deck.slice(at, at + size)];
			at += size;
			return cards;
		});
		if (
			candidate.every((cards, i) => {
				const actual = counts(cards);
				return belief.faces.every(
					(f) =>
						(actual[f] ?? 0) <=
						required(required(belief.players[i]).maximum[f]),
				);
			})
		)
			return candidate.map((cards) => shuffled(cards, rng));
	}
	return allocate(belief, rng);
}

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("missing required search data");
	return value;
}
