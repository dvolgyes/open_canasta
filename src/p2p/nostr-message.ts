/** A bound on relay text before JSON parsing, in JavaScript string code units. */
export const MAX_NOSTR_FRAME_CHARS = 1_048_576;

export type NostrReason =
	| "rate-limited"
	| "duplicate"
	| "blocked"
	| "restricted"
	| "auth-required"
	| "pow"
	| "other";

/** Parsed routing data only. Parsing does not verify an event signature or authenticate a participant. */
export type NostrMessage =
	| {
			readonly type: "EVENT";
			readonly subId: string;
			readonly topic: string;
			readonly content: string;
	  }
	| {
			readonly type: "OK";
			readonly accepted: boolean;
			readonly reason: NostrReason;
	  }
	| { readonly type: "EOSE"; readonly subId: string }
	| {
			readonly type: "CLOSED";
			readonly subId: string;
			readonly reason: NostrReason;
	  }
	| { readonly type: "NOTICE" };

function subscription(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function reason(value: string): NostrReason {
	for (const prefix of [
		"rate-limited",
		"duplicate",
		"blocked",
		"restricted",
		"auth-required",
		"pow",
	] as const)
		if (value.startsWith(`${prefix}:`)) return prefix;
	return "other";
}

function topicFrom(tags: unknown): string | undefined {
	if (!Array.isArray(tags)) return undefined;
	for (const tag of tags) {
		if (!Array.isArray(tag) || tag[0] !== "x") continue;
		return typeof tag[1] === "string" &&
			tag[1].length > 0 &&
			tag[1].length <= 1024
			? tag[1]
			: undefined;
	}
	return undefined;
}

/** Validate the relay envelope before routing; no relay-supplied diagnostic text is returned. */
export function parseNostrMessage(raw: unknown): NostrMessage | undefined {
	if (typeof raw !== "string" || raw.length > MAX_NOSTR_FRAME_CHARS)
		return undefined;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		if (error instanceof SyntaxError) return undefined;
		throw error;
	}
	if (!Array.isArray(value)) return undefined;
	const [type, first, second, third] = value;
	switch (type) {
		case "EVENT": {
			if (
				!subscription(first) ||
				typeof second !== "object" ||
				second === null ||
				Array.isArray(second)
			)
				return undefined;
			const event = second as Record<string, unknown>;
			const topic = topicFrom(event.tags);
			return topic !== undefined && typeof event.content === "string"
				? { type, subId: first, topic, content: event.content }
				: undefined;
		}
		case "OK":
			return typeof first === "string" &&
				typeof second === "boolean" &&
				typeof third === "string"
				? { type, accepted: second, reason: reason(third) }
				: undefined;
		case "EOSE":
			return subscription(first) ? { type, subId: first } : undefined;
		case "CLOSED":
			return subscription(first) && typeof second === "string"
				? { type, subId: first, reason: reason(second) }
				: undefined;
		case "NOTICE":
			return typeof first === "string" ? { type } : undefined;
		default:
			return undefined;
	}
}
