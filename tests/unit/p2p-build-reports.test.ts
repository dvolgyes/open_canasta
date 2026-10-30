import { expect, it } from "vitest";
import { BuildReports } from "../../src/p2p/build-reports";

it("reports a newer connected peer build and forgets it when the peer leaves", () => {
	const reports = new BuildReports("2026-10-01T12:00:00Z");
	expect(reports.record("older", "2026-09-01T12:00:00Z")).toBe(true);
	expect(reports.newer()).toBeUndefined();
	expect(reports.record("newer", "2026-10-02T12:00:00Z")).toBe(true);
	expect(reports.newer()).toBe("2026-10-02T12:00:00Z");
	expect(reports.record("newer", "not a date")).toBe(false);
	expect(reports.newer()).toBe("2026-10-02T12:00:00Z");
	reports.forget("newer");
	expect(reports.newer()).toBeUndefined();
});

it("bounds the number of reports and ignores unknown local builds", () => {
	const reports = new BuildReports("unknown");
	for (let index = 0; index < 12; index++)
		expect(reports.record(String(index), "2026-10-02T12:00:00Z")).toBe(true);
	expect(reports.record("overflow", "2026-10-03T12:00:00Z")).toBe(false);
	expect(reports.newer()).toBeUndefined();
});
