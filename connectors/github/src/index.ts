/**
 * @orgloop/connector-github — GitHub source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { GitHubSource } from './source.js';
import { GitHubCredentialValidator } from './validator.js';

export {
	normalizeCheckSuiteCompleted,
	normalizeIssueAssigned,
	normalizeIssueComment,
	normalizeIssueLabeled,
	normalizeIssueOpened,
	normalizePullRequestClosed,
	normalizePullRequestOpened,
	normalizePullRequestReadyForReview,
	normalizePullRequestReview,
	normalizePullRequestReviewComment,
	normalizeWorkflowRunFailed,
} from './normalizer.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'github',
		kind: 'source',
		description: 'GitHub repository events (poll-based)',
		source: GitHubSource,
		setup: {
			env_vars: [
				{
					name: 'GITHUB_TOKEN',
					description: 'GitHub personal access token with repo scope',
					help_url: 'https://github.com/settings/tokens/new?scopes=repo',
				},
			],
			scaffold: {
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
		},
		credential_validators: {
			GITHUB_TOKEN: new GitHubCredentialValidator(),
		},
	};
}
