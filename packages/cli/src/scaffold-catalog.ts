/**
 * Static scaffold catalog — embedded YAML templates for first-party connectors.
 *
 * These templates are used by `orgloop init` to scaffold connector config files.
 * Embedding them statically means the CLI does not need to import connector
 * packages at runtime (they are devDependencies and unavailable in packaged
 * installs). Keep this file in sync with each connector's `register().setup.scaffold`.
 */

export interface ConnectorScaffoldEntry {
	packageName: string;
	kind: 'source' | 'target' | 'both';
	source?: string;
	target?: string;
}

export const CONNECTOR_SCAFFOLD_CATALOG: Readonly<Record<string, ConnectorScaffoldEntry>> = {
	github: {
		packageName: '@orgloop/connector-github',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: github
    description: GitHub repository events
    connector: "@orgloop/connector-github"
    config:
      repo: "\${GITHUB_REPO}"
      token: "\${GITHUB_TOKEN}"
      events:
        - "pull_request.review_submitted"
        - "pull_request_review_comment"
        - "issue_comment"
        - "pull_request.closed"
        - "pull_request.merged"
        - "workflow_run.completed"
    poll:
      interval: "5m"
    emits:
      - resource.changed
`,
	},

	'github-webhook': {
		packageName: '@orgloop/connector-github-webhook',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: github-webhook
    description: GitHub webhook receiver
    connector: "@orgloop/connector-github-webhook"
    config:
      secret: "\${GITHUB_WEBHOOK_SECRET}"
    emits:
      - resource.changed
`,
	},

	linear: {
		packageName: '@orgloop/connector-linear',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: linear
    description: Linear project tracking events
    connector: "@orgloop/connector-linear"
    config:
      team: "\${LINEAR_TEAM_KEY}"
      api_key: "\${LINEAR_API_KEY}"
    poll:
      interval: "5m"
    emits:
      - resource.changed
`,
	},

	'linear-webhook': {
		packageName: '@orgloop/connector-linear-webhook',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: linear-webhook
    description: Linear webhook receiver
    connector: "@orgloop/connector-linear-webhook"
    config:
      secret: "\${LINEAR_WEBHOOK_SECRET}"
    emits:
      - resource.changed
`,
	},

	openclaw: {
		packageName: '@orgloop/connector-openclaw',
		kind: 'target',
		target: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

actors:
  - id: openclaw-engineering-agent
    description: OpenClaw engineering agent
    connector: "@orgloop/connector-openclaw"
    config:
      base_url: "http://127.0.0.1:18789"
      auth_token_env: "\${OPENCLAW_WEBHOOK_TOKEN}"
      agent_id: "\${OPENCLAW_AGENT_ID}"
`,
	},

	webhook: {
		packageName: '@orgloop/connector-webhook',
		kind: 'both',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: webhook
    description: Generic webhook receiver
    connector: "@orgloop/connector-webhook"
    config:
      path: "/webhook"
    emits:
      - resource.changed
      - message.received
`,
		target: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

actors:
  - id: webhook
    description: Generic webhook delivery target
    connector: "@orgloop/connector-webhook"
    config:
      url: "\${WEBHOOK_TARGET_URL}"
`,
	},

	cron: {
		packageName: '@orgloop/connector-cron',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: cron
    description: Scheduled triggers
    connector: "@orgloop/connector-cron"
    config:
      schedules:
        - name: every-5m
          cron: "every 5m"
    emits:
      - resource.changed
`,
	},

	'coding-agent': {
		packageName: '@orgloop/connector-coding-agent',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: coding-agent
    description: Coding agent session lifecycle events
    connector: "@orgloop/connector-coding-agent"
    config:
      harness: claude-code
      # secret: "\${WEBHOOK_SECRET}"
    emits:
      - actor.stopped
`,
	},

	docker: {
		packageName: '@orgloop/connector-docker',
		kind: 'target',
		target: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

actors:
  - id: docker
    description: Docker / Kind delivery
    connector: "@orgloop/connector-docker"
    config: {}
`,
	},

	'agent-ctl': {
		packageName: '@orgloop/connector-agent-ctl',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: agent-ctl
    description: agent-ctl session lifecycle events
    connector: "@orgloop/connector-agent-ctl"
    config: {}
    emits:
      - actor.stopped
`,
	},

	gog: {
		packageName: '@orgloop/connector-gog',
		kind: 'source',
		source: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: gog
    description: GoG (Gmail) source
    connector: "@orgloop/connector-gog"
    config: {}
    emits:
      - resource.changed
`,
	},
};
