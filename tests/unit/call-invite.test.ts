import { expect, it } from "vitest";
import { NO_INVITE, nextInvite } from "../../src/ui/call-model";

it("invites once per host call and does not invite a player already in it", () => {
	const invited = nextInvite(NO_INVITE, true, false);
	expect(invited.due).toBe(true);
	const declined = { ...invited, due: false };
	expect(nextInvite(declined, true, false).due).toBe(false);
	expect(nextInvite(invited, true, true).due).toBe(false);
	expect(nextInvite(NO_INVITE, true, true).due).toBe(false);
	expect(nextInvite(nextInvite(declined, false, false), true, false).due).toBe(
		true,
	);
});
