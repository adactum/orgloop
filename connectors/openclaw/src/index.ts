/**
 * @orgloop/connector-openclaw — OpenClaw actor (target) connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { OpenClawServiceDetector } from './detector.js';
import { OpenClawTarget } from './target.js';
import { OpenClawCredentialValidator } from './validator.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'openclaw',
		kind: 'target',
		description: 'OpenClaw engineering agent delivery target',
		target: OpenClawTarget,
		setup: {
			env_vars: [
				{
					name: 'OPENCLAW_WEBHOOK_TOKEN',
					description: 'OpenClaw webhook authentication token',
					help_url: 'https://openclaw.com/docs/webhooks',
					required: false,
				},
			],
			scaffold: {
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
		},
		credential_validators: {
			OPENCLAW_WEBHOOK_TOKEN: new OpenClawCredentialValidator(),
		},
		service_detector: new OpenClawServiceDetector(),
	};
}
