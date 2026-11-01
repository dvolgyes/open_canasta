import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { observeModern } from "../../src/bot/modern-inference";
import { playModernMatch } from "../../src/bot/research/modern-arena";
import {
	type ModernChoiceProvider,
	type ModernChoiceResponse,
	type ModernLlmResearchOptions,
	modernLlmResearchAgent,
} from "../../src/bot/research/modern-llm-agent";
import {
	modernApplyAction,
	modernNewHand,
} from "../../src/canasta/modern-hand";
import { mulberry32 } from "../../src/canasta/random";

function observation() {
	const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
	if (!dealt.ok) throw new Error(dealt.reason);
	return { hand: dealt.hand, view: observeModern(dealt.hand, 0) };
}

it("passes only the prompt and labels to a chooser and returns an engine-legal action", async () => {
	const { hand, view } = observation();
	let calls = 0;
	const agent = modernLlmResearchAgent(
		{
			async choose(request) {
				calls++;
				expect(Object.keys(request).sort()).toEqual([
					"labels",
					"prompt",
					"signal",
				]);
				expect(request.labels).toEqual(["draw"]);
				expect(Object.isFrozen(request.labels)).toBe(true);
				for (const card of [...hand.hands.flat(), ...hand.stock])
					expect(request.prompt).not.toContain(card.id);
				return { ok: true, choice: 0 };
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 30000 },
	);
	const decision = await agent.decide(view, { handNo: 1, rng: mulberry32(1) });
	if (!decision.ok) throw new Error(decision.reason);
	expect(calls).toBe(1);
	expect(decision.simulations).toBe(0);
	expect(decision.deadlineStopped).toBe(false);
	expect(modernApplyAction(hand, 0, decision.action).ok).toBe(true);
});

it("returns incomplete results for invalid choices or provider failures without fallback", async () => {
	const { view } = observation();
	for (const choice of [-1, 1, 0.5, NaN, Infinity, "0", {}, null]) {
		const agent = modernLlmResearchAgent(
			{
				async choose() {
					return { ok: true, choice };
				},
			},
			{ promptTimeMs: 30000, responseTimeMs: 30000 },
		);
		expect(
			(await agent.decide(view, { handNo: 1, rng: mulberry32(1) })).ok,
		).toBe(false);
	}
	const agent = modernLlmResearchAgent(
		{
			async choose() {
				return { ok: false };
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 30000 },
	);
	const decision = await agent.decide(view, { handNo: 1, rng: mulberry32(1) });
	expect(decision).toEqual({ ok: false, reason: "model choice failed" });
});

it("rejects malformed provider envelopes without coercing a choice", async () => {
	const { view } = observation();
	let coerced = false;
	const objectChoice = {
		valueOf() {
			coerced = true;
			return 0;
		},
	};
	for (const reply of [
		null,
		{},
		{ ok: "true", choice: 0 },
		{ ok: true, choice: objectChoice },
	]) {
		const agent = modernLlmResearchAgent(
			{
				async choose() {
					return reply as ModernChoiceResponse;
				},
			},
			{ promptTimeMs: 30000, responseTimeMs: 30000 },
		);
		expect(
			(await agent.decide(view, { handNo: 1, rng: mulberry32(1) })).ok,
		).toBe(false);
	}
	expect(coerced).toBe(false);
});

it("propagates unexpected provider exceptions instead of using a fallback", async () => {
	const { view } = observation();
	const error = new Error("provider invariant failed");
	const agent = modernLlmResearchAgent(
		{
			async choose() {
				throw error;
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 30000 },
	);
	await expect(
		agent.decide(view, { handNo: 1, rng: mulberry32(1) }),
	).rejects.toBe(error);
});

it("cancels an in-flight chooser and ignores its late response", async () => {
	const { view } = observation();
	const controller = new AbortController();
	let requestSignal: AbortSignal | undefined;
	let release: ((value: { ok: true; choice: number }) => void) | undefined;
	let ready: (() => void) | undefined;
	const started = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const agent = modernLlmResearchAgent(
		{
			choose(request) {
				requestSignal = request.signal;
				ready?.();
				return new Promise((resolve) => {
					release = resolve;
				});
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 30000 },
	);
	const pending = agent.decide(view, {
		handNo: 1,
		rng: mulberry32(1),
		signal: controller.signal,
	});
	await started;
	controller.abort();
	expect(await pending).toEqual({
		ok: false,
		reason: "model choice cancelled or timed out",
	});
	expect(requestSignal?.aborted).toBe(true);
	release?.({ ok: true, choice: 0 });
});

it("times out a chooser that does not respond", async () => {
	const { view } = observation();
	const agent = modernLlmResearchAgent(
		{ choose: () => new Promise(() => {}) },
		{ promptTimeMs: 30000, responseTimeMs: 10 },
	);
	expect(await agent.decide(view, { handNo: 1, rng: mulberry32(1) })).toEqual({
		ok: false,
		reason: "model choice cancelled or timed out",
	});
});

it("reports a stalled chooser timeout in a standalone headless Node process", () => {
	const program = `
import { modernNewHand } from "./src/canasta/modern-hand.ts";
import { observeModern } from "./src/bot/modern-inference.ts";
import { modernLlmResearchAgent } from "./src/bot/research/modern-llm-agent.ts";
import { mulberry32 } from "./src/canasta/random.ts";
const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
if (!dealt.ok) throw new Error(dealt.reason);
const agent = modernLlmResearchAgent(
  { choose: () => new Promise(() => {}) },
  { promptTimeMs: 30000, responseTimeMs: 50 },
);
const result = await agent.decide(observeModern(dealt.hand, 0), { handNo: 1, rng: mulberry32(1) });
process.stdout.write(JSON.stringify(result));
`;
	const child = spawnSync(
		process.execPath,
		["--import", "tsx", "--input-type=module", "-e", program],
		{ cwd: process.cwd(), encoding: "utf8", timeout: 10000 },
	);
	expect(child.status, child.stderr).toBe(0);
	expect(JSON.parse(child.stdout)).toEqual({
		ok: false,
		reason: "model choice cancelled or timed out",
	});
});

it("does not keep a headless Node process alive after a successful choice", () => {
	const program = `
import { modernNewHand } from "./src/canasta/modern-hand.ts";
import { observeModern } from "./src/bot/modern-inference.ts";
import { modernLlmResearchAgent } from "./src/bot/research/modern-llm-agent.ts";
import { mulberry32 } from "./src/canasta/random.ts";
const dealt = modernNewHand({ seed: 2, dealer: 3, teamScores: [0, 0] });
if (!dealt.ok) throw new Error(dealt.reason);
const agent = modernLlmResearchAgent(
  { choose: async () => ({ ok: true, choice: 0 }) },
  { promptTimeMs: 30000, responseTimeMs: 30000 },
);
const result = await agent.decide(observeModern(dealt.hand, 0), { handNo: 1, rng: mulberry32(1) });
process.stdout.write(JSON.stringify(result));
`;
	const child = spawnSync(
		process.execPath,
		["--import", "tsx", "--input-type=module", "-e", program],
		{ cwd: process.cwd(), encoding: "utf8", timeout: 10000 },
	);
	expect(child.status, child.stderr).toBe(0);
	expect(JSON.parse(child.stdout)).toMatchObject({
		ok: true,
		action: { type: "draw" },
	});
});

it("rejects a late response even if synchronous work delays the timeout event", async () => {
	const { view } = observation();
	const agent = modernLlmResearchAgent(
		{
			async choose() {
				const end = performance.now() + 20;
				while (performance.now() < end) {}
				return { ok: true, choice: 0 };
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 5 },
	);
	expect(await agent.decide(view, { handNo: 1, rng: mulberry32(1) })).toEqual({
		ok: false,
		reason: "model choice cancelled or timed out",
	});
});

it("integrates chooser decisions with the headless match and records invalid choices", async () => {
	const plan = {
		seed: 2,
		policySeed: 7,
		dealer: 3 as const,
		aTeam: 0 as const,
		maxHands: 1,
		maxActionsPerHand: 2,
	};
	const good = modernLlmResearchAgent(
		{
			async choose() {
				return { ok: true, choice: 0 };
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 30000 },
	);
	const played = await playModernMatch(plan, () => good);
	expect(played).toMatchObject({
		status: "incomplete",
		reason: "action cap",
		actions: 2,
		simulations: 0,
	});
	const bad = modernLlmResearchAgent(
		{
			async choose() {
				return { ok: true, choice: "0" };
			},
		},
		{ promptTimeMs: 30000, responseTimeMs: 30000 },
	);
	const failed = await playModernMatch(plan, () => bad);
	expect(failed).toMatchObject({
		status: "incomplete",
		reason: "agent a: invalid legal-choice index",
		actions: 0,
		aWin: null,
	});
});

it("does not call a chooser after prior cancellation or a prompt timeout", async () => {
	const { view } = observation();
	let calls = 0;
	const provider = {
		async choose() {
			calls++;
			return { ok: true as const, choice: 0 };
		},
	};
	const controller = new AbortController();
	controller.abort();
	const cancelled = modernLlmResearchAgent(provider, {
		promptTimeMs: 30000,
		responseTimeMs: 30000,
	});
	expect(
		(
			await cancelled.decide(view, {
				handNo: 1,
				rng: mulberry32(1),
				signal: controller.signal,
			})
		).ok,
	).toBe(false);
	const timed = modernLlmResearchAgent(provider, {
		promptTimeMs: 0,
		responseTimeMs: 30000,
	});
	expect((await timed.decide(view, { handNo: 1, rng: mulberry32(1) })).ok).toBe(
		false,
	);
	expect(calls).toBe(0);
});

it("rejects invalid chooser settings before making a choice", () => {
	const provider = {
		async choose() {
			return { ok: true as const, choice: 0 };
		},
	};
	for (const responseTimeMs of [0, -1, 0.5, NaN, Infinity, 60001])
		expect(() =>
			modernLlmResearchAgent(provider, { promptTimeMs: 30000, responseTimeMs }),
		).toThrow("invalid model choice limits");
	for (const promptTimeMs of [-1, NaN, Infinity, 60001])
		expect(() =>
			modernLlmResearchAgent(provider, { promptTimeMs, responseTimeMs: 30000 }),
		).toThrow("invalid model choice limits");
	for (const invalid of [null, {}])
		expect(() =>
			modernLlmResearchAgent(invalid as unknown as ModernChoiceProvider, {
				promptTimeMs: 30000,
				responseTimeMs: 30000,
			}),
		).toThrow("invalid model choice provider");
	expect(() =>
		modernLlmResearchAgent(
			provider,
			null as unknown as ModernLlmResearchOptions,
		),
	).toThrow("invalid model choice limits");
});
