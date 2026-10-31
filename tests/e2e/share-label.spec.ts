import { expect, test } from "@playwright/test";

test("the table invitation uses the same clear label on desktop and phone", async ({
	page,
}) => {
	await page.goto("/solo/");
	await page.getByLabel("Your name").fill("Alice");
	await page.getByTestId("create-solo").click();
	await expect(page.getByTestId("table")).toHaveAttribute("data-phase", "play");
	await expect(page.getByTestId("copy-table-url")).toHaveAccessibleName(
		"Send link to players",
	);
	await page.setViewportSize({ width: 360, height: 780 });
	await expect(
		page.getByRole("button", { name: "Send link to players" }).first(),
	).toBeVisible();
});
