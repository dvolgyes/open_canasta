import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { validRequestRecord as providerValidator } from "../../src/bot/research/openrouter";
import {
	auditRequestLedger,
	type RequestRecord,
	validRequestRecord,
} from "../../src/bot/research/request-ledger";

function success(id: string, costUsd = 0.01): RequestRecord {
	return {
		id,
		promptSha256: "a".repeat(64),
		status: "success",
		choice: 0,
		costUsd,
		reservedNanodollars: 20000000,
	};
}

it("audits the retained classic ledger under a shared one-dollar limit", () => {
	const summary = JSON.parse(
		readFileSync("docs/classic-1000-results.json", "utf8"),
	);
	const artifact = summary.artifacts.find(
		(entry: { path: string }) =>
			entry.path === "docs/classic-1000-llm-records-1.json.gz",
	);
	if (!artifact) throw new Error("missing retained LLM archive");
	const bytes = readFileSync(artifact.path);
	expect(bytes.length).toBe(artifact.bytes);
	expect(createHash("sha256").update(bytes).digest("hex")).toBe(
		artifact.sha256,
	);
	const archive = JSON.parse(gunzipSync(bytes).toString("utf8"));
	const entries = archive.files.flatMap(
		(file: { path: string; text: string }) => {
			const match = /^(llm-(?:test|confirmation))\/request-.*\.json$/.exec(
				file.path,
			);
			if (!match) return [];
			const record = JSON.parse(file.text);
			if (basename(file.path) !== `request-${record.id}.json`)
				throw new Error("request file name does not match its ID");
			return [{ namespace: match[1], record }];
		},
	);
	expect(
		entries.every(
			({ record }: { record: unknown }) =>
				validRequestRecord(record) && providerValidator(record),
		),
	).toBe(true);
	expect(auditRequestLedger(entries, 1000000000)).toEqual({
		ok: true,
		recordedRequests: 1152,
		reportedNanodollars: 101838126,
		maximumExposureNanodollars: 208343407,
		remainingNanodollars: 791656593,
		unresolvedRequests: 1,
		failedRequests: 0,
		reservedRequests: 1,
		settled: false,
		overLimit: false,
	});
});

it("rounds known costs upward and keeps namespace identities distinct", () => {
	const first = success("one", 0.0100000001);
	const result = auditRequestLedger(
		[
			{ namespace: "old", record: first },
			{ namespace: "new", record: success("one") },
		],
		50000000,
	);
	expect(result).toEqual({
		ok: true,
		recordedRequests: 2,
		reportedNanodollars: 20000001,
		maximumExposureNanodollars: 20000001,
		remainingNanodollars: 29999999,
		unresolvedRequests: 0,
		failedRequests: 0,
		reservedRequests: 0,
		settled: true,
		overLimit: false,
	});
	expect(
		auditRequestLedger(
			[
				{ namespace: "old", record: first },
				{ namespace: "old", record: first },
			],
			50000000,
		),
	).toEqual({ ok: false, reason: "duplicate scoped request" });
});

it("holds unresolved reservations and does not treat failed requests as settled", () => {
	const base = success("one", 0.01);
	const pending = { ...base, status: "reserved" as const, costUsd: undefined };
	const failed = { ...success("two", 0.005), status: "failure" as const };
	expect(
		auditRequestLedger(
			[
				{ namespace: "run", record: pending },
				{ namespace: "run", record: failed },
			],
			50000000,
		),
	).toEqual({
		ok: true,
		recordedRequests: 2,
		reportedNanodollars: 5000000,
		maximumExposureNanodollars: 25000000,
		remainingNanodollars: 25000000,
		unresolvedRequests: 1,
		failedRequests: 1,
		reservedRequests: 1,
		settled: false,
		overLimit: false,
	});
});

it("retains the full reservation when a pending request has a partial reported cost", () => {
	const pending = { ...success("one", 0.005), status: "reserved" as const };
	const result = auditRequestLedger(
		[{ namespace: "run", record: pending }],
		50000000,
	);
	if (!result.ok) throw new Error(result.reason);
	expect(result).toMatchObject({
		reportedNanodollars: 5000000,
		maximumExposureNanodollars: 20000000,
		unresolvedRequests: 1,
		reservedRequests: 1,
		settled: false,
	});
});

