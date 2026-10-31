import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("constructs the LLM menu for a large pile whose opening is impossible", () => {
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
const hand = JSON.parse(readFileSync("tests/fixtures/slow-llm-opening.json", "utf8"));
console.log(JSON.stringify(botActions(hand, hand.turn)));`,
		],
		{ encoding: "utf8", timeout: 5000 },
	);
	expect(JSON.parse(output)).toEqual([{ type: "draw" }]);
}, 10000);
