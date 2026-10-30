import { parentPort, workerData } from "node:worker_threads";
import { type MatchPlan, playMatch } from "../src/bot/research/arena";
import { type LocalPolicy, localAgent } from "../src/bot/research/policies";

const task = workerData as { plan: MatchPlan; a: LocalPolicy; b: LocalPolicy };
const result = await playMatch(task.plan, (_seat, side) =>
	localAgent(side === "a" ? task.a : task.b),
);
parentPort?.postMessage(result);
