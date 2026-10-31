import { beforeEach, expect, it } from "vitest";
import { guardedStorage } from "../../src/session";
import { dropOldGameData } from "../../src/storage-version";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});

it("keeps current unversioned data when installing version one", () => {
	localStorage.setItem("dvolgyes-open_canasta.client.table", "client");
	dropOldGameData(
		guardedStorage(() => localStorage),
		guardedStorage(() => sessionStorage),
		1,
	);
	expect(localStorage.getItem("dvolgyes-open_canasta.client.table")).toBe(
		"client",
	);
	expect(localStorage.getItem("dvolgyes-open_canasta.storage-version")).toBe(
		"1",
	);
});

it("drops only old game data on upgrade and never drops data for an older build", () => {
	localStorage.setItem("dvolgyes-open_canasta.storage-version", "1");
	localStorage.setItem("dvolgyes-open_canasta.client.table", "client");
	localStorage.setItem("dvolgyes-open_canasta.host.table", "host");
	localStorage.setItem(
		"dvolgyes-open_canasta.community.room.room.member",
		"room",
	);
	localStorage.setItem("dvolgyes-open_canasta.settings.theme", "dark");
	localStorage.setItem("another-app.client.table", "untouched");
	sessionStorage.setItem("dvolgyes-open_canasta.tab.table", "N");
	const browser = guardedStorage(() => localStorage);
	const tab = guardedStorage(() => sessionStorage);
	dropOldGameData(browser, tab, 2);
	for (const key of [
		"dvolgyes-open_canasta.client.table",
		"dvolgyes-open_canasta.host.table",
		"dvolgyes-open_canasta.community.room.room.member",
	])
		expect(localStorage.getItem(key)).toBeNull();
	expect(sessionStorage.getItem("dvolgyes-open_canasta.tab.table")).toBeNull();
	expect(localStorage.getItem("dvolgyes-open_canasta.settings.theme")).toBe(
		"dark",
	);
	expect(localStorage.getItem("another-app.client.table")).toBe("untouched");
	localStorage.setItem("dvolgyes-open_canasta.client.table", "new");
	dropOldGameData(browser, tab, 1);
	expect(localStorage.getItem("dvolgyes-open_canasta.client.table")).toBe(
		"new",
	);
	expect(localStorage.getItem("dvolgyes-open_canasta.storage-version")).toBe(
		"2",
	);
});

it("treats an invalid version as old but does not change storage without an enumerable browser store", () => {
	localStorage.setItem("dvolgyes-open_canasta.storage-version", "invalid");
	localStorage.setItem("dvolgyes-open_canasta.client.table", "old");
	dropOldGameData(
		undefined,
		guardedStorage(() => sessionStorage),
		2,
	);
	expect(localStorage.getItem("dvolgyes-open_canasta.client.table")).toBe(
		"old",
	);
	dropOldGameData(
		guardedStorage(() => localStorage),
		guardedStorage(() => sessionStorage),
		2,
	);
	expect(localStorage.getItem("dvolgyes-open_canasta.client.table")).toBeNull();
});
