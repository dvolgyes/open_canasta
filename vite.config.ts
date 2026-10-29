import dgram from "node:dgram";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import type { BrowserCommandContext } from "vitest/node";

// Only public tracker, MQTT and STUN configuration may carry these prefixes, because Vite inlines them into the bundle.
const ENV_PREFIXES = ["VITE_TRACKER_", "VITE_STUN_", "VITE_MQTT_"];

// Chrome cannot turn its touch emulation off again, so this file runs in a browser of its own.
const TOUCH = "tests/browser/call-device-class.test.ts";
// This file needs a Chrome whose test devices have no camera.
const NO_CAMERA = "tests/browser/call-media-no-camera.test.ts";

/** Headless Chrome with its generated test microphone and camera, as in the end-to-end tests. */
function chrome(fakeDevices = "--use-fake-device-for-media-stream") {
	const stunServers = new Map<number, dgram.Socket>();
	return {
		enabled: true,
		headless: true,
		provider: playwright({
			launchOptions: { channel: "chrome", args: [fakeDevices] },
			contextOptions: { permissions: ["microphone", "camera"] },
		}),
		instances: [{ browser: "chromium" as const }],
		commands: {
			startStunServer: async () => {
				const socket = dgram.createSocket("udp4");
				socket.on("message", (request, from) => {
					if (request.length < 20 || request.readUInt16BE(0) !== 1) return;
					const response = Buffer.alloc(32);
					response.writeUInt16BE(0x0101, 0);
					response.writeUInt16BE(12, 2);
					request.copy(response, 4, 4, 20);
					response.writeUInt16BE(0x0020, 20);
					response.writeUInt16BE(8, 22);
					response.writeUInt16BE(1, 24);
					response.writeUInt16BE(4242 ^ 0x2112, 26);
					response.writeUInt32BE((0xcb007107 ^ 0x2112a442) >>> 0, 28);
					socket.send(response, from.port, from.address);
				});
				await new Promise<void>((resolve) =>
					socket.bind(0, "127.0.0.1", resolve),
				);
				const { port } = socket.address();
				stunServers.set(port, socket);
				return port;
			},
			stopStunServer: (_context: BrowserCommandContext, port: number) => {
				stunServers.get(port)?.close();
				stunServers.delete(port);
			},
			/** Withdraws every permission of the page; Chrome then ends the live capture tracks. */
			clearPermissions: (context: BrowserCommandContext) =>
				context.context.clearPermissions(),
			grantPermissions: (context: BrowserCommandContext, names: string[]) =>
				context.context.grantPermissions(names),
		},
	};
}

export default defineConfig({
	base: "./",
	envPrefix: ENV_PREFIXES,
	build: {
		target: "es2022",
		sourcemap: true,
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["tests/unit/**/*.test.ts"],
					environment: "node",
				},
			},
			{
				extends: true,
				test: {
					name: "browser",
					include: ["tests/browser/**/*.test.ts"],
					exclude: [...configDefaults.exclude, TOUCH, NO_CAMERA],
					// The files share the page's real IndexedDB and Web Storage, so they run one at a time.
					fileParallelism: false,
					browser: chrome(),
				},
			},
			{
				extends: true,
				test: {
					name: "browser-touch",
					include: [TOUCH],
					browser: chrome(),
				},
			},
			{
				extends: true,
				test: {
					name: "browser-no-camera",
					include: [NO_CAMERA],
					browser: chrome("--use-fake-device-for-media-stream=device-count=0"),
				},
			},
		],
	},
});
