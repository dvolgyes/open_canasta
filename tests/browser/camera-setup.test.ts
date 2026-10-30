import { afterEach, describe, expect, it } from "vitest";
import type { GetUserMedia } from "../../src/call/media";
import { englishTranslator } from "../../src/i18n";
import { cameraSetup } from "../../src/ui/camera-setup";

const setups: ReturnType<typeof cameraSetup>[] = [];

afterEach(() => {
	for (const setup of setups.splice(0)) setup.dispose();
});

describe("camera setup", () => {
	it("keeps the local preview until confirmation and uses the chosen source", async () => {
		const requests: MediaStreamConstraints[] = [];
		const streams: MediaStream[] = [];
		const setup = cameraSetup({
			devices: {
				enumerate: async () => [
					{ deviceId: "camera-one", label: "Front camera" },
					{ deviceId: "camera-two", label: "USB camera" },
				],
				subscribe: () => () => {},
			},
			getUserMedia: (async (constraints) => {
				requests.push(constraints);
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: true,
				});
				streams.push(stream);
				return stream;
			}) as GetUserMedia,
			t: englishTranslator,
		});
		setups.push(setup);
		document.body.append(setup.element);

		let resolved = false;
		const opening = setup.open().then((selection) => {
			resolved = true;
			return selection;
		});
		await expect.poll(() => setup.element.open).toBe(true);
		await expect
			.poll(() => setup.element.querySelector("video")?.srcObject)
			.not.toBeNull();
		const selector = setup.element.querySelector("select");
		expect(selector?.hidden).toBe(false);
		expect(
			Array.from(selector?.options ?? [], (option) => option.label),
		).toEqual(["Front camera", "USB camera"]);
		expect(
			setup.element.querySelector<HTMLButtonElement>(
				"[data-testid='camera-preview-confirm']",
			)?.disabled,
		).toBe(false);
		expect(resolved).toBe(false);

		if (selector === null) throw new Error("Camera selector was not rendered");
		selector.value = "camera-two";
		selector.dispatchEvent(new Event("change"));
		await expect.poll(() => requests).toHaveLength(2);
		expect(streams[0]?.getVideoTracks()[0]?.readyState).toBe("ended");
		expect(requests[1]?.video).toMatchObject({
			deviceId: { exact: "camera-two" },
		});
		await expect
			.poll(() => setup.element.querySelector("video")?.srcObject)
			.not.toBeNull();

		setup.element
			.querySelector<HTMLButtonElement>(
				"[data-testid='camera-preview-confirm']",
			)
			?.click();
		const selection = await opening;
		if (selection === undefined || selection === "cancelled")
			throw new Error("camera was not selected");
		expect(selection.deviceId).toBe("camera-two");
		expect(selection.track.readyState).toBe("live");
		expect(setup.element.open).toBe(false);
		selection.track.stop();
	});

	it("stops the preview when the player cancels", async () => {
		let preview: MediaStream | undefined;
		const setup = cameraSetup({
			devices: {
				enumerate: async () => [
					{ deviceId: "fake-camera", label: "Test camera" },
				],
				subscribe: () => () => {},
			},
			getUserMedia: async () => {
				preview = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: true,
				});
				return preview;
			},
			t: englishTranslator,
		});
		setups.push(setup);
		document.body.append(setup.element);
		const opening = setup.open();
		await expect
			.poll(() => setup.element.querySelector("video")?.srcObject)
			.not.toBeNull();
		setup.element
			.querySelector<HTMLButtonElement>("[data-testid='camera-preview-cancel']")
			?.click();
		expect(await opening).toBe("cancelled");
		expect(preview?.getVideoTracks()[0]?.readyState).toBe("ended");
	});

	it("updates the camera list and disables confirmation when cameras disappear", async () => {
		let sources = [{ deviceId: "one", label: "Front camera" }];
		let devicesChanged = () => {};
		let preview: MediaStream | undefined;
		const setup = cameraSetup({
			devices: {
				enumerate: async () => sources,
				subscribe: (listener) => {
					devicesChanged = listener;
					return () => {};
				},
			},
			getUserMedia: async () => {
				preview = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: true,
				});
				return preview;
			},
			t: englishTranslator,
		});
		setups.push(setup);
		document.body.append(setup.element);
		const opening = setup.open();
		const confirm = setup.element.querySelector<HTMLButtonElement>(
			'[data-testid="camera-preview-confirm"]',
		);
		if (!confirm) throw new Error("camera confirmation is missing");
		await expect.poll(() => confirm.disabled).toBe(false);
		sources = [...sources, { deviceId: "two", label: "USB camera" }];
		devicesChanged();
		await expect
			.poll(() => setup.element.querySelectorAll("select option").length)
			.toBe(2);
		sources = [];
		devicesChanged();
		await expect.poll(() => confirm.disabled).toBe(true);
		expect(setup.element.textContent).toContain("No camera is available.");
		setup.element
			.querySelector<HTMLButtonElement>('[data-testid="camera-preview-cancel"]')
			?.click();
		expect(await opening).toBe("cancelled");
		expect(preview?.getVideoTracks()[0]?.readyState).toBe("ended");
	});

	it("does not report disposal as a player's cancellation", async () => {
		const setup = cameraSetup({
			devices: { enumerate: async () => [], subscribe: () => () => {} },
			getUserMedia: async () => new MediaStream(),
			t: englishTranslator,
		});
		setups.push(setup);
		document.body.append(setup.element);
		const opening = setup.open();
		setup.dispose();
		expect(await opening).toBeUndefined();
	});
});
