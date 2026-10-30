import { afterEach, expect, it, vi } from "vitest";
import { HostBotRunner } from "../../src/bot/host-runner";
import { startMatch } from "../../src/canasta";
import { canastaModule, tableSeat } from "../../src/game/canasta";
import type { TableController } from "../../src/p2p/table";
import { DEFAULT_BOT_SETUP } from "../../src/protocol";
import { CONFIG, TABLE } from "./p2p-fixtures";

afterEach(() => vi.unstubAllGlobals());

it("paces a quick bot decision so players can see each action", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	const state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	const send = vi.fn(async () => ({ ok: true }));
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected: true,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: () => () => {},
		send,
	} as unknown as TableController;
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes("bot-prompts/")
				? new Response("{{CHOICES}}")
				: new Response(
						JSON.stringify({
							output: [
								{
									type: "message",
									role: "assistant",
									content: [{ type: "output_text", text: '{"choice":0}' }],
								},
							],
						}),
						{ status: 200 },
					),
		),
	);
	const runner = new HostBotRunner(controller, {
		apiKey: "test-key",
		model: DEFAULT_BOT_SETUP.model,
		fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
		modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
		retries: 0,
		retryDelayMs: 0,
	});
	try {
		const started = performance.now();
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		expect(performance.now() - started).toBeGreaterThanOrEqual(950);
	} finally {
		runner.stop();
	}
});

it("cancels the pacing timer when a new match replaces the decision", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	let state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	let changed = () => {};
	let requests = 0;
	const send = vi.fn(async () => ({ ok: true }));
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected: true,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		send,
	} as unknown as TableController;
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes("bot-prompts/"))
				return new Response("{{CHOICES}}");
			requests++;
			return new Response(
				JSON.stringify({
					output: [
						{
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: '{"choice":0}' }],
						},
					],
				}),
				{ status: 200 },
			);
		}),
	);
	const runner = new HostBotRunner(controller, {
		apiKey: "test-key",
		model: DEFAULT_BOT_SETUP.model,
		fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
		modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
		retries: 0,
		retryDelayMs: 0,
	});
	try {
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(requests).toBe(1));
		state = { ...state, matches: 2, match: startMatch(7) };
		changed();
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({ type: "action", match: 2 }),
		);
		expect(requests).toBe(2);
	} finally {
		runner.stop();
	}
});

it("asks the bot again when a new match starts at the same hand and action", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	const initial = canastaModule.initialState(TABLE, config);
	let state = { ...initial, matches: 1, match, actions: 0 };
	let changed = () => {};
	const send = vi.fn(async () => ({ ok: true }));
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected: true,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		send,
	} as unknown as TableController;
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes("bot-prompts/")
				? new Response("{{CHOICES}}")
				: new Response(
						JSON.stringify({
							output: [
								{
									type: "message",
									role: "assistant",
									content: [{ type: "output_text", text: '{"choice":0}' }],
								},
							],
						}),
						{ status: 200 },
					),
		),
	);
	const runner = new HostBotRunner(controller, {
		apiKey: "test-key",
		model: DEFAULT_BOT_SETUP.model,
		fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
		modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
		retries: 0,
		retryDelayMs: 0,
	});
	try {
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		state = { ...state, matches: 2, match: startMatch(7) };
		changed();
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2), {
			timeout: 3_000,
		});
	} finally {
		runner.stop();
	}
});

it("does not send a delayed decision into a new match with the same counters", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	let state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	let changed = () => {};
	const send = vi.fn(async () => ({ ok: true }));
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected: true,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		send,
	} as unknown as TableController;
	let release: (response: Response) => void = () => {};
	let requests = 0;
	const response = () =>
		new Response(
			JSON.stringify({
				output: [
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: '{"choice":0}' }],
					},
				],
			}),
			{ status: 200 },
		);
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes("bot-prompts/"))
				return new Response("{{CHOICES}}");
			requests++;
			if (requests === 1)
				return new Promise<Response>((resolve) => {
					release = resolve;
				});
			return response();
		}),
	);
	const runner = new HostBotRunner(controller, {
		apiKey: "test-key",
		model: DEFAULT_BOT_SETUP.model,
		fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
		modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
		retries: 0,
		retryDelayMs: 0,
	});
	try {
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(requests).toBe(1));
		state = { ...state, matches: 2, match: startMatch(7) };
		changed();
		release(response());
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		expect(requests).toBe(2);
	} finally {
		release(response());
		runner.stop();
	}
});

it("continues when a pending bot action is rejected after the position changes", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	let state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	let changed = () => {};
	let release: (result: { ok: boolean }) => void = () => {};
	const send = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		)
		.mockResolvedValue({ ok: true });
	const error = vi.fn();
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected: true,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		send,
	} as unknown as TableController;
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes("bot-prompts/")
				? new Response("{{CHOICES}}")
				: new Response(
						JSON.stringify({
							output: [
								{
									type: "message",
									role: "assistant",
									content: [{ type: "output_text", text: '{"choice":0}' }],
								},
							],
						}),
						{ status: 200 },
					),
		),
	);
	const runner = new HostBotRunner(
		controller,
		{
			apiKey: "test-key",
			model: DEFAULT_BOT_SETUP.model,
			fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
			modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
			retries: 0,
			retryDelayMs: 0,
		},
		error,
	);
	try {
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		state = { ...state, matches: 2, match: startMatch(7) };
		changed();
		release({ ok: false });
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2), {
			timeout: 3_000,
		});
		expect(error).not.toHaveBeenCalled();
	} finally {
		release({ ok: false });
		runner.stop();
	}
});

