/** Small-deck reference model for card histories with explicit discard likelihoods. */
export type ExactCardEvent =
	| {
			readonly kind: "gain";
			readonly player: number;
			readonly faces: readonly string[];
	  }
	| { readonly kind: "discard"; readonly player: number; readonly face: string }
	| {
			readonly kind: "hidden-transfer";
			readonly from: number;
			readonly to: number;
	  }
	| {
			readonly kind: "observe";
			readonly player: number;
			readonly faces: readonly string[];
	  };

export interface ExactCardHistoryInput {
	readonly unknown: readonly string[];
	readonly rowCounts: readonly number[];
	readonly publicCards: readonly string[];
	readonly events: readonly ExactCardEvent[];
	/** Conditional probability of selecting a face given the player's hand and a discard. */
	readonly discardLikelihood: (
		hand: readonly string[],
		face: string,
		context: ExactDiscardContext,
	) => number;
	readonly maxStates: number;
}

export interface ExactDiscardContext {
	readonly player: number;
	readonly publicCards: readonly string[];
	readonly eventIndex: number;
}

export interface ExactCardWorld {
	readonly rows: readonly (readonly string[])[];
	readonly publicCards: readonly string[];
	readonly probability: number;
}

export type ExactCardHistoryResult =
	| {
			readonly ok: true;
			readonly worlds: readonly ExactCardWorld[];
			readonly evidenceProbability: number;
	  }
	| {
			readonly ok: false;
			readonly reason:
				| "invalid input"
				| "invalid likelihood"
				| "impossible evidence"
				| "state limit exceeded"
				| "numeric underflow";
	  };

/** Select a physical card uniformly, so repeated faces have proportional probability. */
export function uniformDiscardLikelihood(
	hand: readonly string[],
	face: string,
): number {
	return hand.length === 0
		? 0
		: hand.filter((card) => card === face).length / hand.length;
}

function validFaces(value: unknown): value is readonly string[] {
	return (
		Array.isArray(value) &&
		value.length <= 12 &&
		value.every(
			(face) =>
				typeof face === "string" && face.length > 0 && face.length <= 64,
		)
	);
}

function validEvent(value: unknown, rowCount: number): value is ExactCardEvent {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const event = value as Record<string, unknown>;
	const row = (n: unknown) =>
		Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) < rowCount;
	if (event.kind === "gain" || event.kind === "observe")
		return row(event.player) && validFaces(event.faces);
	if (event.kind === "discard")
		return (
			row(event.player) &&
			typeof event.face === "string" &&
			event.face.length > 0 &&
			event.face.length <= 64
		);
	if (event.kind === "hidden-transfer")
		return row(event.from) && row(event.to) && event.from !== event.to;
	return false;
}

function choose(n: number, k: number): number {
	let value = 1;
	for (let i = 1; i <= k; i++) value = (value * (n - i + 1)) / i;
	return value;
}

function bagEqual(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const expected = b.toSorted();
	return a.toSorted().every((face, index) => face === expected[index]);
}

