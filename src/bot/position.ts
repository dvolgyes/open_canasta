import type { MatchState } from "../canasta";

/**
 * Hand and accepted-action counters within one match branch.
 * Divergent branches can share these counters.
 */
export function actionPositionKey(handNo: number, accepted: number): string {
	return `action:${handNo}:${accepted}`;
}
/** Different branches can have the same counters but different cards and rules. */
export function matchPositionKey(
	match: MatchState | null,
	accepted: number,
): string {
	return match === null
		? `none:${accepted}`
		: `${actionPositionKey(match.handNo, accepted)}:${JSON.stringify(match)}`;
}