it("waits for all seats before asking the model and resumes when they return", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	const state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	let allConnected = false;
	let changed = () => {};
	const send = vi.fn(async () => ({ ok: true }));
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		send,
	} as unknown as TableController;
	const fetcher = vi.fn(async (input: RequestInfo | URL) =>
		String(input).includes("bot-prompts/")
			? new Response("{{CHOICES}}")
			: new Response(
					JSON.stringify({
						output: [
							{
								type: "message",
								role: "assistant",
								content: [{ type: "output_text", text: '{"choice":0}' }],
							},
						],
					}),
					{ status: 200 },
				),
	);
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal("fetch", fetcher);
	const runner = new HostBotRunner(controller, {
		apiKey: "test-key",
		model: DEFAULT_BOT_SETUP.model,
		fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
		modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
		retries: 0,
		retryDelayMs: 0,
	});
	try {
		expect(await runner.start()).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(fetcher).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
		allConnected = true;
		changed();
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
	} finally {
		runner.stop();
	}
});

it("retries a temporarily waiting bot action without another model request", async () => {
	const match = startMatch(7);
	const botSeat = tableSeat(match.hand.turn);
	const hostSeat = botSeat === "W" ? "N" : "W";
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [botSeat] },
	};
	const state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	let changed = () => {};
	const sendBot = vi
		.fn()
		.mockResolvedValueOnce({
			ok: false,
			reason: "Waiting for a player",
			waiting: true,
		})
		.mockResolvedValue({ ok: true });
	const error = vi.fn();
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected: true,
			seat: hostSeat,
			roster: { bots: [botSeat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		sendBot,
	} as unknown as TableController;
	let requests = 0;
	const fetcher = vi.fn(async (input: RequestInfo | URL) => {
		if (String(input).includes("bot-prompts/"))
			return new Response("{{CHOICES}}");
		requests++;
		return new Response(
			JSON.stringify({
				output: [
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: '{"choice":0}' }],
					},
				],
			}),
			{ status: 200 },
		);
	});
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal("fetch", fetcher);
	const runner = new HostBotRunner(
		controller,
		{
			apiKey: "test-key",
			model: DEFAULT_BOT_SETUP.model,
			fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
			modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
			retries: 0,
			retryDelayMs: 0,
		},
		error,
	);
	try {
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(sendBot).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		await new Promise((resolve) => setTimeout(resolve, 1_100));
		changed();
		await vi.waitFor(() => expect(sendBot).toHaveBeenCalledTimes(2), {
			timeout: 3_000,
		});
		expect(requests).toBe(1);
		expect(error).not.toHaveBeenCalled();
	} finally {
		runner.stop();
	}
});

it("holds a completed decision while a player is disconnected", async () => {
	const match = startMatch(7);
	const seat = tableSeat(match.hand.turn);
	const config = {
		...CONFIG,
		botSetup: { ...DEFAULT_BOT_SETUP, seats: [seat] },
	};
	const state = {
		...canastaModule.initialState(TABLE, config),
		matches: 1,
		match,
		actions: 0,
	};
	let allConnected = true;
	let changed = () => {};
	let release: (response: Response) => void = () => {};
	const send = vi.fn(async () => ({ ok: true }));
	const controller = {
		tableId: TABLE,
		view: () => ({
			hosting: true,
			ready: true,
			allConnected,
			seat,
			roster: { bots: [seat] },
			table: { config, state },
		}),
		activateBots: async () => true,
		onChange: (callback: () => void) => {
			changed = callback;
			return () => {};
		},
		send,
	} as unknown as TableController;
	let requests = 0;
	const response = () =>
		new Response(
			JSON.stringify({
				output: [
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: '{"choice":0}' }],
					},
				],
			}),
			{ status: 200 },
		);
	vi.stubGlobal("window", { setTimeout, clearTimeout });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes("bot-prompts/"))
				return new Response("{{CHOICES}}");
			requests++;
			return new Promise<Response>((resolve) => {
				release = resolve;
			});
		}),
	);
	const runner = new HostBotRunner(controller, {
		apiKey: "test-key",
		model: DEFAULT_BOT_SETUP.model,
		fallbackModel: DEFAULT_BOT_SETUP.fallbackModel,
		modelOrder: [DEFAULT_BOT_SETUP.model, DEFAULT_BOT_SETUP.fallbackModel],
		retries: 0,
		retryDelayMs: 0,
	});
	try {
		expect(await runner.start()).toBe(true);
		await vi.waitFor(() => expect(requests).toBe(1));
		allConnected = false;
		changed();
		release(response());
		await new Promise((resolve) => setTimeout(resolve, 1_100));
		expect(send).not.toHaveBeenCalled();
		allConnected = true;
		changed();
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), {
			timeout: 3_000,
		});
		expect(requests).toBe(1);
	} finally {
		release(response());
		runner.stop();
	}
});
