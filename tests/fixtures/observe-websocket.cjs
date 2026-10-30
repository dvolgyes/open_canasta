const NativeWebSocket = globalThis.WebSocket;
let reported = false;

globalThis.WebSocket = class extends NativeWebSocket {
	constructor(...args) {
		super(...args);
		if (!reported) {
			reported = true;
			process.send?.("relay socket opened");
		}
	}
};
