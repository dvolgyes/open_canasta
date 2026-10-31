/** Durable local study files: exclusive output, a run lock, and source-bound resume. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { MODERN_RULES_VERSION } from "../src/canasta/modern-hand";

export function readStudyJson(path: string): unknown {
	if (statSync(path).size > 1024 * 1024)
		throw new Error(`JSON file exceeds 1 MiB: ${path}`);
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function fingerprint(scripts: readonly string[]): string {
	const hash = createHash("sha256");
	const visit = (path: string) => {
		if (statSync(path).isDirectory()) {
			for (const name of readdirSync(path).sort()) visit(join(path, name));
		} else hash.update(path).update(readFileSync(path));
	};
	for (const path of [
		"src",
		"scripts/modern-store.ts",
		...scripts,
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	])
		visit(path);
	return hash.digest("hex");
}

function writeNew(path: string, value: unknown): void {
	const temporary = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value, null, "\t")}\n`, {
		flag: "wx",
	});
	try {
		linkSync(temporary, path);
	} finally {
		unlinkSync(temporary);
	}
}

export interface ModernStudyStore {
	readonly out: string;
	exists(name: string): boolean;
	read(name: string): unknown;
	write(name: string, value: unknown): void;
	close(): void;
}

export function openModernStore(
	outputPath: string,
	resume: boolean,
	config: unknown,
	scripts: readonly string[],
): ModernStudyStore {
	const out = resolve(outputPath);
	const identity = {
		config,
		rulesVersion: MODERN_RULES_VERSION,
		sourceSha256: fingerprint(scripts),
		node: process.version,
	};
	const manifest = join(out, "manifest.json");
	if (resume) {
		const saved = readStudyJson(manifest);
		if (
			typeof saved !== "object" ||
			saved === null ||
			Array.isArray(saved) ||
			JSON.stringify((saved as { identity?: unknown }).identity) !==
				JSON.stringify(identity)
		)
			throw new Error(
				"resume requires the identical configuration, source, and Node version",
			);
	} else {
		mkdirSync(out);
		const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		writeNew(manifest, {
			identity,
			baseCommit,
			createdAt: new Date().toISOString(),
		});
	}
	const lockPath = join(out, "run.lock");
	const lock = openSync(lockPath, "wx");
	writeFileSync(lock, JSON.stringify({ pid: process.pid, host: hostname() }));
	const path = (name: string) => {
		if (!/^[a-z0-9][a-z0-9.-]*\.json$/.test(name))
			throw new Error("invalid study file name");
		return join(out, name);
	};
	return {
		out,
		exists: (name) => existsSync(path(name)),
		read: (name) => readStudyJson(path(name)),
		write: (name, value) => writeNew(path(name), value),
		close: () => {
			closeSync(lock);
			unlinkSync(lockPath);
		},
	};
}
