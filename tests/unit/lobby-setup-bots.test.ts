import { expect, it } from "vitest";
import { DEFAULT_BOT_SETUP } from "../../src/protocol";
import { lobbyScreen } from "../../src/ui/model";

it("keeps setup-link bot seats reserved before a host is found", () => {
	const result = lobbyScreen({
		status: "open",
		supersededBy: null,
		election: { phase: "nobody-here" },
		lobby: null,
		heldElsewhere: [],
		setup: {
			config: {
				names: { N: "North", E: "East", S: "South", W: "West" },
				botSetup: { ...DEFAULT_BOT_SETUP, seats: ["N", "E", "W"] },
			},
		},
	});
	if (result.kind !== "lobby") throw new Error("expected lobby");
	expect(
		result.choices?.filter((seat) => seat.free).map((seat) => seat.seat),
	).toEqual(["S"]);
	for (const seat of ["N", "E", "W"])
		expect(result.choices?.find((item) => item.seat === seat)?.label).toContain(
			"(bot)",
		);
});
