import {
	type Browser,
	chromium,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	caption,
	installCallProbe,
	joinButton,
	joinWith,
	peerAudioGrowth,
	requestsFor,
	SOUND,
	toggle,
} from "./call-probe";
import { createTableLink, pick } from "./pages";
import { Player, reportNetwork } from "./player";

/**
 * A player whose computer has no camera joins the call with audio, on one P2P table through the public trackers.
 * West uses the Chrome of the other specs, with a generated camera and microphone. North uses a Chrome that has
 * a generated microphone and no camera device. North may use both, so only the missing device keeps the camera
 * off; call-video.spec.ts test 3 covers a refused camera permission.
 */
test.describe.configure({ mode: "serial" });

const PERMISSIONS = { permissions: ["microphone", "camera"] };

let noCamera: Browser;
const players: Player[] = [];

test.beforeAll(async () => {
	noCamera = await chromium.launch({
		channel: "chrome",
		args: ["--use-fake-device-for-media-stream=device-count=0"],
	});
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern as the first parameter.
test.afterEach(async ({}, testInfo) => {
	if (testInfo.status !== testInfo.expectedStatus) await reportNetwork(players);
});

test.afterAll(async () => {
	for (const player of players) await player.close();
	await noCamera.close();
});

/** The number of cameras and microphones that the page can see, after a microphone request. */
function devices(
	page: Page,
): Promise<{ cameras: number; microphones: number }> {
	return page.evaluate(async () => {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		for (const track of stream.getTracks()) track.stop();
		const list = await navigator.mediaDevices.enumerateDevices();
		return {
			cameras: list.filter((device) => device.kind === "videoinput").length,
			microphones: list.filter((device) => device.kind === "audioinput").length,
		};
	});
}

test("a player without a camera joins the call with audio, and the camera switch says why it is off", async ({
	browser,
	baseURL,
}) => {
	if (!baseURL) throw new Error("baseURL is not configured");
	const west = await Player.open(browser, baseURL, "no-camera-W", PERMISSIONS);
	const north = await Player.open(
		noCamera,
		baseURL,
		"no-camera-N",
		PERMISSIONS,
	);
	players.push(west, north);
	await west.addInitScript(installCallProbe);
	await north.addInitScript(installCallProbe);

	const tabW = await west.page("./");
	const link = await createTableLink(tabW);
	const tabN = await north.page(link);
	// The rig: North's Chrome has a microphone and no camera.
	const found = await devices(tabN);
	expect(found.cameras).toBe(0);
	expect(found.microphones).toBeGreaterThan(0);
	await pick(tabN, "N");

	// Every switch is disabled until the seat can join, so the camera checks wait for an enabled Join.
	await expect(joinButton(tabN)).toBeEnabled();
	await expect(joinButton(tabW)).toBeEnabled();
	await expect(toggle(tabW, "Send camera video")).toBeEnabled();
	const sendCamera = toggle(tabN, "Send camera video");
	await expect(sendCamera).toBeDisabled();
	await expect(sendCamera).toHaveAttribute("aria-pressed", "false");
	await expect(sendCamera).toHaveAttribute("title", "No camera is available.");

	await joinWith(tabN, "See cameras; send voice");
	await expect(toggle(tabN, "Send mic audio")).toHaveAttribute(
		"data-actual",
		"on",
	);
	await joinWith(tabW, "Audio + video both ways");
	for (const tab of [tabW, tabN]) {
		await expect
			.poll(
				async () => {
					const growth = await peerAudioGrowth(tab);
					return growth.length === 1 && growth.every((bytes) => bytes > SOUND);
				},
				{ message: `audio at ${tab === tabW ? "West" : "North"}` },
			)
			.toBe(true);
	}
	await expect(caption(tabW, "N")).toHaveText("N - player1 · Audio only");
	await expect(caption(tabN, "W")).toHaveText("W - player4 · Audio + video");
	expect(await requestsFor(tabN, "video")).toBe(0);
	expect([...west.errors, ...north.errors]).toEqual([]);
});
