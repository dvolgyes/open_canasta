/** Subscription routing only: event authenticity and signing are outside this module. */
export function createNostrSubscriptions(deps: {
	send: (message: unknown[]) => void;
	newId: () => string;
	kindFor: (topic: string) => number;
	now: () => number;
}) {
	type Handler = (topic: string, content: string) => void;
	const handlers = new Map<string, Handler>();
	let batches: { id: string; topics: Set<string> }[] = [];

	return {
		add(topic: string, handler: Handler): () => void {
			handlers.set(topic, handler);
			return () => {
				if (handlers.get(topic) === handler) handlers.delete(topic);
			};
		},

		flush(): void {
			const topics = [...handlers.keys()];
			const next: typeof batches = [];
			for (let offset = 0; offset < topics.length; offset += 250) {
				const chunk = topics.slice(offset, offset + 250);
				const id = batches[next.length]?.id ?? deps.newId();
				if (!id || id.length > 64 || next.some((batch) => batch.id === id))
					throw new Error("Invalid or duplicate Nostr subscription ID");
				next.push({ id, topics: new Set(chunk) });
			}
			for (const batch of batches.slice(next.length))
				deps.send(["CLOSE", batch.id]);
			batches = next;
			for (const batch of batches) {
				const chunk = [...batch.topics];
				deps.send([
					"REQ",
					batch.id,
					{
						kinds: [...new Set(chunk.map(deps.kindFor))],
						since: deps.now(),
						"#x": chunk,
					},
				]);
			}
		},

		deliver(id: string, topic: string, content: string): void {
			if (batches.some((batch) => batch.id === id && batch.topics.has(topic)))
				handlers.get(topic)?.(topic, content);
		},
	};
}
