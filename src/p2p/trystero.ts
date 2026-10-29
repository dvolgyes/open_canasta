import type { MeshConfig } from "./config";
import { TABLE_OFFERS } from "./limits";
import { Mesh, type MeshHandlers, type TrackerSocket } from "./mesh";
import type { Clock } from "./ports";
import { joinRoom, relaySockets, selfId } from "./signaling";

/** The production mesh uses a shared strategy for trackers and MQTT brokers. */
export function trysteroMesh(
	tableId: string,
	key: string,
	config: MeshConfig,
	clock: Clock,
	rtcPolyfill?: typeof RTCPeerConnection,
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
							mqttBrokerUrls: config.mqttBrokers ?? [],
							...(roomId === tableId
								? { offersPerAnnounce: TABLE_OFFERS }
								: {}),
						},
						roomId,
						callbacks,
					),
				self: selfId,
				trackerSockets: () =>
					relaySockets().tracker as Readonly<Record<string, TrackerSocket>>,
				mqttSockets: () => relaySockets().mqtt,
				clock,
			},
			handlers,
		);
}
