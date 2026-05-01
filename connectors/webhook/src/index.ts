/**
 * @orgloop/connector-webhook — Generic webhook connector registration (source + target).
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { WebhookSource } from './source.js';
import { WebhookTarget } from './target.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'webhook',
		kind: 'both',
		description: 'Generic webhook receiver and outbound HTTP delivery target',
		source: WebhookSource,
		target: WebhookTarget,
		setup: {
			env_vars: [
				{
					name: 'WEBHOOK_SECRET',
					description: 'HMAC secret for validating incoming webhook signatures',
					required: false,
				},
			],
			scaffold: {
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
		},
	};
}
