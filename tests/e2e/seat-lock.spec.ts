import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";
import { buildTrackerUrls } from "./player";
import { RelayHub } from "./relay-hub";

test("a host stops when another tab takes its seat lock", async ({
	page,
	context,
}) => {
	const hub = new RelayHub("tracker", buildTrackerUrls());
	await hub.install(context, "lock-test");
	await page.goto("/");
	await createTableLink(page);
	const lockName = await page.evaluate(async () => {
		const locks = await navigator.locks.query();
		return locks.held?.find(
			(lock) =>
				lock.name?.startsWith("dvolgyes-open_canasta.seat.") &&
				lock.name.endsWith(".W"),
		)?.name;
	});
	if (!lockName) throw new Error("host seat lock was not held");
	const other = await context.newPage();
	try {
		await other.goto("/");
		await other.evaluate((name) => {
			void navigator.locks.request(name, { steal: true }, () => {
				document.documentElement.dataset.stolenLock = "held";
				return new Promise<void>(() => {});
			});
		}, lockName);
		await expect(other.locator("html")).toHaveAttribute(
			"data-stolen-lock",
			"held",
		);
		await expect(page.getByTestId("banner")).toContainText(
			"This tab was superseded: another tab of this browser holds this seat now",
		);
	} finally {
		await other.close();
	}
});
