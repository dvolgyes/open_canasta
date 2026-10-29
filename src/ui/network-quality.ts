import type { RoundTrip } from "../p2p/round-trips";

export type Quality = "excellent" | "good" | "average" | "poor" | "breaking-up";

export function quality(measurement: RoundTrip): {
	label: Quality;
	bars: number;
} {
	const hundredths = Math.round(measurement.ms / 10);
	if (measurement.lower || hundredths >= 200)
		return { label: "breaking-up", bars: 1 };
	if (hundredths <= 10) return { label: "excellent", bars: 5 };
	if (hundredths <= 30) return { label: "good", bars: 4 };
	if (hundredths <= 60) return { label: "average", bars: 3 };
	return { label: "poor", bars: 2 };
}
