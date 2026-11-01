import { buildDecks, type Card } from "../canasta/cards";
import type { Seat } from "../canasta/hand";
import type {
	ModernHandSnapshot,
	ModernHandState,
} from "../canasta/modern-hand";
import { type ModernHandView, modernViewFor } from "../canasta/modern-view";
import { cardFace } from "../game/canasta-history";

function mapSnapshot(
	snapshot: ModernHandSnapshot,
	ids: ReadonlyMap<string, Card>,
): ModernHandSnapshot {
	const card = (value: Card): Card => ids.get(value.id) ?? value;
	const team = (value: ModernHandSnapshot["teams"][number]) => ({
		...value,
		threes: value.threes.map(card),
		melds: value.melds.map((meld) => ({
			...meld,
			cards: meld.cards.map(card),
		})),
	});
	return {
		...snapshot,
		hands: [
			snapshot.hands[0].map(card),
			snapshot.hands[1].map(card),
			snapshot.hands[2].map(card),
			snapshot.hands[3].map(card),
		],
		bonuses: [
			snapshot.bonuses[0].map(card),
			snapshot.bonuses[1].map(card),
			snapshot.bonuses[2].map(card),
			snapshot.bonuses[3].map(card),
		],
		stock: snapshot.stock.map(card),
		pile: snapshot.pile.map(card),
		teams: [team(snapshot.teams[0]), team(snapshot.teams[1])],
		turnTaken: snapshot.turnTaken.map((id) => ids.get(id)?.id ?? id),
	};
}

function mapState(
	state: ModernHandState,
	ids: ReadonlyMap<string, Card>,
): ModernHandState {
	return {
		...mapSnapshot(state, ids),
		turnStart: mapSnapshot(state.turnStart, ids),
		undo: state.undo.map((snapshot) => mapSnapshot(snapshot, ids)),
	};
}

function hidden(state: ModernHandSnapshot, seat: Seat): Card[] {
	return [
		...state.hands.flatMap((row, index) => (index === seat ? [] : row)),
		...state.bonuses.flat(),
		...state.stock,
	];
}

function publicCards(state: ModernHandSnapshot): Card[] {
	return [
		...state.pile,
		...state.teams.flatMap((team) => [
			...team.threes,
			...team.melds.flatMap((meld) => meld.cards),
		]),
	];
}

/** Keep cards the actor saw in their hand on the visible side of the sampled deal. */
function reserveKnown(
	state: ModernHandState,
	seat: Seat,
	known: ReadonlySet<string>,
): ModernHandState {
	let result = state;
	for (const id of known) {
		const concealed = hidden(result, seat).find((card) => card.id === id);
		if (!concealed) continue;
		const replacement = publicCards(result).find(
			(card) => !known.has(card.id) && cardFace(card) === cardFace(concealed),
		);
		if (!replacement)
			throw new Error("turn history contradicts the sampled visible cards");
		result = mapState(
			result,
			new Map([
				[concealed.id, replacement],
				[replacement.id, concealed],
			]),
		);
	}
	return result;
}

/** Relabel interchangeable copies to keep the sampled hidden world fixed. */
function alignHidden(
	state: ModernHandState,
	root: ModernHandState,
	seat: Seat,
	known: ReadonlySet<string>,
): ModernHandState {
	const source = hidden(state, seat);
	const target = hidden(root, seat);
	if (source.length !== target.length)
		throw new Error("undo changes hidden card counts");
	const ids = new Map<string, Card>();
	const used = new Set<string>();
	const deck = buildDecks();
	for (const card of deck) {
		if (!known.has(card.id)) continue;
		ids.set(card.id, card);
		used.add(card.id);
	}
	for (let i = 0; i < source.length; i++) {
		const from = source[i];
		const to = target[i];
		if (
			!from ||
			!to ||
			cardFace(from) !== cardFace(to) ||
			ids.has(from.id) ||
			used.has(to.id)
		)
			throw new Error("undo changes the sampled hidden deal");
		ids.set(from.id, to);
		used.add(to.id);
	}
	for (const from of deck) {
		if (ids.has(from.id)) continue;
		const to = deck.find(
			(card) => !used.has(card.id) && cardFace(card) === cardFace(from),
		);
		if (!to) throw new Error("cannot align physical card copies");
		ids.set(from.id, to);
		used.add(to.id);
	}
	return mapState(state, ids);
}

interface PublicSlot {
	readonly key: string;
	readonly card: Card;
}

function publicSlots(snapshot: ModernHandSnapshot): PublicSlot[] {
	return [
		...snapshot.pile.map((card, index) => ({ key: `pile:${index}`, card })),
		...snapshot.teams.flatMap((team, side) => [
			...team.threes.map((card, index) => ({
				key: `three:${side}:${index}`,
				card,
			})),
			...team.melds.flatMap((meld) =>
				meld.cards.map((card, index) => ({
					key: `meld:${side}:${meld.id}:${index}`,
					card,
				})),
			),
		]),
	];
}

interface SlotGroup {
	readonly key: string;
	readonly face: string;
	readonly frames: Set<number>;
	readonly preferred: string;
	readonly allowed: Card[];
}

