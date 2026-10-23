import type { MeshConfig } from "./config";
import { TABLE_OFFERS } from "./limits";
import { Mesh, type MeshHandlers, type TrackerSocket } from "./mesh";
import type { Clock } from "./ports";
import { getRelaySockets, joinRoom, selfId } from "./torrent";

/** The production mesh: Trystero with its torrent strategy (src/p2p/torrent.ts) over the configured public trackers. */
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
						roomId === tableId
							? { ...roomConfig, offersPerAnnounce: TABLE_OFFERS }
							: roomConfig,
						roomId,
						callbacks,
					),
				self: selfId,
				trackerSockets: () =>
					getRelaySockets() as Readonly<Record<string, TrackerSocket>>,
				clock,
			},
			handlers,
		);
}
