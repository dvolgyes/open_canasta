import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { build, preview } from "vite";
import { createTableLink } from "./pages";

for (const setting of [
	{ name: "custom relay", value: "wss://nostr-build-config.test" },
	{ name: "disabled relay", value: "none" },
	{
		name: "invalid relay",
		value: "wss://user:example-secret@nostr-build-config.test",
		invalid: true,
	},
	{ name: "invalid MQTT broker", value: "none", invalidMqtt: true },
] as const) {
	test(`a production build respects ${setting.name}`, async ({ browser }) => {
		test.setTimeout(120_000);
		const output = await mkdtemp(join(tmpdir(), "canasta-nostr-build-"));
		const names = [
			"VITE_TRACKER_URLS",
			"VITE_MQTT_BROKER_URLS",
			"VITE_NOSTR_RELAY_URLS",
			"VITE_STUN_URLS",
		] as const;
		const previous = names.map((name) => process.env[name]);
		process.env.VITE_TRACKER_URLS = "none";
		process.env.VITE_MQTT_BROKER_URLS =
			"invalidMqtt" in setting
				? "wss://user:example-secret@mqtt-build-config.test"
				: "none";
		process.env.VITE_NOSTR_RELAY_URLS = setting.value;
		process.env.VITE_STUN_URLS = "none";
		let server: Awaited<ReturnType<typeof preview>> | undefined;
		const context = await browser.newContext(
			"invalid" in setting || "invalidMqtt" in setting
				? { locale: "hu-HU" }
				: {},
		);
		try {
			await build({
				logLevel: "silent",
				build: { outDir: output, emptyOutDir: true },
			});
			server = await preview({
				logLevel: "silent",
				build: { outDir: output },
				preview: { host: "127.0.0.1", port: 0 },
			});
			const address = server.httpServer.address();
			if (!address || typeof address === "string")
				throw new Error("preview server has no port");
			const seen: string[] = [];
			await context.routeWebSocket(/^wss:\/\//, (socket) => {
				seen.push(new URL(socket.url()).host);
				void socket.close();
			});
			const page = await context.newPage();
			await page.goto(`http://localhost:${address.port}/`);
			if ("invalid" in setting || "invalidMqtt" in setting) {
				await expect(page.locator("body")).toContainText(
					"invalid" in setting
						? "Érvénytelen wss: Nostr-továbbító URL"
						: "Érvénytelen wss: MQTT-bróker URL",
				);
				await expect(page.locator("body")).not.toContainText("example-secret");
				expect(seen).toEqual([]);
				return;
			}
			await createTableLink(page);
			if (setting.value !== "none")
				await expect
					.poll(() => seen, { timeout: 10_000 })
					.toContain("nostr-build-config.test");
			await page.waitForTimeout(1_000);
			expect([...new Set(seen)]).toEqual(
				setting.value === "none" ? [] : ["nostr-build-config.test"],
			);
		} finally {
			await context.close();
			if (server)
				await new Promise<void>((resolve, reject) =>
					server?.httpServer.close((error) =>
						error ? reject(error) : resolve(),
					),
				);
			for (const [index, name] of names.entries()) {
				const value = previous[index];
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
			await rm(output, { recursive: true, force: true });
		}
	});
}