/**
 * During one turn, exposed threes and existing meld prefixes remain in place;
 * the pile can only lose its top or be taken. A slot therefore has the same
 * physical copy whenever it appears in these snapshots. For each card face,
 * assign distinct copies to slots that coexist, excluding the actor's cards
 * and the fixed hidden deal. Non-overlapping slots may represent the same card.
 */
function alignPublic(
	frames: readonly ModernHandSnapshot[],
	seat: Seat,
): ModernHandSnapshot[] {
	const root = frames.at(-1);
	if (!root) throw new Error("missing root snapshot");
	const concealed = new Set(hidden(root, seat).map((card) => card.id));
	const deck = buildDecks();
	const groups = new Map<
		string,
		{ face: string; frames: Set<number>; preferred: string }
	>();
	for (const [index, frame] of frames.entries()) {
		for (const slot of publicSlots(frame)) {
			let group = groups.get(slot.key);
			if (!group) {
				group = {
					face: cardFace(slot.card),
					frames: new Set(),
					preferred: slot.card.id,
				};
				groups.set(slot.key, group);
			}
			if (group.face !== cardFace(slot.card) || group.frames.has(index))
				throw new Error("undo history changes a public card slot");
			group.frames.add(index);
		}
	}
	const pending: SlotGroup[] = [...groups].map(([key, group]) => ({
		key,
		...group,
		allowed: deck.filter(
			(card) =>
				cardFace(card) === group.face &&
				!concealed.has(card.id) &&
				[...group.frames].every(
					(index) =>
						!frames[index]?.hands[seat].some((owned) => owned.id === card.id),
				),
		),
	}));
	const assigned = new Map<string, Card>();
	const overlaps = (a: SlotGroup, b: SlotGroup) =>
		[...a.frames].some((frame) => b.frames.has(frame));
	for (const face of new Set(pending.map((group) => group.face))) {
		const sameFace = pending.filter((group) => group.face === face);
		sameFace.sort(
			(a, b) =>
				a.allowed.length - b.allowed.length || b.frames.size - a.frames.size,
		);
		const solve = (index: number): boolean => {
			if (index === sameFace.length) return true;
			const group = sameFace[index];
			if (!group) throw new Error("missing public slot group");
			const choices = [...group.allowed].sort(
				(a, b) =>
					Number(b.id === group.preferred) - Number(a.id === group.preferred),
			);
			for (const card of choices) {
				if (
					sameFace
						.slice(0, index)
						.some(
							(other) =>
								assigned.get(other.key)?.id === card.id &&
								overlaps(group, other),
						)
				)
					continue;
				assigned.set(group.key, card);
				if (solve(index + 1)) return true;
				assigned.delete(group.key);
			}
			return false;
		};
		if (!solve(0))
			throw new Error("cannot assign visible card copies across undo history");
	}
	const get = (key: string): Card => {
		const card = assigned.get(key);
		if (!card) throw new Error("missing public card assignment");
		return card;
	};
	return frames.map((frame): ModernHandSnapshot => {
		const team = (
			value: ModernHandSnapshot["teams"][number],
			side: number,
		) => ({
			...value,
			threes: value.threes.map((_, index) => get(`three:${side}:${index}`)),
			melds: value.melds.map((meld) => ({
				...meld,
				cards: meld.cards.map((_, index) =>
					get(`meld:${side}:${meld.id}:${index}`),
				),
			})),
		});
		return {
			...frame,
			pile: frame.pile.map((_, index) => get(`pile:${index}`)),
			teams: [team(frame.teams[0], 0), team(frame.teams[1], 1)],
		};
	});
}

/** Rebuild visible undo snapshots without copying any hidden cards from the real deal. */
export function sampledUndo(
	state: ModernHandState,
	views: readonly ModernHandView[],
	seat: Seat,
	rebuild: (view: ModernHandView) => ModernHandState,
): ModernHandState {
	if (views.length === 0) return state;
	const known = new Set(
		[...state.hands[seat], ...views.flatMap((view) => view.hand)].map(
			(card) => card.id,
		),
	);
	const root = reserveKnown(state, seat, known);
	const undo = views.map((view) => {
		const previous = alignHidden(
			reserveKnown(rebuild(view), seat, known),
			root,
			seat,
			known,
		);
		const { turnStart: _turnStart, undo: _undo, ...snapshot } = previous;
		return snapshot;
	});
	const { turnStart: _turnStart, undo: _undo, ...snapshot } = root;
	const frames = alignPublic([...undo, snapshot], seat);
	const first = frames[0];
	const last = frames.at(-1);
	if (!first || !last) throw new Error("missing undo snapshot");
	const firstView = modernViewFor(
		{ ...first, turnStart: first, undo: [] },
		seat,
	);
	const startView = modernViewFor(
		{ ...root.turnStart, turnStart: root.turnStart, undo: [] },
		seat,
	);
	if (JSON.stringify(firstView) !== JSON.stringify(startView))
		throw new Error("undo history does not start at the turn baseline");
	const withTaken = (frame: ModernHandSnapshot): ModernHandSnapshot => ({
		...frame,
		turnTaken:
			first.phase === "draw" && frame.phase !== "draw"
				? first.pile.map((card) => card.id)
				: [],
	});
	return {
		...withTaken(last),
		turnStart: withTaken(first),
		undo: frames.slice(0, -1).map(withTaken),
	};
}
