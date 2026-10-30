import { expect, it } from "vitest";
import { formatBuildDate } from "../../src/build";

it("formats the commit date in the viewer's time zone and keeps unknown dates", () => {
	expect(formatBuildDate("2026-10-24T13:49:07+00:00", "UTC")).toBe(
		"Oct 24,'26, 13:49",
	);
	expect(formatBuildDate("2026-10-24T13:29:07+02:00", "Europe/Budapest")).toBe(
		"Oct 24,'26, 13:29",
	);
	expect(formatBuildDate("unknown", "UTC")).toBe("unknown");
});
