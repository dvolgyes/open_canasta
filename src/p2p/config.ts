import { parseStunUrls, rtcConfiguration } from "../call/ice";

/**
 * Mesh settings from the build environment: trackers, MQTT brokers, and STUN servers.
 * The page never falls back to Trystero's own defaults, so a configuration value
 * alone decides which outside services see the page.
 */

/** Unversioned, so pages of different versions meet and report the mismatch. */
export const APP_ID = "github.com/dvolgyes/open_canasta";

/** The trackers used by the reference project's discovery checks. */
export const DEFAULT_TRACKER_URLS: readonly string[] = [
	"wss://tracker.openwebtorrent.com",
	"wss://tracker.webtorrent.dev",
	"wss://open.ftorrent.com",
	"wss://tracker.novage.com.ua",
];

export const DEFAULT_MQTT_BROKER_URLS: readonly string[] = [
	"wss://broker.emqx.io:8084/mqtt",
	"wss://broker.hivemq.com:8884/mqtt",
	"wss://iot.coreflux.cloud/mqtt",
];

export const DEFAULT_NOSTR_RELAY_URLS: readonly string[] = [
	"wss://nos.lol",
	"wss://relay.primal.net",
	"wss://relay.snort.social",
	"wss://nostr.mom",
	"wss://offchain.pub",
];

const MAX_TRACKER_URLS = 8;

export interface MeshConfig {
	readonly trackers: readonly string[];
	readonly nostrRelays?: readonly string[];
	readonly mqttBrokers?: readonly string[];
	readonly rtc: RTCConfiguration;
}

export type MeshConfigResult =
	| { readonly ok: true; readonly config: MeshConfig }
	| { readonly ok: false; readonly error: string };

type Env = Readonly<Record<string, string | undefined>>;

/** Only `wss:` URLs without credentials, query or fragment: a tracker sees the page's address, so it must be named. */
function isTrackerUrl(text: string): boolean {
	if (!URL.canParse(text)) return false;
	const url = new URL(text);
	return (
		url.protocol === "wss:" &&
		url.hostname !== "" &&
		url.username === "" &&
		url.password === "" &&
		url.search === "" &&
		url.hash === ""
	);
}

export function parseTrackerUrls(
	value: string | undefined,
):
	| { readonly ok: true; readonly urls: readonly string[] }
	| { readonly ok: false; readonly error: string } {
	if (value?.trim().toLowerCase() === "none") return { ok: true, urls: [] };
	const urls = (value ?? "").split(/[\s,]+/).filter((url) => url !== "");
	if (urls.length === 0) return { ok: true, urls: DEFAULT_TRACKER_URLS };
	if (urls.length > MAX_TRACKER_URLS) {
		return {
			ok: false,
			error: `At most ${MAX_TRACKER_URLS} tracker URLs are allowed (VITE_TRACKER_URLS).`,
		};
	}
	const bad = urls.find((url) => !isTrackerUrl(url));
	if (bad !== undefined) {
		return {
			ok: false,
			error: "Not a valid wss: tracker URL in VITE_TRACKER_URLS.",
		};
	}
	return { ok: true, urls: [...new Set(urls)] };
}

export function readMeshConfig(env: Env): MeshConfigResult {
	const trackers = parseTrackerUrls(env.VITE_TRACKER_URLS);
	if (!trackers.ok) return trackers;
	const mqtt = parseMqttBrokerUrls(env.VITE_MQTT_BROKER_URLS);
	if (!mqtt.ok) return mqtt;
	const nostr = parseNostrRelayUrls(env.VITE_NOSTR_RELAY_URLS);
	if (!nostr.ok) return nostr;
	const stun = parseStunUrls(env.VITE_STUN_URLS);
	if (!stun.ok) return stun;
	return {
		ok: true,
		config: {
			trackers: trackers.urls,
			nostrRelays: nostr.urls,
			mqttBrokers: mqtt.urls,
			rtc: rtcConfiguration(stun.urls),
		},
	};
}

export function parseNostrRelayUrls(
	value: string | undefined,
):
	| { readonly ok: true; readonly urls: readonly string[] }
	| { readonly ok: false; readonly error: string } {
	if (value?.trim().toLowerCase() === "none") return { ok: true, urls: [] };
	const urls = (value ?? "").split(/[\s,]+/).filter((url) => url !== "");
	if (urls.length === 0) return { ok: true, urls: DEFAULT_NOSTR_RELAY_URLS };
	if (urls.length > MAX_TRACKER_URLS)
		return {
			ok: false,
			error: "At most 8 Nostr relay URLs are allowed (VITE_NOSTR_RELAY_URLS).",
		};
	if (urls.some((url) => !isTrackerUrl(url)))
		return {
			ok: false,
			error: "Not a valid wss: Nostr relay URL in VITE_NOSTR_RELAY_URLS.",
		};
	return { ok: true, urls: [...new Set(urls)] };
}

export function parseMqttBrokerUrls(
	value: string | undefined,
):
	| { readonly ok: true; readonly urls: readonly string[] }
	| { readonly ok: false; readonly error: string } {
	if (value?.trim().toLowerCase() === "none") return { ok: true, urls: [] };
	const urls = (value ?? "").split(/[\s,]+/).filter((url) => url !== "");
	if (urls.length === 0) return { ok: true, urls: DEFAULT_MQTT_BROKER_URLS };
	if (urls.length > MAX_TRACKER_URLS)
		return {
			ok: false,
			error: "At most 8 MQTT broker URLs are allowed (VITE_MQTT_BROKER_URLS).",
		};
	const bad = urls.find((url) => !isTrackerUrl(url));
	if (bad !== undefined)
		return {
			ok: false,
			error: "Not a valid wss: MQTT broker URL in VITE_MQTT_BROKER_URLS.",
		};
	return { ok: true, urls: [...new Set(urls)] };
}
