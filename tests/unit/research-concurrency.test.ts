import { expect, it } from "vitest";
import { mapConcurrent } from "../../src/bot/research/concurrency";

it("bounds active work, preserves input order, and drains started work after a failure", async () => {
	let active = 0,
		maximum = 0;
	const results = await mapConcurrent([0, 1, 2, 3], 2, async (n) => {
		active++;
		maximum = Math.max(maximum, active);
		await new Promise((resolve) => setImmediate(resolve));
		active--;
		return n * n;
	});
	expect(results).toEqual([0, 1, 4, 9]);
	expect(maximum).toBe(2);
	const started: number[] = [];
	let drained = false;
	await expect(
		mapConcurrent([0, 1, 2, 3], 2, async (n) => {
			started.push(n);
			if (n === 0) throw new Error("failed task");
			await new Promise((resolve) => setImmediate(resolve));
			drained = true;
			return n;
		}),
	).rejects.toThrow("failed task");
	expect(drained).toBe(true);
	expect(started).toEqual([0, 1]);
});
