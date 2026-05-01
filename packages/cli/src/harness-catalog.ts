/**
 * Coding-agent harness catalog.
 *
 * The harness onboarding metadata is intentionally kept here — it's
 * harness-specific, not connector-specific, and the harness names map to
 * `orgloop hook <name>` subcommands the CLI registers locally.
 */

import type { ConnectorIntegration, EnvVarDefinition } from '@orgloop/sdk';

export interface HarnessCatalogEntry {
	name: 'claude-code' | 'codex' | 'opencode' | 'pi' | 'pi-rust';
	description: string;
	envVars: EnvVarDefinition[];
	integrations: ConnectorIntegration[];
}

export const CODING_AGENT_HARNESSES: HarnessCatalogEntry[] = [
	{
		name: 'claude-code',
		description: 'Claude Code session lifecycle hook',
		envVars: [
			{
				name: 'CLAUDE_CODE_WEBHOOK_SECRET',
				description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
				required: false,
			},
		],
		integrations: [
			{
				id: 'claude-code-stop-hook',
				description: 'Install a Stop hook in Claude Code settings so session exits notify OrgLoop',
				platform: 'claude-code',
				command: 'orgloop hook claude-code-stop',
			},
			{
				id: 'claude-code-start-hook',
				description:
					'Install a Start hook in Claude Code settings so session launches notify OrgLoop (optional)',
				platform: 'claude-code',
				command: 'orgloop hook claude-code-start',
			},
		],
	},
	{
		name: 'codex',
		description: 'Codex session lifecycle hook',
		envVars: [
			{
				name: 'CODEX_WEBHOOK_SECRET',
				description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
				required: false,
			},
		],
		integrations: [
			{
				id: 'codex-stop-hook',
				description: 'Install a Stop hook so Codex session exits notify OrgLoop',
				platform: 'codex',
				command: 'orgloop hook codex-stop',
			},
			{
				id: 'codex-start-hook',
				description: 'Install a Start hook so Codex session launches notify OrgLoop (optional)',
				platform: 'codex',
				command: 'orgloop hook codex-start',
			},
		],
	},
	{
		name: 'opencode',
		description: 'OpenCode session lifecycle hook',
		envVars: [
			{
				name: 'OPENCODE_WEBHOOK_SECRET',
				description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
				required: false,
			},
		],
		integrations: [
			{
				id: 'opencode-stop-hook',
				description: 'Install a Stop hook so OpenCode session exits notify OrgLoop',
				platform: 'opencode',
				command: 'orgloop hook opencode-stop',
			},
		],
	},
	{
		name: 'pi',
		description: 'Pi session lifecycle hook',
		envVars: [
			{
				name: 'PI_WEBHOOK_SECRET',
				description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
				required: false,
			},
		],
		integrations: [
			{
				id: 'pi-stop-hook',
				description: 'Install a Stop hook so Pi session exits notify OrgLoop',
				platform: 'pi',
				command: 'orgloop hook pi-stop',
			},
		],
	},
	{
		name: 'pi-rust',
		description: 'Pi-rust session lifecycle hook',
		envVars: [
			{
				name: 'PI_RUST_WEBHOOK_SECRET',
				description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
				required: false,
			},
		],
		integrations: [
			{
				id: 'pi-rust-stop-hook',
				description: 'Install a Stop hook so pi-rust session exits notify OrgLoop',
				platform: 'pi-rust',
				command: 'orgloop hook pi-rust-stop',
			},
		],
	},
];
