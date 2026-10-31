import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import { chooseModernPosition } from "../../src/bot/modern-search";
import { createCanastaModule, startPayload } from "../../src/game/canasta";
import { parseModernState } from "../../src/game/modern";
import type { ApplyContext } from "../../src/game/module";
import {
	PROTOCOL_VERSION,
	SEATS,
	type Seat,
	type TableConfig,
} from "../../src/protocol";

const tableId = "modern-bot-hand";
const config: TableConfig = {
	names: { N: "North", E: "East", S: "South", W: "West" },
	rules: "modern",
};
const context = (seat: Seat): ApplyContext => ({
	tableId,
	config,
	seat,
	present: SEATS,
	holder: `holder-${seat}`,
	commandId: "00000000-0000-4000-8000-000000000001",
	seq: 1,
});

it.each([0, 5])(
	"plays complete modern hands through the replicated boundary with a %i ms search budget",
	async (timeMs) => {
		for (const seed of [1, 2, 3]) {
			const module = createCanastaModule((bound) => seed % bound);
			const started = module.apply(
				module.initialState(tableId, config),
				context("N"),
				startPayload(tableId),
			);
			if (!started.ok) throw new Error(started.reason);
			let state = started.state;
			for (let count = 0; count < 250; count++) {
				const table = parseModernState(state, tableId);
				if (!table?.match)
					throw new Error(`invalid state at seed ${seed}, action ${count}`);
				if (table.match.settled) break;
				const actor = table.match.hand.turn;
				const seat = SEATS[actor];
				if (!seat) throw new Error("invalid actor");
				const result = await chooseModernPosition(
					observeModern(table.match.hand, actor, table.history),
					{ timeMs },
				);
				if (!result.action)
					throw new Error(`no bot action at seed ${seed}, action ${count}`);
				const next = module.apply(state, context(seat), {
					v: PROTOCOL_VERSION,
					tableId,
					type: "action",
					match: table.matches,
					hand: table.match.handNo,
					at: table.actions,
					action: result.action,
				});
				if (!next.ok)
					throw new Error(`seed ${seed}, action ${count}: ${next.reason}`);
				state = next.state;
			}
			expect(
				parseModernState(state, tableId)?.match?.settled,
				`seed ${seed}`,
			).toBe(true);
		}
	},
	30_000,
);
