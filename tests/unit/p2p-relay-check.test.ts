import { describe, expect, it, vi } from "vitest";
import { RelayChecks } from "../../src/p2p/relay-check";

describe("optional relay checks", () => {
	it("replaces a silent relay only when nothing arrived after its check", async () => {
		const check = vi.fn().mockResolvedValue("silent");
		const checks = new RelayChecks(check);
		expect(checks.tick("relay", 29_999, 0, true)).toBe(false);
		expect(checks.tick("relay", 30_000, 0, true)).toBe(false);
		await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
		expect(checks.tick("relay", 30_001, 0, true)).toBe(true);
		expect(checks.tick("relay", 60_000, 0, true)).toBe(false);
		await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(2));
		expect(checks.tick("relay", 60_001, 60_001, true)).toBe(false);
	});

	it("stops checking a relay that refuses the probe", async () => {
		const check = vi.fn().mockResolvedValue("refused");
		const checks = new RelayChecks(check);
		checks.tick("relay", 30_000, 0, true);
		await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
		expect(checks.tick("relay", 90_000, 0, true)).toBe(false);
		expect(check).toHaveBeenCalledTimes(1);
	});

	it("does not replace a relay after an answered or unsent probe", async () => {
		for (const answer of ["answered", "not-sent"] as const) {
			const checks = new RelayChecks(async () => answer);
			checks.tick("relay", 30_000, 0, true);
			await Promise.resolve();
			expect(checks.tick("relay", 30_001, 30_001, true)).toBe(false);
		}
	});

	it("ignores an answer to a check disabled while it was pending", async () => {
		let finish: ((value: "silent") => void) | undefined;
		const checks = new RelayChecks(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		checks.tick("relay", 30_000, 0, true);
		checks.tick("relay", 30_001, 0, false);
		if (!finish) throw new Error("check did not start");
		finish("silent");
		await Promise.resolve();
		expect(checks.tick("relay", 30_002, 0, false)).toBe(false);
		expect(checks.tick("relay", 30_003, 0, true)).toBe(false);
	});

	it("does not let an older probe replace a newer pending probe", async () => {
		const finishes: ((answer: "silent") => void)[] = [];
		const checks = new RelayChecks(
			() => new Promise((resolve) => finishes.push(resolve)),
		);
		checks.tick("relay", 30_000, 0, true);
		checks.tick("relay", 30_001, 0, false);
		checks.tick("relay", 30_002, 0, true);
		if (!finishes[0] || !finishes[1]) throw new Error("checks did not start");
		finishes[0]("silent");
		await Promise.resolve();
		expect(checks.tick("relay", 30_003, 0, true)).toBe(false);
		finishes[1]("silent");
		await Promise.resolve();
		expect(checks.tick("relay", 30_004, 0, true)).toBe(true);
	});
});
