/**
 * orgloop init — Scaffold a new OrgLoop project.
 *
 * Connector scaffold YAML is read from the static catalog embedded in
 * scaffold-catalog.ts. Updating a connector scaffold requires editing
 * that file to keep it in sync with the connector's own registration.
 */

import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { Command } from 'commander';
import { getEnvVarMeta } from '../env-metadata.js';
import * as output from '../output.js';
import { PLUGIN_PACKAGES } from '../plugin-catalog.js';
import { CONNECTOR_SCAFFOLD_CATALOG } from '../scaffold-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Aliases — short connector identifiers that re-use an existing connector
// package under a different scaffold (mostly webhook-based deliveries and
// coding-agent harness short names).
const ALIAS_PACKAGES: Record<string, string> = {
	slack: '@orgloop/connector-webhook',
	pagerduty: '@orgloop/connector-webhook',
	'claude-code': '@orgloop/connector-coding-agent',
	codex: '@orgloop/connector-coding-agent',
	opencode: '@orgloop/connector-coding-agent',
	pi: '@orgloop/connector-coding-agent',
	'pi-rust': '@orgloop/connector-coding-agent',
};

/** Return scaffold YAML for a connector role. Uses the static scaffold catalog. */
function getConnectorScaffold(
	connectorId: string,
	roleHint: 'source' | 'target' | 'either',
): { packageName: string; yaml: string } | null {
	// Webhook delivery aliases: produce alias-specific actor id and env var
	// so that selecting both slack and pagerduty does not create duplicate ids.
	if (connectorId === 'slack' && roleHint !== 'source') {
		return {
			packageName: '@orgloop/connector-webhook',
			yaml: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

actors:
  - id: slack
    description: Slack webhook delivery
    connector: "@orgloop/connector-webhook"
    config:
      url: "\${SLACK_WEBHOOK_URL}"
`,
		};
	}
	if (connectorId === 'pagerduty' && roleHint !== 'source') {
		return {
			packageName: '@orgloop/connector-webhook',
			yaml: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

actors:
  - id: pagerduty
    description: PagerDuty webhook delivery
    connector: "@orgloop/connector-webhook"
    config:
      url: "\${PAGERDUTY_WEBHOOK_URL}"
`,
		};
	}

	const aliased = ALIAS_PACKAGES[connectorId];
	if (aliased) {
		// For harness aliases, customise the harness field on the coding-agent scaffold.
		if (aliased === '@orgloop/connector-coding-agent' && connectorId !== 'coding-agent') {
			return {
				packageName: aliased,
				yaml: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: ${connectorId}
    description: ${connectorId} session events
    connector: "${aliased}"
    config:
      harness: ${connectorId}
    emits:
      - actor.stopped
`,
			};
		}
		// Fall through to catalog lookup using the alias target package's connector id.
		const aliasedConnectorId = aliased.replace('@orgloop/connector-', '');
		return lookupCatalog(aliasedConnectorId, aliased, roleHint);
	}

	return lookupCatalog(connectorId, `@orgloop/connector-${connectorId}`, roleHint);
}

function lookupCatalog(
	connectorId: string,
	packageName: string,
	roleHint: 'source' | 'target' | 'either',
): { packageName: string; yaml: string } | null {
	const entry = CONNECTOR_SCAFFOLD_CATALOG[connectorId];
	if (!entry) return null;

	let role: 'source' | 'target';
	if (entry.kind === 'source') role = 'source';
	else if (entry.kind === 'target') role = 'target';
	else role = roleHint === 'target' ? 'target' : 'source';

	const yaml = role === 'source' ? entry.source : entry.target;
	if (!yaml) return null;
	return { packageName, yaml };
}

/** All connector IDs known to init — first-party connectors plus aliases. */
function listAvailableConnectorIds(): string[] {
	const firstParty = PLUGIN_PACKAGES.filter((p) => p.startsWith('@orgloop/connector-')).map((p) =>
		p.replace('@orgloop/connector-', ''),
	);
	return [...firstParty, ...Object.keys(ALIAS_PACKAGES)];
}

function getVersionRange(): string {
	try {
		const pkgPath = resolve(__dirname, '..', '..', 'package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
		return `^${pkg.version}`;
	} catch {
		return '*';
	}
}

function collectProjectDeps(packageNames: string[]): Record<string, string> {
	const version = getVersionRange();
	const deps: Record<string, string> = {
		'@orgloop/core': version,
		'@orgloop/logger-file': version,
	};
	for (const pkg of packageNames) deps[pkg] = version;
	return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

// Connector IDs that are explicit delivery (target) aliases. Used to derive
// the role hint passed to scaffold resolution. Other connectors derive role
// from `ConnectorRegistration.kind`; bare-ID `kind: 'both'` connectors
// default to source to preserve historical semantics (e.g. `webhook` is a
// receiver, never a delivery, unless picked via an explicit alias).
const DELIVERY_ALIASES = new Set(['openclaw', 'docker', 'slack', 'pagerduty']);

function generateOrgloopYaml(name: string, description: string, connectors: string[]): string {
	const connectorRefs = connectors.map((c) => `  - connectors/${c}.yaml`).join('\n');
	return `apiVersion: orgloop/v1alpha1
kind: Project

metadata:
  name: ${name}
  description: "${description}"

defaults:
  poll_interval: "5m"
  event_retention: "30d"
  log_level: info

connectors:
${connectorRefs}

transforms:
  - transforms/transforms.yaml

loggers:
  - loggers/default.yaml
`;
}

function generateRouteYaml(connectors: string[]): string {
	if (connectors.includes('github') && connectors.includes('openclaw')) {
		return `apiVersion: orgloop/v1alpha1
kind: RouteGroup

routes:
  - name: example-route
    description: Example route — customize for your setup
    when:
      source: github
      events:
        - resource.changed
    transforms:
      - ref: drop-bot-noise
    then:
      actor: openclaw-engineering-agent
    with:
      prompt_file: ../sops/example.md
`;
	}
	return `apiVersion: orgloop/v1alpha1
kind: RouteGroup

routes: []
`;
}

const DEFAULT_TRANSFORMS_YAML = `apiVersion: orgloop/v1alpha1
kind: TransformGroup

transforms:
  - name: drop-bot-noise
    type: script
    script: ./drop-bot-noise.sh
    timeout_ms: 5000
`;

const DROP_BOT_SCRIPT = `#!/usr/bin/env bash
# drop-bot-noise.sh — Drop events from known bot authors.
set -euo pipefail
EVENT=$(cat)
AUTHOR_TYPE=$(echo "$EVENT" | jq -r '.provenance.author_type // "unknown"')
if [ "$AUTHOR_TYPE" = "bot" ]; then exit 78; fi
echo "$EVENT"
exit 0
`;

const DEFAULT_LOGGER_YAML = `apiVersion: orgloop/v1alpha1
kind: LoggerGroup

loggers:
  - name: file-log
    type: "@orgloop/logger-file"
    config:
      path: "~/.orgloop/logs/orgloop.log"
      format: jsonl
      rotate:
        max_size: "50MB"
        max_files: 10
`;

const EXAMPLE_SOP = `# Example Launch Prompt

You are receiving an event from the organization pipeline.

## Context
This event was routed through OrgLoop based on the configured rules.

## Instructions
1. Review the event payload
2. Take appropriate action based on the event type
3. Report completion status

## Constraints
- Do not modify production infrastructure without approval
- Follow the organization's coding standards
- Escalate security-related events immediately
`;

export function collectEnvVars(connectors: string[]): Map<string, string> {
	const envVars = new Map<string, string>();
	for (const c of connectors) {
		const role: 'source' | 'target' | 'either' = DELIVERY_ALIASES.has(c) ? 'target' : 'either';
		const scaffold = getConnectorScaffold(c, role);
		if (!scaffold) continue;
		for (const m of scaffold.yaml.matchAll(/\$\{([^}]+)\}/g)) {
			envVars.set(m[1], `connectors/${c}.yaml`);
		}
	}
	return envVars;
}

export function buildEnvExampleContent(envVars: Map<string, string>): string {
	const lines: string[] = [
		'# OrgLoop environment variables',
		'# Copy to .env and fill in values',
		'',
	];
	for (const [varName] of envVars) {
		const meta = getEnvVarMeta(varName);
		if (meta) {
			lines.push(`# ${meta.description}`);
			if (meta.help_url) lines.push(`# ${meta.help_url}`);
		}
		lines.push(`# ${varName}=`);
		lines.push('');
	}
	return lines.join('\n');
}

async function dirExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function scaffoldProject(
	targetDir: string,
	name: string,
	description: string,
	connectors: string[],
): Promise<{ created: string[]; packageDeps: string[] }> {
	const created: string[] = [];
	const packageDeps = new Set<string>();

	await mkdir(join(targetDir, 'connectors'), { recursive: true });
	await mkdir(join(targetDir, 'routes'), { recursive: true });
	await mkdir(join(targetDir, 'transforms'), { recursive: true });
	await mkdir(join(targetDir, 'loggers'), { recursive: true });
	await mkdir(join(targetDir, 'sops'), { recursive: true });

	// Resolve scaffolds first so orgloop.yaml only lists connectors that have files.
	const scaffoldedConnectors: string[] = [];
	const connectorScaffolds: Array<{ id: string; scaffold: { packageName: string; yaml: string } }> =
		[];
	for (const c of connectors) {
		const role: 'source' | 'target' | 'either' = DELIVERY_ALIASES.has(c) ? 'target' : 'either';
		const scaffold = getConnectorScaffold(c, role);
		if (!scaffold) {
			output.warn(`Connector "${c}" has no scaffold for role "${role}" — skipping.`);
			continue;
		}
		scaffoldedConnectors.push(c);
		connectorScaffolds.push({ id: c, scaffold });
	}

	await writeFile(
		join(targetDir, 'orgloop.yaml'),
		generateOrgloopYaml(name, description, scaffoldedConnectors),
		'utf-8',
	);
	created.push('orgloop.yaml');

	for (const { id: c, scaffold } of connectorScaffolds) {
		await writeFile(join(targetDir, 'connectors', `${c}.yaml`), scaffold.yaml, 'utf-8');
		created.push(`connectors/${c}.yaml`);
		packageDeps.add(scaffold.packageName);
	}

	await writeFile(
		join(targetDir, 'routes', 'example.yaml'),
		generateRouteYaml(scaffoldedConnectors),
		'utf-8',
	);
	created.push('routes/example.yaml');

	await writeFile(join(targetDir, 'loggers', 'default.yaml'), DEFAULT_LOGGER_YAML, 'utf-8');
	created.push('loggers/default.yaml');

	await writeFile(
		join(targetDir, 'transforms', 'transforms.yaml'),
		DEFAULT_TRANSFORMS_YAML,
		'utf-8',
	);
	created.push('transforms/transforms.yaml');

	const scriptPath = join(targetDir, 'transforms', 'drop-bot-noise.sh');
	await writeFile(scriptPath, DROP_BOT_SCRIPT, 'utf-8');
	const { chmod } = await import('node:fs/promises');
	await chmod(scriptPath, 0o755);
	created.push('transforms/drop-bot-noise.sh');

	await writeFile(join(targetDir, 'sops', 'example.md'), EXAMPLE_SOP, 'utf-8');
	created.push('sops/example.md');

	const packageJsonPath = join(targetDir, 'package.json');
	if (!(await dirExists(packageJsonPath))) {
		const packageJson = {
			private: true,
			description: `OrgLoop project: ${name}`,
			dependencies: collectProjectDeps([...packageDeps]),
		};
		await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8');
		created.push('package.json');
	}

	const envVars = await collectEnvVars(connectors);
	if (envVars.size > 0) {
		await writeFile(join(targetDir, '.env.example'), buildEnvExampleContent(envVars), 'utf-8');
		created.push('.env.example');
	}

	const gitignorePath = join(targetDir, '.gitignore');
	if (!(await dirExists(gitignorePath))) {
		await writeFile(
			gitignorePath,
			'# Environment variables (contains secrets)\n.env\n.env.local\n\n# OrgLoop runtime\n.orgloop/\n\n# Node\nnode_modules/\ndist/\n',
			'utf-8',
		);
		created.push('.gitignore');
	}

	return { created, packageDeps: [...packageDeps] };
}

export function buildClaudeCodeHookEntry(command: string) {
	return { matcher: '', hooks: [{ type: 'command', command }] };
}

export function hasExistingOrgloopHook(stopHooks: unknown[]): boolean {
	return stopHooks.some((entry) => {
		if (typeof entry !== 'object' || entry === null) return false;
		const obj = entry as Record<string, unknown>;
		const innerHooks = obj.hooks as Array<Record<string, unknown>> | undefined;
		return innerHooks?.some((h) => typeof h.command === 'string' && h.command.includes('orgloop'));
	});
}

export function mergeClaudeCodeHook(
	settings: Record<string, unknown>,
	hookCommand: string,
): { settings: Record<string, unknown>; alreadyInstalled: boolean } {
	const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
	const stopHooks = (hooks.Stop ?? []) as unknown[];
	if (hasExistingOrgloopHook(stopHooks)) return { settings, alreadyInstalled: true };
	stopHooks.push(buildClaudeCodeHookEntry(hookCommand));
	hooks.Stop = stopHooks;
	settings.hooks = hooks;
	return { settings, alreadyInstalled: false };
}

async function promptClaudeCodeHook(): Promise<void> {
	const { default: inquirer } = await import('inquirer');
	const { scope } = await inquirer.prompt([
		{
			type: 'list',
			name: 'scope',
			message: 'Install OrgLoop hook to Claude Code settings?',
			choices: [
				{ name: 'Global (~/.claude/settings.json)', value: 'global' },
				{ name: 'Project (.claude/settings.json)', value: 'project' },
				{ name: 'Skip', value: 'skip' },
			],
		},
	]);
	if (scope === 'skip') return;
	const settingsPath =
		scope === 'global'
			? join(homedir(), '.claude', 'settings.json')
			: join(process.cwd(), '.claude', 'settings.json');
	const hookCommand = 'orgloop hook claude-code-stop';
	try {
		let settings: Record<string, unknown> = {};
		try {
			settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
		} catch {}
		const result = mergeClaudeCodeHook(settings, hookCommand);
		if (result.alreadyInstalled) {
			output.info('  OrgLoop hook already installed in Claude Code settings.');
			return;
		}
		await mkdir(join(settingsPath, '..'), { recursive: true });
		await writeFile(settingsPath, `${JSON.stringify(result.settings, null, 2)}\n`, 'utf-8');
		output.success(`  Installed Claude Code Stop hook → ${chalk.dim(settingsPath)}`);
	} catch (err) {
		output.warn(`  Could not install hook: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export function registerInitCommand(program: Command): void {
	program
		.command('init')
		.description('Scaffold a new OrgLoop project')
		.option('--name <name>', 'Project name')
		.option('--description <desc>', 'Project description')
		.option('--connectors <list>', 'Comma-separated connector list')
		.option('--no-interactive', 'Disable interactive prompts')
		.option('--dir <path>', 'Target directory (default: current directory)')
		.action(async (opts) => {
			try {
				const targetDir = opts.dir ? resolve(opts.dir) : process.cwd();
				const available = listAvailableConnectorIds();

				let name: string;
				let description: string;
				let connectors: string[];

				if (opts.interactive === false) {
					name = opts.name ?? 'my-org';
					description = opts.description ?? 'OrgLoop project';
					connectors = opts.connectors
						? (opts.connectors as string).split(',').map((c: string) => c.trim())
						: ['github'];
				} else {
					const { default: inquirer } = await import('inquirer');
					const answers = await inquirer.prompt([
						{
							type: 'input',
							name: 'name',
							message: 'Project name:',
							default: opts.name ?? 'my-org',
						},
						{
							type: 'input',
							name: 'description',
							message: 'Description:',
							default: opts.description ?? 'Organization event routing',
						},
						{
							type: 'checkbox',
							name: 'connectors',
							message: 'Which connectors?',
							choices: available.map((c) => ({
								name: c.charAt(0).toUpperCase() + c.slice(1),
								value: c,
								checked: c === 'webhook',
							})),
						},
					]);
					name = answers.name as string;
					description = answers.description as string;
					connectors = answers.connectors as string[];
				}

				for (const c of connectors) {
					if (!available.includes(c)) {
						output.error(`Unknown connector: ${c}`);
						output.info(`Available: ${available.join(', ')}`);
						process.exitCode = 1;
						return;
					}
				}

				if (await dirExists(join(targetDir, 'orgloop.yaml'))) {
					output.error('orgloop.yaml already exists in this directory.');
					process.exitCode = 1;
					return;
				}

				const { created } = await scaffoldProject(targetDir, name, description, connectors);

				output.blank();
				output.heading('Created:');
				for (const file of created) output.info(`  ${file}`);

				const envVars = await collectEnvVars(connectors);
				if (envVars.size > 0) {
					output.blank();
					output.heading('Environment variables:');
					for (const [varName, file] of envVars) {
						const isSet = process.env[varName] !== undefined;
						const icon = isSet ? chalk.green('✓') : chalk.red('✗');
						output.info(`  ${icon} ${chalk.yellow(varName.padEnd(22))} ${chalk.dim(file)}`);
						if (!isSet) {
							const meta = getEnvVarMeta(varName);
							if (meta) {
								output.info(`    ${chalk.dim('→')} ${meta.description}`);
								if (meta.help_url)
									output.info(`    ${chalk.dim('→')} ${chalk.cyan(meta.help_url)}`);
							}
						}
					}
				}

				if (connectors.includes('claude-code') && opts.interactive !== false) {
					output.blank();
					await promptClaudeCodeHook();
				}

				output.blank();
				output.info(
					chalk.dim(
						'Next: run `npm install` to install dependencies, then `orgloop doctor` to check your environment.',
					),
				);
			} catch (err) {
				output.error(`Init failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});
}
