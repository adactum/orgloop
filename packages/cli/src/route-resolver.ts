/**
 * Route resolver — translates a user-supplied bare or qualified route
 * identifier into one or more `RouteRef`s.
 *
 * Resolution precedence:
 *   1. Live `/api/routes` if a daemon is reachable.
 *   2. Offline JSONL log scan (`route.module` and `route.name`).
 *   3. No-data fallback: caller falls back to bare-name match.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RouteRef } from '@orgloop/sdk';
import { routeRefKey } from '@orgloop/sdk';

const DEFAULT_LOG_FILE = join(homedir(), '.orgloop', 'logs', 'orgloop.log');
const PORT_FILE = join(homedir(), '.orgloop', 'runtime.port');

export interface RouteResolverOptions {
	/** Override for the JSONL log file path (defaults to ~/.orgloop/logs/orgloop.log). */
	logFile?: string;
	/** Override the running daemon port (skips port-file lookup). */
	port?: number;
	/**
	 * Skip the live API probe (offline mode). Useful for tests and pure-CLI
	 * commands that should never hit the daemon.
	 */
	offline?: boolean;
}

export interface RouteResolution {
	matches: RouteRef[];
	source: 'api' | 'log' | 'none';
	ambiguous: boolean;
}

function parseRouteInput(input: string): { module?: string; name: string } {
	const slash = input.indexOf('/');
	if (slash > 0) {
		return { module: input.slice(0, slash), name: input.slice(slash + 1) };
	}
	return { name: input };
}

async function readDaemonPort(): Promise<number | null> {
	try {
		const txt = await readFile(PORT_FILE, 'utf-8');
		const port = Number.parseInt(txt.trim(), 10);
		return Number.isNaN(port) ? null : port;
	} catch {
		return null;
	}
}

interface ApiRouteEntry {
	module: string;
	name: string;
}

async function fetchApiRoutes(port: number): Promise<ApiRouteEntry[] | null> {
	try {
		const res = await fetch(`http://127.0.0.1:${port}/api/routes`, {
			signal: AbortSignal.timeout(2_000),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as ApiRouteEntry[];
		if (!Array.isArray(body)) return null;
		return body;
	} catch {
		return null;
	}
}

async function scanLogsForRoutes(logFile: string, name: string): Promise<RouteRef[]> {
	const found = new Set<string>();
	const refs: RouteRef[] = [];
	try {
		const text = await readFile(logFile, 'utf-8');
		for (const line of text.split('\n')) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line) as { route?: RouteRef };
				if (entry.route?.name === name) {
					const key = routeRefKey(entry.route);
					if (!found.has(key)) {
						found.add(key);
						refs.push({ module: entry.route.module, name: entry.route.name });
					}
				}
			} catch {
				// Skip malformed lines.
			}
		}
	} catch {
		// Log file may not exist yet.
	}
	return refs;
}

export async function resolveRoute(
	input: string,
	options?: RouteResolverOptions,
): Promise<RouteResolution> {
	const { module, name } = parseRouteInput(input);

	if (module) {
		// Caller already qualified it — accept as-is.
		return { matches: [{ module, name }], source: 'none', ambiguous: false };
	}

	// 1. Live API.
	if (!options?.offline) {
		const port = options?.port ?? (await readDaemonPort());
		if (port != null) {
			const routes = await fetchApiRoutes(port);
			if (routes) {
				const matches = routes
					.filter((r) => r.name === name)
					.map((r) => ({ module: r.module, name: r.name }));
				if (matches.length > 0) {
					return {
						matches,
						source: 'api',
						ambiguous: matches.length > 1,
					};
				}
			}
		}
	}

	// 2. Offline log scan.
	const logRefs = await scanLogsForRoutes(options?.logFile ?? DEFAULT_LOG_FILE, name);
	if (logRefs.length > 0) {
		return { matches: logRefs, source: 'log', ambiguous: logRefs.length > 1 };
	}

	// 3. No-data fallback.
	return { matches: [], source: 'none', ambiguous: false };
}
