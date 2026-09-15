# GitHub accounts, repositories and delivery evidence

For exact environment variables, OAuth registration, deployment and webhook setup, follow [Deploy the full workspace](deploy-full-workspace.md). These capabilities run in the Node API; the Worker/D1 adapter remains a public fixture demo.

## Account and repository access

Email/password and GitHub OAuth both create a CodeLens session. Connecting GitHub from **Account & GitHub** adds repository and security permissions after sign-in. Tokens stay encrypted on the server and are never placed in browser storage, clone URLs, or logs. Repository lists and owned sources require their owner's session. OAuth sign-in does not silently merge an existing email account.

Basic OAuth identity scopes are `read:user user:email`. Repository connection additionally requests `repo workflow security_events`. Your GitHub role, organizational approval, protected-branch rules and enabled security features still apply. [GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

Public repositories can be connected by URL without a GitHub token. Authorized connections also list private repositories. Branch discovery retrieves current GitHub metadata and paginated branch heads. Indexing validates the selected branch again and clones its latest code into an immutable snapshot. If a branch was deleted, the UI asks you to sync and choose another branch. File count, size and supported-format limits are reported with coverage.

## Own investigations and CI/CD

The own-repository investigation compares exact GitHub commits, saves bounded source patches, and matches workflow runs to the candidate SHA. Missing matching CI is inconclusive. Repository-wide deployments and security alerts are labeled separately. This does not execute arbitrary application code or infer performance from a diff.

The delivery screen retrieves workflows, jobs and steps, deployment statuses, pull-request mergeability, and accessible dependency/code/secret-scanning alerts. Restricted sections show permission errors rather than an invented clean state. Secret-scanning values are removed from the returned payload. Suggested remediation gives investigation steps; it does not claim that a failure is fixed.

## Reviewed changes

The change editor loads source at an exact base commit, provides before/after review, and publishes only after the user's final action. It creates a separate branch and draft pull request. Base movement is rejected, existing generated branches are checked, and retries reuse a matching existing draft. It does not force-push, merge, or apply unsolicited fixes. Workflow templates are starting points whose commands must be reviewed for the selected repository.

## Webhooks

Use the delivery screen's webhook action once the app has a public HTTPS origin. CodeLens creates a secret per repository and configures the matching GitHub hook. The endpoint is:

```text
https://YOUR_HOST/api/v1/integrations/github/webhook/REPOSITORY_ID
```

HMAC signatures and delivery IDs are checked before accepting events. Non-deleted push events index the affected branch; other subscribed events are stored for monitoring. Fork pull-request code is not executed. The screen shows recent accepted deliveries. On a busy or interrupted index, retry syncing the branch manually after the current operation finishes.

The older shared endpoint `/api/v1/integrations/github/webhook` uses the environment's `GITHUB_WEBHOOK_SECRET` and matches the first connected repository with the supplied full name. It exists for compatibility; use repository-specific hooks for account-owned connections.

Deleting a connection removes CodeLens data only. Remove its hook in GitHub settings if deliveries should stop. Disconnecting GitHub clears stored API credentials; the stable GitHub identity remains available for future OAuth sign-in. Revoke the app in GitHub to revoke the authorization there too.

## Verification boundary

Live public branch indexing, workflow/job retrieval and an immutable own-repository comparison were verified against CodeLens's GitHub repository. OAuth exchange, private repository access, draft PR creation and webhook mutations were tested using mocked GitHub responses. A deployed smoke test with your OAuth credentials and a disposable repository is still required before relying on those external write paths.
