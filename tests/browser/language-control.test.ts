import { expect, it, vi } from "vitest";
import { languageControl } from "../../src/ui/language-control";

it("shows the build date and commit beside the language selector", () => {
	const control = languageControl(
		{
			t: (message) => message,
			browser: undefined,
			savedLocale: undefined,
			locale: "en",
		},
		undefined,
		undefined,
		{ commit: "1d12f39", date: "2026-10-24T13:49:07Z" },
	);
	const version = control.querySelector<HTMLElement>(
		'[data-testid="build-version"]',
	);
	expect(version?.title).toBe("1d12f39");
	expect(version?.textContent).toMatch(/Oct (24|25)/);
	expect(control.querySelector('[aria-label="Language"]')).not.toBeNull();
});

it("waits for the table to prepare before reloading after a language change", async () => {
	const reload = vi.fn();
	let release: (() => void) | undefined;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	const deps = {
		t: (message: string) => message,
		browser: {
			setItem: vi.fn(),
			removeItem: vi.fn(),
			getItem: vi.fn(),
			key: vi.fn(),
			length: 0,
		},
		savedLocale: undefined,
		locale: "en" as const,
	};
	const control = languageControl(deps, () => ready, reload);
	const select = control.querySelector("select");
	if (!select) throw new Error("language selector is missing");
	select.value = "de";
	select.dispatchEvent(new Event("change"));
	expect(reload).not.toHaveBeenCalled();
	release?.();
	await ready;
	await Promise.resolve();
	expect(reload).toHaveBeenCalledOnce();
});
