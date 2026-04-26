import type { ConnectorRegistration } from '@orgloop/sdk';
import { AgentCtlSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'agent-ctl',
		kind: 'source',
		description: 'agent-ctl session lifecycle source — emits actor.stopped events',
		source: AgentCtlSource,
		setup: {
			env_vars: [
				{
					name: 'AGENT_CTL_PATH',
					description: 'Path to the agent-ctl binary (defaults to ~/personal/agent-ctl/agent-ctl)',
					required: false,
				},
			],
			scaffold: {
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
		},
	};
}
