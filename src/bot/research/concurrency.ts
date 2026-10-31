/** Bound concurrent jobs and retain input order, including when a worker fails. */
export async function mapConcurrent<T, R>(
	items: readonly T[],
	concurrency: number,
	map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (!Number.isSafeInteger(concurrency) || concurrency < 1)
		throw new Error("concurrency must be a positive integer");
	const results = new Array<R>(items.length);
	let next = 0;
	let failed = false;
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		async () => {
			while (!failed && next < items.length) {
				const index = next++;
				const item = items[index];
				if (item === undefined) throw new Error("missing work item");
				await Promise.resolve()
					.then(() => map(item, index))
					.then(
						(result) => {
							results[index] = result;
						},
						(error: unknown) => {
							failed = true;
							throw error;
						},
					);
			}
		},
	);
	const outcomes = await Promise.allSettled(workers);
	for (const outcome of outcomes)
		if (outcome.status === "rejected") throw outcome.reason;
	return results;
}
