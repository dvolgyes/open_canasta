const originalFetch = globalThis.fetch;
let first = true;

globalThis.fetch = async (input, options) => {
	if (String(input) !== "https://openrouter.ai/api/alpha/decisions") {
		return originalFetch(input, options);
	}
	process.send?.("model-request");
	if (first) {
		first = false;
		await new Promise((resolve) => {
			const receive = (message) => {
				if (message !== "release-decision") return;
				process.off("message", receive);
				resolve();
			};
			process.on("message", receive);
		});
	}
	process.send?.("model-response");
	return new Response(
		JSON.stringify({
			answers: { canasta_choice: { type: "choice", choice: "0" } },
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
};
