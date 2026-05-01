/**
 * orgloop logs — Tail/query the event log.
 *
 * Reads from JSONL log file with filtering and formatting support.
 */

import { open, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RouteRef } from '@orgloop/sdk';
import { formatRouteRef, parseDuration, routeRefEquals } from '@orgloop/sdk';
import chalk from 'chalk';
import type { Command } from 'commander';
import * as output from '../output.js';
import { resolveRoute } from '../route-resolver.js';

const DEFAULT_LOG_FILE = join(homedir(), '.orgloop', 'logs', 'orgloop.log');

interface LogEntry {
	timestamp: string;
	event_id: string;
	trace_id: string;
	phase: string;
	source?: string;
	target?: string;
	route?: RouteRef | string;
	transform?: string;
	event_type?: string;
	result?: string;
	duration_ms?: number;
	error?: string;
	metadata?: Record<string, unknown>;
}

interface LogFilter {
	source?: string;
	/** Resolved RouteRefs to match against. Logical OR — match any. */
	route?: RouteRef[];
	/**
	 * Bare-name fallback used when the resolver could not narrow input to a
	 * single module. Matches across all modules.
	 */
	routeName?: string;
	eventType?: string;
	result?: string;
	event?: string;
	since?: number; // timestamp in ms
}

function routeNameOf(route: RouteRef | string | undefined): string | undefined {
	return typeof route === 'string' ? route : route?.name;
}

function formatLogRoute(route: RouteRef | string): string {
	return typeof route === 'string' ? route : formatRouteRef(route);
}

function matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
	if (filter.source && entry.source !== filter.source) return false;
	if (filter.route && filter.route.length > 0) {
		if (!entry.route) return false;
		if (typeof entry.route === 'string') {
			if (!filter.route.some((r) => r.name === entry.route)) return false;
		} else if (!filter.route.some((r) => routeRefEquals(r, entry.route as RouteRef))) return false;
	} else if (filter.routeName) {
		if (routeNameOf(entry.route) !== filter.routeName) return false;
	}
	if (filter.eventType && entry.event_type !== filter.eventType) return false;
	if (filter.result && entry.result !== filter.result) return false;
	if (filter.event && entry.event_id !== filter.event && entry.trace_id !== filter.event)
		return false;
	if (filter.since && new Date(entry.timestamp).getTime() < filter.since) return false;
	return true;
}

function formatLogEntry(entry: LogEntry, format: string): string {
	if (format === 'json') {
		return JSON.stringify(entry);
	}

	const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
	const phase = entry.phase.padEnd(18);
	const source = (entry.source ?? '').padEnd(12);
	const eventId = (entry.event_id ?? '').slice(0, 12);

	let detail = '';
	if (entry.transform) detail = `transform=${entry.transform}`;
	if (entry.route) {
		const routeStr = formatLogRoute(entry.route);
		detail += detail ? ` route=${routeStr}` : `route=${routeStr}`;
	}
	if (entry.result) detail += ` result=${entry.result}`;
	if (entry.duration_ms !== undefined) detail += ` (${entry.duration_ms}ms)`;
	if (entry.error) detail += ` error="${entry.error}"`;

	// Color by phase
	let phaseColored: string;
	if (entry.phase.startsWith('deliver.success')) {
		phaseColored = chalk.green(phase);
	} else if (
		entry.phase.startsWith('deliver.failure') ||
		entry.phase.startsWith('transform.error')
	) {
		phaseColored = chalk.red(phase);
	} else if (entry.phase.startsWith('transform.drop')) {
		phaseColored = chalk.yellow(phase);
	} else {
		phaseColored = chalk.dim(phase);
	}

	return `${chalk.dim(time)} ${phaseColored} ${chalk.cyan(source)} ${chalk.dim(eventId)} ${detail}`;
}

