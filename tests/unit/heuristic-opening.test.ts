import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it.each([
	["slow-llm-opening", 0],
	["slow-llm-valid-opening", 4],
])(
	"constructs the LLM menu for %s",
	(fixture, pileChoices) => {
		// A child timeout can interrupt synchronous enumeration; a Vitest timer cannot.
		const output = execFileSync(
			process.execPath,
			[
				"--import",
				"tsx",
				"--input-type=module",
				"-e",
				`import {readFileSync} from "node:fs";
import {botActions} from "./src/bot/heuristic.ts";
const hand = JSON.parse(readFileSync("tests/fixtures/${fixture}.json", "utf8"));
console.log(JSON.stringify(botActions(hand, hand.turn)));`,
			],
			{ encoding: "utf8", timeout: 5000 },
		);
		const actions = JSON.parse(output) as { type: string }[];
		expect(actions.filter((action) => action.type === "takePile")).toHaveLength(
			pileChoices,
		);
		expect(actions.filter((action) => action.type === "draw")).toHaveLength(1);
		expect(actions).toHaveLength(pileChoices + 1);
	},
	10000,
);
