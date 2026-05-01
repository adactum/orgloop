import type { ConnectorRegistration } from '@orgloop/sdk';
import { DockerTarget } from './target.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'docker',
		kind: 'target',
		description: 'Docker / Kind cluster delivery target',
		target: DockerTarget,
		setup: {
			env_vars: [
				{
					name: 'KUBECONFIG',
					description: 'Path to kubeconfig file for Kind cluster operations',
					required: false,
				},
			],
			scaffold: {
				target: `apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

actors:
  - id: docker
    description: Docker / Kind delivery
    connector: "@orgloop/connector-docker"
    config: {}
`,
			},
		},
	};
}
