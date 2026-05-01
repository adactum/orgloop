/**
 * @orgloop/connector-gog — GOG (Gmail) source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { GogSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'gog',
		kind: 'source',
		description: 'GoG (Gmail) message source — emits resource.changed events for new mail',
		source: GogSource,
		setup: {
			integrations: [
				{
					id: 'gog-cli',
					description: 'GOG CLI must be installed and authenticated (gog auth login)',
					platform: 'gog',
					command: 'gog auth login',
				},
			],
			scaffold: {
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
		},
	};
}
