import { spawn, spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("exits after SIGTERM even when relay sockets were opened", async () => {
	const child = spawn(
		process.execPath,
		[
			"--import",
			"tsx",
			"--require",
			"./tests/fixtures/observe-websocket.cjs",
			"src/bot/cli.ts",
			"--random",
			"http://localhost/?n=bot&e=E&s=S&w=W&h=S#k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		],
		{
			env: {
				...process.env,
				VITE_TRACKER_URLS: "wss://127.0.0.1:1",
				VITE_MQTT_BROKER_URLS: "wss://127.0.0.1:1",
				VITE_STUN_URLS: "none",
			},
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		},
	);
	let opened = false;
	child.on("message", (message) => {
		if (message === "relay socket opened" && !opened) {
			opened = true;
			child.disconnect();
			child.kill("SIGTERM");
		}
	});
	const limit = setTimeout(() => child.kill("SIGKILL"), 20_000);
	try {
		const result = await new Promise<{
			code: number | null;
			signal: string | null;
		}>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, exitSignal) =>
				resolve({ code, signal: exitSignal }),
			);
		});
		expect(opened).toBe(true);
		expect(result).toEqual({ code: 130, signal: null });
	} finally {
		clearTimeout(limit);
		child.kill("SIGKILL");
	}
}, 25_000);

it("flushes its error and exits unsuccessfully for invalid arguments", () => {
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", "src/bot/cli.ts", "--invalid-option"],
		{ encoding: "utf8", timeout: 10_000 },
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("unknown option: --invalid-option");
});
