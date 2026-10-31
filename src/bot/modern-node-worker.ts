import { parentPort, workerData } from "node:worker_threads";
import { mulberry32 } from "../canasta/random";
import type {
	ModernNodeWorkerMessage,
	ModernNodeWorkerRequest,
} from "./modern-node-search";
import { chooseModernPosition } from "./modern-search";

if (!parentPort) throw new Error("modern search worker requires a parent");
const port = parentPort;
const request = workerData as ModernNodeWorkerRequest;
const send = (message: ModernNodeWorkerMessage) => port.postMessage(message);
void chooseModernPosition(request.observation, {
	...request.options,
	timeMs: Math.max(
		0,
		request.deadline - (performance.timeOrigin + performance.now()),
	),
	rng: mulberry32(request.seed),
	onProgress: (result) => send({ kind: "progress", result }),
}).then(
	(result) => send({ kind: "complete", result }),
	(error: unknown) =>
		send({
			kind: "error",
			message:
				error instanceof Error ? error.message : "modern search worker failed",
		}),
);
