import { expect, type Page, test } from "@playwright/test";
import { pick } from "./pages";

async function automaticClaim(page: Page, disabled: boolean): Promise<void> {
	await page.setContent(
		`<title>Open Canasta</title><button data-testid="pick-S" ${disabled ? "disabled" : ""}>South</button>`,
	);
	const button = page.getByTestId("pick-S");
	let operations = 0;
	const delayed = new Proxy(button, {
		get(target, property) {
			const value: unknown = Reflect.get(target, property, target);
			if (typeof value !== "function") return value;
			return async (...args: unknown[]) => {
				const operation = ++operations;
				if (operation > 1)
					await new Promise((resolve) => setTimeout(resolve, 150));
				const result: unknown = await Reflect.apply(value, target, args);
				if (operation === 1)
					await page.evaluate(() => {
						setTimeout(() => {
							document.querySelector('[data-testid="pick-S"]')?.remove();
							document.title = "Open Canasta: player2 (S)";
						}, 10);
					});
				return result;
			};
		},
	});
	Object.defineProperty(page, "getByTestId", { value: () => delayed });
}

test("seat selection handles an automatic claim while the picker is unavailable", async ({
	page,
}) => {
	test.setTimeout(10_000);
	await automaticClaim(page, true);
	await pick(page, "S");
});

test("seat selection handles an automatic claim before its click", async ({
	page,
}) => {
	test.setTimeout(10_000);
	await automaticClaim(page, false);
	await pick(page, "S");
});

test("seat selection rejects duplicate controls", async ({ page }) => {
	await page.setContent(
		'<title>Open Canasta</title><button data-testid="pick-S">South</button><button data-testid="pick-S">South</button>',
	);
	await expect(pick(page, "S")).rejects.toThrow("multiple seat buttons");
});
