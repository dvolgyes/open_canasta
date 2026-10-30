import { MAX_NAME_LENGTH } from "./protocol";

/** A display name is never an identity or authorization credential. */
export function playerName(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const name = value.trim().normalize("NFC");
	return name.length > 0 &&
		Array.from(name).length <= MAX_NAME_LENGTH &&
		!/\p{Cc}/u.test(name)
		? name
		: undefined;
}

export function unnamedPlayer(name: string): boolean {
	return name.trim() === "" || name.trim().toLowerCase() === "player";
}
