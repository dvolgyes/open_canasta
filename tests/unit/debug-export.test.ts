import { expect, it } from "vitest";
import type { TableView } from "../../src/p2p/table";
import { diagnosticExport } from "../../src/ui/debug-export";

it("exports useful connection counts without table contents, keys, or peer identifiers", () => {
	const secret = "secret-canary";
	const view = {
		status: "open",
		seat: "W",
		hostSeat: "W",
		hosting: true,
		allConnected: false,
		persistent: true,
		writable: true,
		table: { state: { hand: [secret] }, config: { names: { N: secret } } },
		outbox: [{ payload: { text: secret } }],
		peers: [
			{
				peer: secret,
				seat: "N",
				roundTrip: { ms: 42, lower: false, extra: secret },
				build: { date: "2026-10-30T12:00:00Z", commit: "abcd1234" },
			},
		],
		pageReports: [
			{
				seat: "N",
				page: {
					form: "compact",
					layout: "sideways",
					width: 800,
					height: 400,
					userAgent: secret,
				},
			},
		],
		network: {
			trackersOpen: 1,
			trackers: 4,
			mqttBrokersOpen: 2,
			mqttBrokers: 3,
			peers: 1,
			wrongKey: 0,
			sendFailures: 0,
			extra: secret,
		},
	} as unknown as TableView;
	const exported = diagnosticExport(view, {
		commit: "abcd1234",
		date: "2026-10-30T12:00:00Z",
	});
	expect(exported.network).toMatchObject({
		trackersOpen: 1,
		mqttBrokersOpen: 2,
	});
	expect(exported.peers).toEqual([
		{
			seat: "N",
			roundTrip: { ms: 42, lower: false },
			build: { date: "2026-10-30T12:00:00Z", commit: "abcd1234" },
		},
	]);
	expect(JSON.stringify(exported)).not.toContain(secret);
	expect(exported.pages).toEqual([
		{
			seat: "N",
			page: { form: "compact", layout: "sideways", width: 800, height: 400 },
		},
	]);
});

it("does not export malformed participant build claims", () => {
	const view = {
		network: null,
		peers: [
			{
				peer: "id",
				seat: "N",
				build: { date: "invalid-secret", commit: "secret" },
			},
		],
	} as unknown as TableView;
	const exported = diagnosticExport(view, {
		date: "unknown",
		commit: "unknown",
	});
	expect(exported.peers).toEqual([{ seat: "N" }]);
	expect(JSON.stringify(exported)).not.toContain("secret");
});
