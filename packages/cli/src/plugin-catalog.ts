/**
 * Plugin catalog — list of first-party plugin packages.
 *
 * Identity metadata (id / kind / description / scaffold) is read from the
 * package's own `register()` registration; this file is just the package
 * inventory. The `sync-plugin-catalog.ts` script enforces that this list
 * matches the on-disk workspace and CLI devDependencies.
 */

export const PLUGIN_PACKAGES: readonly string[] = [
	'@orgloop/connector-agent-ctl',
	'@orgloop/connector-coding-agent',
	'@orgloop/connector-cron',
	'@orgloop/connector-docker',
	'@orgloop/connector-github',
	'@orgloop/connector-github-webhook',
	'@orgloop/connector-gog',
	'@orgloop/connector-linear',
	'@orgloop/connector-linear-webhook',
	'@orgloop/connector-openclaw',
	'@orgloop/connector-webhook',
	'@orgloop/transform-agent-gate',
	'@orgloop/transform-dedup',
	'@orgloop/transform-enrich',
	'@orgloop/transform-filter',
	'@orgloop/logger-console',
	'@orgloop/logger-file',
	'@orgloop/logger-otel',
	'@orgloop/logger-syslog',
];