async function readLogEntries(logFile: string): Promise<LogEntry[]> {
	try {
		const content = await readFile(logFile, 'utf-8');
		const entries: LogEntry[] = [];
		for (const line of content.split('\n')) {
			if (!line.trim()) continue;
			try {
				entries.push(JSON.parse(line) as LogEntry);
			} catch {
				/* skip malformed */
			}
		}
		return entries;
	} catch {
		return [];
	}
}

async function tailLogFile(logFile: string, filter: LogFilter, format: string): Promise<void> {
	// First show existing entries
	const existing = await readLogEntries(logFile);
	const recent = existing.slice(-50);
	for (const entry of recent) {
		if (matchesFilter(entry, filter)) {
			console.log(formatLogEntry(entry, format));
		}
	}

	// Then tail for new entries
	let lastSize = 0;
	try {
		const s = await stat(logFile);
		lastSize = s.size;
	} catch {
		/* file may not exist yet */
	}

	const interval = setInterval(async () => {
		try {
			const s = await stat(logFile);
			if (s.size > lastSize) {
				const fh = await open(logFile, 'r');
				const buf = Buffer.alloc(s.size - lastSize);
				await fh.read(buf, 0, buf.length, lastSize);
				await fh.close();

				const newContent = buf.toString('utf-8');
				for (const line of newContent.split('\n')) {
					if (!line.trim()) continue;
					try {
						const entry = JSON.parse(line) as LogEntry;
						if (matchesFilter(entry, filter)) {
							console.log(formatLogEntry(entry, format));
						}
					} catch {
						/* skip */
					}
				}

				lastSize = s.size;
			}
		} catch {
			/* file may not exist yet */
		}
	}, 1000);

	// Stop on SIGINT
	process.on('SIGINT', () => {
		clearInterval(interval);
		process.exit(0);
	});

	// Keep alive
	await new Promise(() => {});
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerLogsCommand(program: Command): void {
	program
		.command('logs')
		.description('Tail or query the event log')
		.option('--source <source>', 'Filter by source')
		.option('--route <route>', 'Filter by route')
		.option('--event-type <type>', 'Filter by event type')
		.option('--result <result>', 'Filter by result (pass, drop, error)')
		.option('--event <id>', 'Trace a specific event')
		.option('--since <duration>', 'Time range filter (e.g., 2h, 30m)')
		.option('--format <format>', 'Output format: human (default) or json', 'human')
		.option('--no-follow', 'Do not tail, just show existing entries')
		.action(async (opts, _cmd) => {
			try {
				const logFile = DEFAULT_LOG_FILE;

				const filter: LogFilter = {};
				if (opts.source) filter.source = opts.source;
				if (opts.route) {
					const resolution = await resolveRoute(opts.route as string);
					if (resolution.matches.length > 0) {
						filter.route = resolution.matches;
						if (resolution.ambiguous) {
							output.warn(
								`Route "${opts.route}" matched ${resolution.matches.length} modules — showing all matches.`,
							);
						}
					} else {
						filter.routeName = opts.route as string;
						process.stderr.write(
							`Warning: could not resolve route "${opts.route}" via API or logs — falling back to bare-name match.\n`,
						);
					}
				}
				if (opts.eventType) filter.eventType = opts.eventType;
				if (opts.result) filter.result = opts.result;
				if (opts.event) filter.event = opts.event;
				if (opts.since) {
					filter.since = Date.now() - parseDuration(opts.since);
				}

				const format = output.isJsonMode() ? 'json' : (opts.format as string);

				if (opts.follow === false || opts.event) {
					// Query mode: show matching entries and exit
					const entries = await readLogEntries(logFile);
					const matching = entries.filter((e) => matchesFilter(e, filter));

					if (output.isJsonMode()) {
						output.json(matching);
					} else {
						for (const entry of matching) {
							console.log(formatLogEntry(entry, format));
						}
						if (matching.length === 0) {
							output.info('No matching log entries found.');
						}
					}
				} else {
					// Tail mode
					await tailLogFile(logFile, filter, format);
				}
			} catch (err) {
				output.error(`Logs failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});
}
