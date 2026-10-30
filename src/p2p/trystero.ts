import type { MeshConfig } from "./config";
import { TABLE_OFFERS } from "./limits";
import { Mesh, type MeshHandlers, type TrackerSocket } from "./mesh";
import { watchNetworkChanges } from "./network-watch";
import type { Clock } from "./ports";
import {
	checkRelay,
	joinRoom,
	reconnectRelay,
	relayResting,
	relaySockets,
	selfId,
} from "./signaling";
import { stunProbe } from "./stun-probe";
import { webRtcCheck } from "./webrtc-check";

/** The production mesh uses a shared strategy for trackers and MQTT brokers. */
export function trysteroMesh(
	tableId: string,
	key: string,
	config: MeshConfig,
	clock: Clock,
	rtcPolyfill?: typeof RTCPeerConnection,
	silentLinks?: () => boolean,
): (handlers: MeshHandlers) => Mesh {
	return (handlers) =>
		new Mesh(
			{
				tableId,
				key,
				config,
				rtcPolyfill,
				joinRoom: (roomConfig, roomId, callbacks) =>
					joinRoom(
						{
							...roomConfig,
							trackerUrls: config.trackers,
							nostrRelayUrls: config.nostrRelays ?? [],
							mqttBrokerUrls: config.mqttBrokers ?? [],
							...(roomId === tableId
								? { offersPerAnnounce: TABLE_OFFERS }
								: {}),
						},
						roomId,
						callbacks,
					),
				self: selfId,
				...(silentLinks === undefined ? {} : { silentLinks }),
				trackerSockets: () =>
					relaySockets().tracker as Readonly<Record<string, TrackerSocket>>,
				mqttSockets: () => relaySockets().mqtt,
				nostrSockets: () => relaySockets().nostr,
				reconnectRelay,
				relayResting,
				checkRelay: (url) => checkRelay(url, 10_000),
				...(typeof window === "undefined"
					? {}
					: {
							probeStun: stunProbe(rtcPolyfill ?? globalThis.RTCPeerConnection),
							checkWebRtc: webRtcCheck(
								rtcPolyfill ?? globalThis.RTCPeerConnection,
								config.rtc,
							),
							watchNetwork: (onChange: () => void, onShown: () => void) =>
								watchNetworkChanges(
									{
										window,
										document,
										connection: (navigator as { connection?: EventTarget })
											.connection,
										wall: clock.wall,
									},
									onChange,
									onShown,
								),
						}),
				clock,
			},
			handlers,
		);
}
