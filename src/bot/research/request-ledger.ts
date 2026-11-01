import { accountedNanodollars } from "./price-guard";

export interface RequestRecord {
	readonly id: string;
	readonly promptSha256: string;
	readonly status: "reserved" | "success" | "failure";
	readonly choice?: number;
	readonly costUsd?: number;
	readonly routerCostUsd?: number;
	readonly upstreamCostUsd?: number;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly responseId?: string;
	readonly resolvedModel?: string;
	readonly reservedNanodollars?: number;
}

export interface RequestJournal {
	readonly records: ReadonlyMap<string, RequestRecord>;
	write(record: RequestRecord): void;
}

export function validRequestRecord(value: unknown): value is RequestRecord {
	if (typeof value !== "object" || value === null) return false;
	const r = value as Partial<RequestRecord>;
	return (
		typeof r.id === "string" &&
		/^[a-z0-9-]{1,160}$/.test(r.id) &&
		typeof r.promptSha256 === "string" &&
		/^[a-f0-9]{64}$/.test(r.promptSha256) &&
		["reserved", "success", "failure"].includes(r.status ?? "") &&
		(r.reservedNanodollars === undefined ||
			Number.isSafeInteger(r.reservedNanodollars)) &&
		(r.status !== "success" ||
			(typeof r.choice === "number" &&
				Number.isSafeInteger(r.choice) &&
				r.choice >= 0)) &&
		[
			r.costUsd,
			r.routerCostUsd,
			r.upstreamCostUsd,
			r.inputTokens,
			r.outputTokens,
			r.reservedNanodollars,
		].every(
			(n) =>
				n === undefined ||
				(typeof n === "number" && Number.isFinite(n) && n >= 0),
		) &&
		[r.responseId, r.resolvedModel].every(
			(s) => s === undefined || (typeof s === "string" && s.length <= 500),
		)
	);
}

export interface ScopedRequestRecord {
	readonly namespace: string;
	readonly record: unknown;
}

export type RequestLedgerAudit =
	| {
			readonly ok: true;
			readonly recordedRequests: number;
			/** Sum of known canonical total costs, not individual provider components. */
			readonly reportedNanodollars: number;
			/** Conditional on authentic canonical charges and valid reservation ceilings. */
			readonly maximumExposureNanodollars: number;
			readonly remainingNanodollars: number;
			readonly unresolvedRequests: number;
			readonly failedRequests: number;
			readonly reservedRequests: number;
			/** All supplied records succeeded and have known costs; this does not authorize a new request. */
			readonly settled: boolean;
			readonly overLimit: boolean;
	  }
	| { readonly ok: false; readonly reason: string };

/** Audit supplied records only; a caller must establish that the input is complete and authentic. */
export function auditRequestLedger(
	entries: readonly ScopedRequestRecord[],
	limitNanodollars: number,
): RequestLedgerAudit {
	if (
		!Array.isArray(entries) ||
		entries.length > 1000000 ||
		!Number.isSafeInteger(limitNanodollars) ||
		limitNanodollars < 0
	)
		return { ok: false, reason: "invalid request ledger" };
	const identities = new Set<string>();
	let reportedNanodollars = 0,
		maximumExposureNanodollars = 0,
		unresolvedRequests = 0,
		failedRequests = 0,
		reservedRequests = 0;
	for (const entry of entries) {
		if (
			typeof entry !== "object" ||
			entry === null ||
			typeof entry.namespace !== "string" ||
			!/^[a-z0-9-]{1,80}$/.test(entry.namespace)
		)
			return { ok: false, reason: "invalid request ledger" };
		if (!validRequestRecord(entry.record))
			return { ok: false, reason: "invalid request record" };
		const record = entry.record;
		const identity = `${entry.namespace}\0${record.id}`;
		if (identities.has(identity))
			return { ok: false, reason: "duplicate scoped request" };
		identities.add(identity);
		const costs = [
			record.costUsd,
			record.routerCostUsd,
			record.upstreamCostUsd,
		];
		if (costs.some((value) => value !== undefined && value > 100000))
			return { ok: false, reason: "invalid request cost" };
		const cost =
			record.costUsd === undefined
				? undefined
				: accountedNanodollars(record.costUsd);
		const components = costs
			.slice(1)
			.map((value) => (value === undefined ? 0 : accountedNanodollars(value)));
		const component = Math.max(0, ...components);
		const reservation = record.reservedNanodollars;
		const unresolved = record.status === "reserved" || cost === undefined;
		const possibleCharge = unresolved
			? components.reduce((sum, value) => sum + value, 0)
			: component;
		if (
			reservation !== undefined &&
			Math.max(cost ?? 0, possibleCharge) > reservation
		)
			return { ok: false, reason: "reported cost exceeds reservation" };
		if (cost !== undefined && cost < component)
			return {
				ok: false,
				reason: "reported cost is below a recorded component",
			};
		if (unresolved && (reservation === undefined || reservation <= 0))
			return {
				ok: false,
				reason: "unresolved request lacks a positive reservation",
			};
		const exposure = unresolved ? reservation : cost;
		if (exposure === undefined) throw new Error("missing request exposure");
		reportedNanodollars += cost ?? 0;
		maximumExposureNanodollars += exposure;
		if (
			!Number.isSafeInteger(reportedNanodollars) ||
			!Number.isSafeInteger(maximumExposureNanodollars)
		)
			return {
				ok: false,
				reason: "request ledger total exceeds safe integer range",
			};
		unresolvedRequests += Number(unresolved);
		failedRequests += Number(record.status === "failure");
		reservedRequests += Number(record.status === "reserved");
	}
	return {
		ok: true,
		recordedRequests: entries.length,
		reportedNanodollars,
		maximumExposureNanodollars,
		remainingNanodollars: Math.max(
			0,
			limitNanodollars - maximumExposureNanodollars,
		),
		unresolvedRequests,
		failedRequests,
		reservedRequests,
		settled:
			unresolvedRequests === 0 &&
			failedRequests === 0 &&
			reservedRequests === 0,
		overLimit: maximumExposureNanodollars > limitNanodollars,
	};
}
