import { expect, it } from "vitest";
import { parseReplacementOffer } from "../../src/community/replacement";

it("accepts only a bounded replacement offer with a valid table key, seat, and host name", () => {
	const offer = {
		k: "replacement-offer",
		key: "A".repeat(43),
		seat: "E",
		host: "Alice",
	};
	expect(parseReplacementOffer(offer, 1_000)).toEqual({
		key: offer.key,
		seat: "E",
		host: "Alice",
		receivedAt: 1_000,
	});
	for (const invalid of [
		{ ...offer, key: "bad" },
		{ ...offer, seat: "X" },
		{ ...offer, host: "bad\u0000name" },
		{ ...offer, k: "other" },
	])
		expect(parseReplacementOffer(invalid, 0)).toBeUndefined();
});
