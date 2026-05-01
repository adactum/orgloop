/**
 * @orgloop/connector-linear — Linear source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { LinearSource } from './source.js';
import { LinearCredentialValidator } from './validator.js';

export {
	normalizeAssigneeChange,
	normalizeComment,
	normalizeDelegateChange,
	normalizeIssueStateChange,
	normalizeLabelChange,
	normalizeNewIssue,
	normalizePriorityChange,
} from './normalizer.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'linear',
		kind: 'source',
		description: 'Linear project tracking events (poll-based)',
		source: LinearSource,
		setup: {
			env_vars: [
				{
					name: 'LINEAR_API_KEY',
					description: 'Linear API key for reading issues and comments',
					help_url: 'https://linear.app/settings/api',
				},
			],
			scaffold: {
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
		},
		credential_validators: {
			LINEAR_API_KEY: new LinearCredentialValidator(),
		},
	};
}
