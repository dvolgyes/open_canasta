import { expect, it } from "vitest";
import { siteLocation, sitePath } from "../../src/ui/site-path";

it.each(["/", "/open_canasta/"])("keeps entry links within %s", (root) => {
	for (const page of ["create", "solo"] as const) {
		for (const suffix of ["", "/", "/index.html"]) {
			const path = `${root}${page}${suffix}`;
			expect(siteLocation(path)).toEqual({ root, page });
			expect(sitePath(path, "home")).toBe(root);
		}
	}
});

it("does not treat foreign or lookalike paths as entry pages", () => {
	for (const path of [
		"//elsewhere/solo",
		"/\\elsewhere/solo",
		"https://elsewhere/create",
	]) {
		expect(siteLocation(path)).toEqual({ root: "/", page: "home" });
	}
	for (const path of ["/solo-other/", "/create/extra/", "/%73olo/"]) {
		expect(siteLocation(path).page).toBe("home");
	}
});
