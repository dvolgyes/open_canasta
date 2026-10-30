import type { BuildInfo } from "../build";
import { isBuildCommit, isBuildDate } from "../p2p/build-reports";
import type { TableView } from "../p2p/table";
import { parsePageReport } from "../p2p/wire";
import { isSeat } from "../protocol";

/** A deliberately limited export: no game state, messages, identifiers, addresses, URLs, or credentials. */
export function diagnosticExport(view: TableView, build: BuildInfo) {
	const network = view.network;
	return {
		kind: "open-canasta-network-diagnostics",
		version: 1,
		build: {
			date: isBuildDate(build.date) ? build.date : "unknown",
			commit: isBuildCommit(build.commit) ? build.commit : "unknown",
		},
		status: view.status,
		seat: view.seat,
		hostSeat: view.hostSeat,
		hosting: view.hosting,
		allConnected: view.allConnected,
		persistent: view.persistent,
		writable: view.writable,
		network:
			network === null
				? null
				: {
						trackersOpen: network.trackersOpen,
						trackers: network.trackers,
						nostrOpen: network.nostrOpen,
						nostrRelays: network.nostrRelays,
						mqttBrokersOpen: network.mqttBrokersOpen,
						mqttBrokers: network.mqttBrokers,
						peers: network.peers,
						wrongKey: network.wrongKey,
						sendFailures: network.sendFailures,
						silentCloses: network.silentCloses,
					},
		peers: view.peers
			.filter((peer) => isSeat(peer.seat))
			.map((peer) => ({
				seat: peer.seat,
				...(peer.roundTrip !== null &&
				peer.roundTrip !== undefined &&
				Number.isFinite(peer.roundTrip.ms) &&
				peer.roundTrip.ms >= 0 &&
				typeof peer.roundTrip.lower === "boolean"
					? {
							roundTrip: { ms: peer.roundTrip.ms, lower: peer.roundTrip.lower },
						}
					: {}),
				...(peer.build !== undefined && isBuildDate(peer.build.date)
					? {
							build: {
								date: peer.build.date,
								...(isBuildCommit(peer.build.commit)
									? { commit: peer.build.commit }
									: {}),
							},
						}
					: {}),
			})),
		pages: (view.pageReports ?? []).flatMap((report) => {
			const page = parsePageReport(report.page);
			return isSeat(report.seat) && page !== undefined
				? [{ seat: report.seat, page }]
				: [];
		}),
	};
}
