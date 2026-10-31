/** Information-set UCT with availability counts and decaying heuristic priors. */
export interface SearchGame<State, Action> {
	sample(): State;
	player(state: State): number;
	key(state: State, action: Action): string;
	actions(state: State, expired: () => boolean): readonly Action[];
	rolloutActions?(state: State, expired: () => boolean): readonly Action[];
	apply(state: State, action: Action): State;
	terminal(state: State): boolean;
	/** One bounded reward in [0, 1] for each player or team. */
	evaluate(state: State): readonly number[];
	prior?(state: State, action: Action): number;
	rollout?(
		state: State,
		actions: readonly Action[],
		rng: () => number,
		expired: () => boolean,
	): Action;
}

export interface SearchOptions<Action> {
	readonly timeMs: number;
	readonly maxIterations?: number;
	readonly maxDepth?: number;
	readonly exploration?: number;
	readonly priorWeight?: number;
	/** At most ceil(coefficient * sqrt(node visits + 1)) explored children; omitted disables widening. */
	readonly widening?: number;
	readonly rng?: () => number;
	readonly now?: () => number;
	readonly signal?: AbortSignal;
	readonly fallback?: Action;
	readonly onProgress?: (result: SearchResult<Action>) => void;
}

interface Edge<Action> {
	action: Action;
	visits: number;
	available: number;
	value: number;
	children: Map<string, Edge<Action>>;
}

export interface SearchResult<Action> {
	readonly action: Action | undefined;
	readonly iterations: number;
	readonly elapsedMs: number;
	readonly choices: readonly {
		action: Action;
		visits: number;
		mean: number;
		available: number;
	}[];
}

export async function search<State, Action>(
	game: SearchGame<State, Action>,
	options: SearchOptions<Action>,
): Promise<SearchResult<Action>> {
	if (!Number.isFinite(options.timeMs) || options.timeMs < 0)
		throw new Error("timeMs must be finite and nonnegative");
	const limit = options.maxIterations ?? 1_000_000;
	const depthLimit = options.maxDepth ?? 80;
	const exploration = options.exploration ?? Math.SQRT2;
	const priorWeight = options.priorWeight ?? 1;
	if (
		!Number.isSafeInteger(limit) ||
		limit < 0 ||
		!Number.isSafeInteger(depthLimit) ||
		depthLimit < 1 ||
		!Number.isFinite(exploration) ||
		exploration < 0 ||
		!Number.isFinite(priorWeight) ||
		priorWeight < 0
	)
		throw new Error("invalid search limits or UCB weights");
	if (
		options.widening !== undefined &&
		(!Number.isFinite(options.widening) || options.widening <= 0)
	)
		throw new Error("widening must be finite and positive");
	const now = options.now ?? (() => performance.now());
	const rng = options.rng ?? Math.random;
	const started = now();
	const expired = () =>
		now() - started >= options.timeMs || options.signal?.aborted === true;
	const root = new Map<string, Edge<Action>>();
	let iterations = 0;
	let yielded = started;
	const result = (): SearchResult<Action> => {
		const choices = [...root.values()]
			.map((edge) => ({
				action: edge.action,
				visits: edge.visits,
				mean: edge.visits ? edge.value / edge.visits : 0,
				available: edge.available,
			}))
			.sort((a, b) => b.visits - a.visits || b.mean - a.mean);
		return {
			action: choices.find((c) => c.visits > 0)?.action ?? options.fallback,
			iterations,
			elapsedMs: now() - started,
			choices,
		};
	};
	while (iterations < limit && !expired()) {
		let state = game.sample();
		let children = root;
		let expanded = false;
		let interrupted = false;
		const path: { edge: Edge<Action>; player: number }[] = [];
		const available: Edge<Action>[] = [];
		for (let depth = 0; depth < depthLimit && !game.terminal(state); depth++) {
			if (expired()) {
				interrupted = true;
				break;
			}
			const actions: readonly Action[] =
				expanded && game.rolloutActions
					? game.rolloutActions(state, expired)
					: game.actions(state, expired);
			if (expired()) {
				interrupted = true;
				break;
			}
			if (actions.length === 0) break;
			let action: Action;
			if (expanded)
				action =
					game.rollout?.(state, actions, rng, expired) ??
					required(actions[Math.floor(rng() * actions.length)]);
			else {
				const candidates: {
					key: string;
					candidate: Action;
					edge: Edge<Action>;
					score: number;
					prior: number;
				}[] = [];
				for (const candidate of actions) {
					if (expired()) {
						interrupted = true;
						break;
					}
					const key = game.key(state, candidate);
					let edge = children.get(key);
					if (!edge) {
						edge = {
							action: candidate,
							visits: 0,
							available: 0,
							value: 0,
							children: new Map(),
						};
					}
					available.push(edge);
					const prior = game.prior?.(state, candidate) ?? 0;
					if (!Number.isFinite(prior) || prior < -1 || prior > 1)
						throw new Error("search priors must be in [-1, 1]");
					const score =
						edge.visits === 0
							? Infinity
							: edge.value / edge.visits +
								exploration *
									Math.sqrt(Math.log(edge.available + 1) / edge.visits) +
								(priorWeight * prior) / (edge.visits + 1);
					candidates.push({ key, candidate, edge, score, prior });
				}
				if (interrupted || expired()) {
					interrupted = true;
					break;
				}
				const visited = candidates.filter((c) => c.edge.visits > 0);
				const nodeVisits = [...children.values()].reduce(
					(sum, edge) => sum + edge.visits,
					0,
				);
				const width =
					options.widening === undefined
						? Infinity
						: Math.ceil(options.widening * Math.sqrt(nodeVisits + 1));
				const eligible = visited.length >= width ? visited : candidates;
				// Find the complete tied set before drawing; a random initial candidate biases later expansions.
				let best = required(eligible[0]);
				const ties: typeof eligible = [];
				for (const c of eligible) {
					if (
						c.score > best.score ||
						(c.score === Infinity &&
							best.score === Infinity &&
							c.prior > best.prior)
					) {
						best = c;
						ties.length = 0;
					}
					if (
						c.score === best.score &&
						(c.score !== Infinity || c.prior === best.prior)
					)
						ties.push(c);
				}
				best = required(ties[Math.floor(rng() * ties.length)]);
				action = best.candidate;
				children.set(best.key, best.edge);
				path.push({ edge: best.edge, player: game.player(state) });
				expanded = best.edge.visits === 0;
				children = best.edge.children;
			}
			if (expired()) {
				interrupted = true;
				break;
			}
			state = game.apply(state, action);
		}
		// A deadline-truncated rollout is not a completed simulation at the declared depth.
		if (interrupted) break;
		const rewards = game.evaluate(state);
		if (rewards.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
			throw new Error("search rewards must be in [0, 1]");
		for (const edge of available) edge.available++;
		for (const { edge, player } of path) {
			const reward = rewards[player];
			if (reward === undefined)
				throw new Error("missing reward for acting player");
			edge.visits++;
			edge.value += reward;
		}
		iterations++;
		if (now() - yielded >= 8 && !expired()) {
			options.onProgress?.(result());
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			yielded = now();
		}
	}
	return result();
}

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("missing required search data");
	return value;
}