it("does not treat a success with unknown cost as settled", () => {
	const unknownCost = { ...success("one"), costUsd: undefined };
	const result = auditRequestLedger(
		[{ namespace: "run", record: unknownCost }],
		50000000,
	);
	if (!result.ok) throw new Error(result.reason);
	expect(result).toMatchObject({
		maximumExposureNanodollars: 20000000,
		unresolvedRequests: 1,
		settled: false,
	});
});

it("fails closed on malformed, unbounded, duplicate, or over-reservation records", () => {
	const base = success("one");
	for (const entry of [
		{ namespace: "bad/name", record: base },
		{ namespace: "run", record: null },
		{ namespace: "run", record: { ...base, promptSha256: "bad" } },
	])
		expect(auditRequestLedger([entry], 1000000000).ok).toBe(false);
	const unbounded = {
		...base,
		status: "reserved" as const,
		costUsd: undefined,
		reservedNanodollars: undefined,
	};
	expect(
		auditRequestLedger([{ namespace: "run", record: unbounded }], 1000000000),
	).toEqual({
		ok: false,
		reason: "unresolved request lacks a positive reservation",
	});
	expect(
		auditRequestLedger(
			[{ namespace: "run", record: { ...unbounded, reservedNanodollars: 0 } }],
			1000000000,
		),
	).toEqual({
		ok: false,
		reason: "unresolved request lacks a positive reservation",
	});
	for (const status of ["success", "failure"] as const)
		expect(
			auditRequestLedger(
				[{ namespace: "run", record: { ...unbounded, status } }],
				1000000000,
			),
		).toEqual({
			ok: false,
			reason: "unresolved request lacks a positive reservation",
		});
	const overReservation = { ...base, costUsd: 0.03 };
	expect(
		auditRequestLedger(
			[{ namespace: "run", record: overReservation }],
			1000000000,
		),
	).toEqual({ ok: false, reason: "reported cost exceeds reservation" });
	expect(auditRequestLedger([], -1).ok).toBe(false);
	expect(auditRequestLedger([], NaN).ok).toBe(false);
	expect(auditRequestLedger([], Number.MAX_SAFE_INTEGER + 1).ok).toBe(false);
});

it("rejects component charges that exceed the recorded total or an unresolved reservation", () => {
	const base = success("one");
	const inconsistentTotal = {
		...base,
		routerCostUsd: 0.015,
		reservedNanodollars: 30000000,
	};
	expect(
		auditRequestLedger(
			[{ namespace: "run", record: inconsistentTotal }],
			1000000000,
		),
	).toEqual({
		ok: false,
		reason: "reported cost is below a recorded component",
	});
	const pending = {
		...base,
		status: "reserved" as const,
		costUsd: undefined,
		upstreamCostUsd: 0.03,
	};
	expect(
		auditRequestLedger([{ namespace: "run", record: pending }], 1000000000),
	).toEqual({
		ok: false,
		reason: "reported cost exceeds reservation",
	});
	const pendingComponents = {
		...pending,
		routerCostUsd: 0.015,
		upstreamCostUsd: 0.015,
	};
	expect(
		auditRequestLedger(
			[{ namespace: "run", record: pendingComponents }],
			1000000000,
		),
	).toEqual({ ok: false, reason: "reported cost exceeds reservation" });
});

it("rejects a total that exceeds the safe integer range", () => {
	const entries = Array.from({ length: 91 }, (_, index) => ({
		namespace: "run",
		record: {
			...success(`request-${index}`, 100000),
			reservedNanodollars: undefined,
		},
	}));
	expect(auditRequestLedger(entries, Number.MAX_SAFE_INTEGER)).toEqual({
		ok: false,
		reason: "request ledger total exceeds safe integer range",
	});
});

it("reports an exceeded aggregate limit without inventing remaining budget", () => {
	const result = auditRequestLedger(
		[{ namespace: "run", record: success("one") }],
		5000000,
	);
	if (!result.ok) throw new Error(result.reason);
	expect(result).toMatchObject({
		maximumExposureNanodollars: 10000000,
		remainingNanodollars: 0,
		overLimit: true,
	});
});