/** Exact only for bounded small inventories and the supplied generative model. */
export function exactCardHistory(
	input: ExactCardHistoryInput,
): ExactCardHistoryResult {
	const fail = (
		reason: Extract<ExactCardHistoryResult, { ok: false }>["reason"],
	): ExactCardHistoryResult => ({ ok: false, reason });
	if (
		!input ||
		!validFaces(input.unknown) ||
		!validFaces(input.publicCards) ||
		input.unknown.length + input.publicCards.length > 12 ||
		!Array.isArray(input.rowCounts) ||
		input.rowCounts.length < 1 ||
		input.rowCounts.length > 16 ||
		input.rowCounts.some(
			(count) => !Number.isSafeInteger(count) || count < 0,
		) ||
		input.rowCounts.reduce((sum, count) => sum + count, 0) !==
			input.unknown.length ||
		!Array.isArray(input.events) ||
		input.events.length > 100 ||
		input.events.some((event) => !validEvent(event, input.rowCounts.length)) ||
		typeof input.discardLikelihood !== "function" ||
		!Number.isSafeInteger(input.maxStates) ||
		input.maxStates < 1 ||
		input.maxStates > 100000
	)
		return fail("invalid input");
	const faces = [...new Set(input.unknown)].sort();
	const remaining = faces.map(
		(face) => input.unknown.filter((card) => card === face).length,
	);
	const rows: string[][] = input.rowCounts.map(() => []);
	const initial: ExactCardWorld[] = [];
	let exceeded = false;
	const assign = (row: number, probability: number): void => {
		if (exceeded) return;
		if (row === input.rowCounts.length) {
			initial.push({
				rows: rows.map((cards) => [...cards]),
				publicCards: [...input.publicCards].sort(),
				probability,
			});
			if (initial.length > input.maxStates) exceeded = true;
			return;
		}
		const count = input.rowCounts[row] ?? 0;
		const total = remaining.reduce((sum, n) => sum + n, 0);
		const denominator = choose(total, count);
		const selected: string[] = [];
		const fill = (
			faceIndex: number,
			needed: number,
			combinations: number,
		): void => {
			if (exceeded) return;
			if (needed === 0) {
				rows[row] = [...selected];
				assign(row + 1, (probability * combinations) / denominator);
				return;
			}
			const face = faces[faceIndex];
			if (face === undefined) return;
			const available = remaining[faceIndex] ?? 0;
			for (let take = 0; take <= Math.min(available, needed); take++) {
				remaining[faceIndex] = available - take;
				selected.push(...Array<string>(take).fill(face));
				fill(
					faceIndex + 1,
					needed - take,
					combinations * choose(available, take),
				);
				selected.length -= take;
			}
			remaining[faceIndex] = available;
		};
		fill(0, count, 1);
	};
	assign(0, 1);
	if (exceeded) return fail("state limit exceeded");
	let worlds = initial;
	let evidenceProbability = 1;
	for (const [eventIndex, event] of input.events.entries()) {
		const next = new Map<string, ExactCardWorld>();
		let invalidLikelihood = false;
		let underflow = false;
		const add = (
			rowsValue: readonly (readonly string[])[],
			publicValue: readonly string[],
			probability: number,
		) => {
			const canonicalRows = rowsValue.map((cards) => [...cards].sort());
			const canonicalPublic = [...publicValue].sort();
			const key = JSON.stringify([canonicalRows, canonicalPublic]);
			const previous = next.get(key);
			next.set(key, {
				rows: canonicalRows,
				publicCards: canonicalPublic,
				probability: (previous?.probability ?? 0) + probability,
			});
		};
		for (const world of worlds) {
			if (event.kind === "observe") {
				if (bagEqual(world.rows[event.player] ?? [], event.faces))
					add(world.rows, world.publicCards, world.probability);
			} else if (event.kind === "gain") {
				const publicCards = [...world.publicCards];
				let possible = true;
				for (const face of event.faces) {
					const at = publicCards.indexOf(face);
					if (at < 0) {
						possible = false;
						break;
					}
					publicCards.splice(at, 1);
				}
				if (possible) {
					const updated = world.rows.map((cards) => [...cards]);
					updated[event.player]?.push(...event.faces);
					add(updated, publicCards, world.probability);
				}
			} else if (event.kind === "discard") {
				const hand = world.rows[event.player] ?? [];
				const at = hand.indexOf(event.face);
				if (at < 0) continue;
				const visibleHand = Object.freeze([...hand]);
				const context = Object.freeze({
					player: event.player,
					publicCards: Object.freeze([...world.publicCards]),
					eventIndex,
				});
				let likelihood = 0;
				let likelihoodTotal = 0;
				for (const face of new Set(visibleHand)) {
					const value = input.discardLikelihood(visibleHand, face, context);
					if (!Number.isFinite(value) || value < 0 || value > 1) {
						invalidLikelihood = true;
						break;
					}
					likelihoodTotal += value;
					if (face === event.face) likelihood = value;
				}
				if (invalidLikelihood || Math.abs(likelihoodTotal - 1) > 1e-12) {
					invalidLikelihood = true;
					break;
				}
				if (likelihood === 0) continue;
				const probability = world.probability * likelihood;
				if (probability === 0) {
					underflow = true;
					break;
				}
				const updated = world.rows.map((cards) => [...cards]);
				updated[event.player]?.splice(at, 1);
				add(updated, [...world.publicCards, event.face], probability);
			} else {
				const source = world.rows[event.from] ?? [];
				for (const face of new Set(source)) {
					const likelihood =
						source.filter((card) => card === face).length / source.length;
					const probability = world.probability * likelihood;
					if (probability === 0) {
						underflow = true;
						break;
					}
					const updated = world.rows.map((cards) => [...cards]);
					updated[event.from]?.splice(source.indexOf(face), 1);
					updated[event.to]?.push(face);
					add(updated, world.publicCards, probability);
				}
			}
			if (underflow || next.size > input.maxStates) break;
		}
		if (invalidLikelihood) return fail("invalid likelihood");
		if (underflow) return fail("numeric underflow");
		if (next.size > input.maxStates) return fail("state limit exceeded");
		const total = [...next.values()].reduce(
			(sum, world) => sum + world.probability,
			0,
		);
		if (total === 0) return fail("impossible evidence");
		const evidence = evidenceProbability * total;
		if (evidence === 0) return fail("numeric underflow");
		evidenceProbability = evidence;
		worlds = [...next.values()].map((world) => ({
			...world,
			probability: world.probability / total,
		}));
	}
	return { ok: true, worlds, evidenceProbability };
}
