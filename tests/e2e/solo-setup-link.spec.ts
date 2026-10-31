import { expect, test } from "@playwright/test";
import { createTableLink } from "./pages";
import { buildTrackerUrls } from "./player";
import { RelayHub } from "./relay-hub";

test("a solo setup link without a selected seat starts its only human seat", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("missing base URL");
	const creator = await browser.newContext({ baseURL });
	const visitor = await browser.newContext({ baseURL });
	try {
		const relay = new RelayHub("tracker", buildTrackerUrls());
		await relay.install(creator, "solo-original");
		await relay.install(visitor, "solo-return");
		const original = await creator.newPage();
		await original.goto("/solo/");
		await original.getByLabel("Your name").fill("Alice");
		await original.getByTestId("create-solo").click();
		await expect(original.getByTestId("table")).toHaveAttribute(
			"data-phase",
			"play",
		);
		const link = new URL(original.url());
		link.searchParams.delete("pl");
		await creator.close();
		const page = await visitor.newPage();
		await page.goto(link.toString());
		await expect(page.getByTestId("table")).toHaveAttribute(
			"data-phase",
			"play",
			{ timeout: 10_000 },
		);
		await expect(page).toHaveTitle(/Alice \(S, host\)/);
	} finally {
		await visitor.close();
		await creator.close();
	}
});

test("the last host restarts an abandoned multiplayer setup after losing its table", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("missing base URL");
	const context = await browser.newContext({ baseURL });
	try {
		await new RelayHub("tracker", buildTrackerUrls()).install(
			context,
			"returning-host",
		);
		const first = await context.newPage();
		await first.goto("/");
		const link = await createTableLink(first);
		await expect(first).toHaveTitle(/player4 \(W, host\)/);
		await first.close();
		const cleaner = await context.newPage();
		await cleaner.goto("/");
		await cleaner.evaluate(
			() =>
				new Promise<void>((resolve, reject) => {
					const request = indexedDB.deleteDatabase("dvolgyes-open_canasta.p2p");
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
					request.onblocked = () =>
						reject(new Error("database deletion blocked"));
				}),
		);
		await cleaner.close();
		const returning = await context.newPage();
		await returning.goto(link);
		await expect(returning).toHaveTitle(/player4 \(W, host\)/, {
			timeout: 12_000,
		});
	} finally {
		await context.close();
	}
});
