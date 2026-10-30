/** Browser-level refusals that make a diagnostic data channel unavailable. */
export function dataChannelRefused(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		[
			"NotSupportedError",
			"SecurityError",
			"NotAllowedError",
			"OperationError",
			"InvalidStateError",
		].includes(error.name)
	);
}
