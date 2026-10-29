import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import { stunProbe } from "../../src/p2p/stun-probe";

declare module "vitest/browser" {
	interface BrowserCommands {
		startStunServer(): Promise<number>;
		stopStunServer(port: number): Promise<void>;
	}
}

it("distinguishes a STUN answer from a silent port in Chrome", async () => {
	const port = await commands.startStunServer();
	try {
		const probe = stunProbe(RTCPeerConnection, 2_000);
		await expect(probe(`stun:127.0.0.1:${port}`)).resolves.toBe("answered");
		await expect(probe("stun:127.0.0.1:9")).resolves.toBe("no-answer");
	} finally {
		await commands.stopStunServer(port);
	}
}, 8_000);
