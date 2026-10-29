/** A local WebRTC test retains candidate classes only, never addresses or session descriptions. */
export type WebRtcReport =
	| { readonly kind: "missing" }
	| {
			readonly kind: "checked";
			readonly candidates: readonly string[];
			readonly channel: "open" | "failed";
	  };

export type CheckWebRtc = () => Promise<WebRtcReport>;

/** Classify a candidate without returning any of its input fields. */
export function candidateLabel(line: string): string | undefined {
	const fields = line.replace(/^a=/, "").split(/\s+/);
	const protocol = fields[2]?.toLowerCase();
	const address = fields[4];
	const type = fields[6] === "typ" ? fields[7] : undefined;
	if (
		address === undefined ||
		(protocol !== "udp" && protocol !== "tcp") ||
		(type !== "host" &&
			type !== "srflx" &&
			type !== "prflx" &&
			type !== "relay")
	)
		return undefined;
	const family = address.endsWith(".local")
		? "mDNS"
		: address.includes(":")
			? "IPv6"
			: "IPv4";
	return `${type} ${family}${protocol === "tcp" ? " TCP" : ""}`;
}

/** Connect two local peers and send one message, with a deadline for gathering and setup. */
export function webRtcCheck(
	Rtc: typeof RTCPeerConnection | undefined,
	configuration: RTCConfiguration,
	timeoutMs = 8_000,
): CheckWebRtc {
	return () => {
		if (typeof Rtc !== "function") return Promise.resolve({ kind: "missing" });
		let a: RTCPeerConnection | undefined;
		let b: RTCPeerConnection;
		try {
			a = new Rtc(configuration);
			b = new Rtc(configuration);
		} catch (error) {
			a?.close();
			if (
				error instanceof DOMException &&
				["NotSupportedError", "SecurityError", "NotAllowedError"].includes(
					error.name,
				)
			)
				return Promise.resolve({
					kind: "checked",
					channel: "failed",
					candidates: [],
				});
			throw error;
		}
		const first = a;
		return new Promise((resolve) => {
			const candidates = new Set<string>();
			const a = first;
			let channel: "open" | "failed" = "failed";
			let gathered = false;
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				a.onicecandidate = null;
				b.onicecandidate = null;
				b.ondatachannel = null;
				a.close();
				b.close();
				resolve({
					kind: "checked",
					candidates: [...candidates].sort(),
					channel,
				});
			};
			const timer = setTimeout(finish, timeoutMs);
			const settled = () => {
				if (gathered && channel === "open") finish();
			};
			a.onicecandidate = ({ candidate }) => {
				if (candidate === null) {
					gathered = true;
					settled();
					return;
				}
				const label = candidateLabel(candidate.candidate);
				if (label !== undefined) candidates.add(label);
				void b.addIceCandidate(candidate).catch(() => undefined);
			};
			b.onicecandidate = ({ candidate }) => {
				if (candidate !== null)
					void a.addIceCandidate(candidate).catch(() => undefined);
			};
			b.ondatachannel = ({ channel: incoming }) => {
				incoming.onmessage = () => {
					channel = "open";
					settled();
				};
			};
			const outgoing = a.createDataChannel("check");
			outgoing.onopen = () => outgoing.send("check");
			void (async () => {
				const offer = await a.createOffer();
				await a.setLocalDescription(offer);
				await b.setRemoteDescription(offer);
				const answer = await b.createAnswer();
				await b.setLocalDescription(answer);
				await a.setRemoteDescription(answer);
			})().catch(finish);
		});
	};
}
