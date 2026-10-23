import { describe, expect, it } from "vitest";
import { envelopeEvent, parseTableConfig, seatLabel } from "../../src/protocol";
import { CONFIG, TABLE_ID } from "./fixtures";

describe("parseTableConfig", () => {
	it("accepts a complete configuration", () => {
		expect(parseTableConfig(structuredClone(CONFIG))).toEqual(CONFIG);
	});

	it("validates bot seats, full model names, retry count, and delay", () => {
		const botSetup = {
			seats: ["W"],
			model: "inception/mercury-3",
			fallbackModel: "openai/gpt-6-luna",
			retries: 5,
			retryDelayMs: 5000,
		};
		expect(parseTableConfig({ ...CONFIG, botSetup })).toEqual({
			...CONFIG,
			botSetup,
		});
		expect(
			parseTableConfig({
				...CONFIG,
				botSetup: { ...botSetup, model: "other" },
			}),
		).toBeUndefined();
		expect(
			parseTableConfig({ ...CONFIG, botSetup: { ...botSetup, retries: 99 } }),
		).toBeUndefined();
	});

	it("does not infer bot seats from player names", () => {
		const botSetup = {
			seats: [],
			model: "inception/mercury-3",
			fallbackModel: "openai/gpt-6-luna",
			retries: 5,
			retryDelayMs: 5000,
		};
		const config = {
			...CONFIG,
			names: { ...CONFIG.names, N: "robot", E: "bot" },
			botSetup,
		};
		expect(parseTableConfig(config)?.botSetup?.seats).toEqual([]);
	});

	it("keeps a rule variant, and rejects an unknown one", () => {
		expect(parseTableConfig({ ...CONFIG, rules: "viennese" })).toEqual({
			...CONFIG,
			rules: "viennese",
		});
		expect(parseTableConfig({ ...CONFIG, rules: "house" })).toBeUndefined();
	});

	it.each([
		["a missing name", { ...CONFIG, names: { ...CONFIG.names, E: undefined } }],
		["an empty name", { ...CONFIG, names: { ...CONFIG.names, E: "" } }],
	])("rejects %s", (_label, value) => {
		expect(parseTableConfig(value)).toBeUndefined();
	});
});

describe("seat helpers", () => {
	it("labels a seat with its direction and predefined name", () => {
		expect(seatLabel(CONFIG, "N")).toBe("North — player1");
	});
});

describe("envelopeEvent", () => {
	it("lets the envelope win over forged body fields", () => {
		const event = envelopeEvent(
			{ tableId: TABLE_ID, seq: 4, commandId: "cmd", fromSeat: "S" },
			{
				text: "hi",
				v: 9,
				tableId: "elsewhere",
				type: "chat",
				seq: 1,
				commandId: "other",
				fromSeat: "W",
			},
		);
		expect(event).toEqual({
			text: "hi",
			v: 1,
			tableId: TABLE_ID,
			type: "event",
			seq: 4,
			commandId: "cmd",
			fromSeat: "S",
		});
	});
});
