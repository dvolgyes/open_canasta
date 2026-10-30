/** A bounded SPSA update; the objective, RNG and persistence belong to the caller. */
export interface SpsaSchedule {
	readonly step: number;
	readonly perturbation: number;
	readonly stability: number;
}
export interface SpsaProbe {
	readonly plus: readonly number[];
	readonly minus: readonly number[];
	readonly signs: readonly number[];
	readonly step: number;
	readonly perturbation: number;
}

export function spsaProbe(
	point: readonly number[],
	update: number,
	schedule: SpsaSchedule,
	rng: () => number,
): SpsaProbe {
	if (
		point.length === 0 ||
		point.some((v) => !Number.isFinite(v) || Math.abs(v) > 1) ||
		!Number.isSafeInteger(update) ||
		update < 1 ||
		!Number.isFinite(schedule.step) ||
		schedule.step <= 0 ||
		!Number.isFinite(schedule.perturbation) ||
		schedule.perturbation <= 0 ||
		schedule.perturbation > 1 ||
		!Number.isFinite(schedule.stability) ||
		schedule.stability < 0
	)
		throw new Error("invalid SPSA configuration");
	const perturbation = schedule.perturbation / update ** 0.101;
	const step = schedule.step / (schedule.stability + update) ** 0.602;
	const signs = point.map(() => (rng() < 0.5 ? -1 : 1));
	// Keep probes symmetric even at a bound; clipping the probes would bias the difference quotient.
	const center = point.map((v) =>
		Math.max(-1 + perturbation, Math.min(1 - perturbation, v)),
	);
	return {
		plus: center.map((v, i) => v + perturbation * (signs[i] ?? 0)),
		minus: center.map((v, i) => v - perturbation * (signs[i] ?? 0)),
		signs,
		step,
		perturbation,
	};
}

export function spsaUpdate(
	point: readonly number[],
	probe: SpsaProbe,
	plus: number,
	minus: number,
): number[] {
	if (
		!Number.isFinite(plus) ||
		!Number.isFinite(minus) ||
		probe.signs.length !== point.length
	)
		throw new Error("invalid SPSA measurements");
	return point.map((v, i) =>
		Math.max(
			-1,
			Math.min(
				1,
				v +
					(probe.step * (plus - minus) * (probe.signs[i] ?? 0)) /
						(2 * probe.perturbation),
			),
		),
	);
}
