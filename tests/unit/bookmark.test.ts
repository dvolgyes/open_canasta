import { describe, expect, it } from "vitest";
import {
	bookmarkQuery,
	botSeatsQuery,
	parseAutoplaySeats,
	parseBookmark,
	parseSelectedPlayer,
	parseTableSetup,
	selectedPlayerQuery,
} from "../../src/bookmark";

it("reads one valid seat or explicit visitor selection", () => {
	expect(parseSelectedPlayer("?pl=N")).toBe("N");
	expect(parseSelectedPlayer("?pl=none")).toBe("none");
	for (const query of ["", "?pl=unknown", "?pl=none&pl=N", "?pl=N&pl=N"])
		expect(parseSelectedPlayer(query), query).toBeUndefined();
	const query = selectedPlayerQuery("?n=Alice&pl=N", "none");
	expect(new URLSearchParams(query).get("n")).toBe("Alice");
	expect(parseSelectedPlayer(query)).toBe("none");
});

describe("parseBookmark", () => {
	it("normalizes bookmark names and ignores control characters", () => {
		expect(parseBookmark("?s=Ce%CC%81line&n=Alice%07Bob").names).toEqual({
			S: "Céline",
		});
	});
	it("reads the four names and the host seat by direction", () => {
		expect(parseBookmark("?n=ann&e=zsdh&s=bo&w=dvolgyes&h=W")).toEqual({
			names: { N: "ann", E: "zsdh", S: "bo", W: "dvolgyes" },
			host: "W",
		});
	});

	it("trims names and drops empty ones", () => {
		expect(parseBookmark("?e=%20%20zsdh%20&w=%20")).toEqual({
			names: { E: "zsdh" },
		});
	});

	it("drops a name longer than 40 characters, counting characters not bytes", () => {
		const forty = "é".repeat(40);
		expect(parseBookmark(`?e=${forty}`).names).toEqual({ E: forty });
		expect(parseBookmark(`?e=${forty}x`).names).toEqual({});
	});

	it("ignores unknown keys, seat letters and other values", () => {
		expect(
			parseBookmark("?E=zsdh&hostseat=east&h=up&SOUTH=bo&table=1"),
		).toEqual({ names: {} });
	});

	it("keeps the first value of a repeated key", () => {
		expect(parseBookmark("?e=first&e=second").names).toEqual({
			E: "first",
		});
	});

	it("reads an empty query as no prefill", () => {
		expect(parseBookmark("")).toEqual({ names: {} });
	});
});

describe("bookmarkQuery", () => {
	it("uses compact seat, host, and bot-seat parameters", () => {
		const names = { N: "North", E: "East", S: "South", W: "West" };
		const query = botSeatsQuery(bookmarkQuery(names, "S"), ["E", "W"]);
		const params = new URLSearchParams(query);
		expect(params.get("n")).toBe("North");
		expect(params.get("h")).toBe("S");
		expect(params.get("b")).toBe("EW");
		expect(parseTableSetup(query)?.config.names).toEqual(names);
		expect(parseTableSetup(query)?.config.botSetup?.seats).toEqual(["E", "W"]);
	});
	it("rejects invalid, repeated, or duplicated bot-seat parameters", () => {
		const names = { N: "North", E: "East", S: "South", W: "West" };
		const query = bookmarkQuery(names, "S");
		for (const seats of ["EE", "EX", "e", "E,W", "E&b=W"]) {
			expect(parseTableSetup(`${query}&b=${seats}`), seats).toBeUndefined();
		}
	});
	it("saves only autoplay seats that are also bot seats", () => {
		const query = botSeatsQuery("?pl=W", ["N", "E"], ["N", "W"]);
		expect(parseAutoplaySeats(query)).toEqual(["N"]);
		expect(parseAutoplaySeats(botSeatsQuery(query, ["E"], ["N"]))).toEqual([]);
	});
	it("updates the bot-seat snapshot without changing other table settings", () => {
		const query = botSeatsQuery(
			"?n=North&e=East&h=W&b=N&bot_model=custom/model&pl=W",
			["W", "E"],
		);
		const params = new URLSearchParams(query);
		expect(params.get("b")).toBe("EW");
		expect(params.get("bot_model")).toBe("custom/model");
		expect(params.get("pl")).toBe("W");
		expect(params.get("n")).toBe("North");
	});

	it("writes the names by direction and the host seat", () => {
		const query = bookmarkQuery(
			{ N: "player1", E: "zsdh", S: "player2", W: "dvolgyes" },
			"E",
		);
		expect(query).toBe("n=player1&e=zsdh&s=player2&w=dvolgyes&h=E");
	});

	it("encodes initial bot seats and model/retry settings without an API key", () => {
		const query = bookmarkQuery(
			{ N: "player1", E: "player3", S: "player2", W: "player4" },
			"W",
			{
				seats: ["W"],
				model: "inception/mercury-3",
				fallbackModel: "openai/gpt-6-luna",
				retries: 5,
				retryDelayMs: 5000,
			},
		);
		expect(query).toContain("b=W");
		expect(query).toContain("bot_model=inception%2Fmercury-3");
		expect(query).toContain("bot_fallback=openai%2Fgpt-6-luna");
		expect(query).toContain("bot_retries=5");
		expect(query).toContain("bot_delay_ms=5000");
		expect(query).not.toMatch(/api.?key|secret/i);
		expect(parseTableSetup(`?${query}`)?.config.botSetup).toEqual({
			seats: ["W"],
			model: "inception/mercury-3",
			fallbackModel: "openai/gpt-6-luna",
			retries: 5,
			retryDelayMs: 5000,
		});
	});

	it("encodes a rule variant other than classic, and refuses a setup with an unknown one", () => {
		const names = { N: "player1", E: "player3", S: "player2", W: "player4" };
		const query = bookmarkQuery(names, "N", undefined, "two-canastas");
		expect(query).toContain("rules=two-canastas");
		expect(parseBookmark(`?${query}`).rules).toBe("two-canastas");
		expect(parseTableSetup(`?${query}`)?.config.rules).toBe("two-canastas");
		expect(bookmarkQuery(names, "N", undefined, "classic")).not.toContain(
			"rules",
		);
		const unknown = `?${bookmarkQuery(names, "N")}&rules=house`;
		expect(parseBookmark(unknown).rules).toBeUndefined();
		expect(parseTableSetup(unknown)).toBeUndefined();
	});

	it("round-trips through parseBookmark, including characters that need escaping", () => {
		const names = { N: "a&b=c", E: "x y", S: "é+ü", W: "#1" };
		expect(parseBookmark(`?${bookmarkQuery(names, "S")}`)).toEqual({
			names,
			host: "S",
		});
	});
});
