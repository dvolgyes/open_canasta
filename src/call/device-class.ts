/**
 * Desktop devices show video; compact devices can send their camera but do not show video.
 * The same class drives the layout. It is a user-experience rule, not a security boundary.
 */
export type Form = "desktop" | "compact";
export type Layout = Form | "sideways";

/** A layout viewport narrower than this many CSS pixels is compact. */
export const COMPACT_BELOW_WIDTH = 900;

export interface DeviceSignals {
	/** Layout viewport width in CSS pixels. */
	readonly viewportWidth: number;
	readonly viewportHeight: number;
	/** `navigator.userAgentData.mobile`, or undefined when the browser does not expose it. */
	readonly uaMobile: boolean | undefined;
	readonly userAgent: string;
	readonly maxTouchPoints: number;
	/** `(any-pointer: fine)`: at least one precise pointer, such as a mouse or trackpad. */
	readonly anyFinePointer: boolean;
}

export interface OrientationChoices {
	readonly landscapeDesktop: boolean;
	readonly portraitMobile: boolean;
}

const DEFAULT_ORIENTATION: OrientationChoices = {
	landscapeDesktop: false,
	portraitMobile: true,
};

/** iPadOS Safari reports a Macintosh desktop user agent; the touch points give it away. */
function isIPadDesktopMode(signals: DeviceSignals): boolean {
	return /\bMacintosh\b/.test(signals.userAgent) && signals.maxTouchPoints > 1;
}

export function isTouchDevice(signals: DeviceSignals): boolean {
	return (
		signals.uaMobile === true ||
		isIPadDesktopMode(signals) ||
		!signals.anyFinePointer
	);
}

/** Device form follows the player's orientation choices and the available pointer. */
export function classify(
	signals: DeviceSignals,
	choices: OrientationChoices = DEFAULT_ORIENTATION,
): Form {
	const portrait = signals.viewportHeight > signals.viewportWidth;
	const touch = isTouchDevice(signals);
	if (touch)
		return choices.landscapeDesktop && !portrait ? "desktop" : "compact";
	if (
		signals.viewportWidth < COMPACT_BELOW_WIDTH ||
		(portrait && choices.portraitMobile)
	)
		return "compact";
	return "desktop";
}

/** A landscape phone can use a wider board while its call stays compact. */
export function layout(
	signals: DeviceSignals,
	choices: OrientationChoices = DEFAULT_ORIENTATION,
): Layout {
	const form = classify(signals, choices);
	return form === "compact" &&
		isTouchDevice(signals) &&
		signals.viewportHeight <= signals.viewportWidth
		? "sideways"
		: form;
}

export function formOf(value: Layout): Form {
	return value === "desktop" ? "desktop" : "compact";
}

// ---------------------------------------------------------------------------------------------------------------
// Browser adapter

interface MediaQueryLike {
	readonly matches: boolean;
	addEventListener(type: "change", listener: () => void): void;
	removeEventListener(type: "change", listener: () => void): void;
}

/** The part of `window` the adapter reads. */
export interface DeviceWindow {
	readonly innerWidth: number;
	readonly innerHeight: number;
	readonly navigator: {
		readonly userAgent: string;
		readonly maxTouchPoints: number;
		readonly userAgentData?: unknown;
	};
	matchMedia(query: string): MediaQueryLike;
	addEventListener(
		type: "resize" | "appearance-change",
		listener: () => void,
	): void;
	removeEventListener(
		type: "resize" | "appearance-change",
		listener: () => void,
	): void;
}

const FINE_POINTER_QUERY = "(any-pointer: fine)";

/** `userAgentData.mobile` when it is a boolean; Firefox and Safari have no `userAgentData`. */
export function uaMobile(userAgentData: unknown): boolean | undefined {
	if (typeof userAgentData !== "object" || userAgentData === null)
		return undefined;
	const mobile = (userAgentData as { mobile?: unknown }).mobile;
	return typeof mobile === "boolean" ? mobile : undefined;
}

export function readSignals(win: DeviceWindow): DeviceSignals {
	return {
		viewportWidth: win.innerWidth,
		viewportHeight: win.innerHeight,
		uaMobile: uaMobile(win.navigator.userAgentData),
		userAgent: win.navigator.userAgent,
		maxTouchPoints: win.navigator.maxTouchPoints,
		anyFinePointer: win.matchMedia(FINE_POINTER_QUERY).matches,
	};
}

/**
 * Calls `onChange` with the new class whenever a resize, rotation or pointer change moves the device across
 * the boundary. Returns a function that removes the listeners.
 */
export function watchDeviceClass(
	win: DeviceWindow,
	onChange: (form: Form) => void,
	choices: () => OrientationChoices = () => DEFAULT_ORIENTATION,
): () => void {
	return watchDevice(
		win,
		() => classify(readSignals(win), choices()),
		onChange,
	);
}

export function watchDeviceLayout(
	win: DeviceWindow,
	onChange: (value: Layout) => void,
	choices: () => OrientationChoices = () => DEFAULT_ORIENTATION,
): () => void {
	return watchDevice(win, () => layout(readSignals(win), choices()), onChange);
}

function watchDevice<T extends string>(
	win: DeviceWindow,
	read: () => T,
	onChange: (value: T) => void,
): () => void {
	const pointer = win.matchMedia(FINE_POINTER_QUERY);
	let current = read();
	const check = () => {
		const next = read();
		if (next === current) return;
		current = next;
		onChange(next);
	};
	win.addEventListener("resize", check);
	win.addEventListener("appearance-change", check);
	pointer.addEventListener("change", check);
	return () => {
		win.removeEventListener("resize", check);
		win.removeEventListener("appearance-change", check);
		pointer.removeEventListener("change", check);
	};
}
