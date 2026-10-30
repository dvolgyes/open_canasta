/** Limit the external response before parsing it as untrusted JSON. */
export async function readOpenRouterMetadata(
	response: Response,
): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) return undefined;
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	for (;;) {
		const chunk = await reader.read();
		if (chunk.done) break;
		bytes += chunk.value.byteLength;
		if (bytes > 32 * 1024) {
			await reader.cancel();
			return undefined;
		}
		text += decoder.decode(chunk.value, { stream: true });
	}
	return JSON.parse(text + decoder.decode()) as unknown;
}
