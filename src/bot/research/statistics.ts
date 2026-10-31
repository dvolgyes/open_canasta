/** Fixed-sample bounds for independent paired blocks with bounded outcomes. */
export interface Estimate {
	readonly planned: number;
	readonly completed: number;
	readonly mean: number | null;
	readonly lower: number;
	readonly upper: number;
	readonly alpha: number;
}

export function boundedEstimate(
	values: readonly (number | null)[],
	planned: number,
	alpha: number,
	minimum = 0,
	maximum = 1,
): Estimate {
	if (
		!Number.isSafeInteger(planned) ||
		planned < 1 ||
		values.length > planned ||
		!(alpha > 0 && alpha < 1) ||
		!Number.isFinite(minimum) ||
		!Number.isFinite(maximum) ||
		minimum >= maximum ||
		values.some(
			(v) => v !== null && (!Number.isFinite(v) || v < minimum || v > maximum),
		)
	)
		throw new Error("invalid bounded sample");
	const complete = values.filter((v): v is number => v !== null);
	const mean = complete.length
		? complete.reduce((s, v) => s + v, 0) / complete.length
		: null;
	// Each endpoint has one-sided error <= alpha. Never claim success from an incomplete planned trial.
	const radius =
		(maximum - minimum) * Math.sqrt(Math.log(1 / alpha) / (2 * planned));
	return {
		planned,
		completed: complete.length,
		mean,
		lower:
			complete.length === planned && mean !== null
				? Math.max(minimum, mean - radius)
				: minimum,
		upper:
			complete.length === planned && mean !== null
				? Math.min(maximum, mean + radius)
				: maximum,
		alpha,
	};
}
