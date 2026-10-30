import { SEATS, type Seat } from "../protocol";
import { el } from "./dom";

type Position = "top" | "left" | "right" | "bottom";
const READING_ORDER: readonly Position[] = ["top", "left", "right", "bottom"];

/** Places the viewer at the bottom and arranges the remaining seats clockwise. */
export function seatGrid(
	cards: readonly { readonly seat: Seat; readonly element: HTMLElement }[],
	bottom: Seat = "S",
): HTMLElement {
	const position = (seat: Seat): Position => {
		const step = (SEATS.indexOf(seat) - SEATS.indexOf(bottom) + 4) % 4;
		return (["bottom", "left", "top", "right"] as const)[step] as Position;
	};
	return el(
		"div",
		{ className: "seat-grid", attrs: { "data-testid": "seat-grid" } },
		...cards
			.toSorted(
				(a, b) =>
					READING_ORDER.indexOf(position(a.seat)) -
					READING_ORDER.indexOf(position(b.seat)),
			)
			.map(({ seat, element }) => {
				element.dataset.seat = seat;
				element.dataset.position = position(seat);
				element.classList.add("seat-card");
				return element;
			}),
	);
}
