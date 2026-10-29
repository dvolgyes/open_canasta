import { describe, expect, it } from "vitest";
import { quality } from "../../src/ui/network-quality";

describe("network quality", () => {
	it.each([
		[100, "excellent", 5],
		[300, "good", 4],
		[600, "average", 3],
		[1990, "poor", 2],
		[2000, "breaking-up", 1],
	] as const)("classifies %i ms as %s", (ms, label, bars) => {
		expect(quality({ ms, lower: false })).toEqual({ label, bars });
	});

	it("marks a timed-out measurement as breaking up", () => {
		expect(quality({ ms: 5000, lower: true })).toEqual({
			label: "breaking-up",
			bars: 1,
		});
	});
});
