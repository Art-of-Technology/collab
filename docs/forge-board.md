# Forge project board

The project dashboard links to `/{workspace}/projects/{project}/board`.
Board/list/attention views, filters and issue details retain existing issue
numbers, descriptions and follow-up metadata. For issue creation, editing and
comments, see the [issue actions guide](forge-issue-actions.md).

Search matches issue number, title, owner and next action, and combines with
the status filter in every view. Needs attention includes unfinished issues
that are critical, blocked, overdue or due for follow-up today or earlier.
Date comparisons use the Europe/London calendar date at load or refresh.
Select an issue to open its details; use Project notes to reach the existing
Notes view. The existing project dashboard and Notes routes remain available.

The board loader requires an authenticated active workspace member (or owner),
`VIEW_TASKS` permission and a project in that workspace before reading connection
configuration. An exact configured project binding is required before opening
the credential file or contacting Forge. The board receives projected issue data;
the [issue actions guide](forge-issue-actions.md) covers issue detail reads and
writes. Denied initial access returns 404; refresh rechecks access and clears
loaded issues when access is denied.

Set `COLLAB_FORGE_CONFIG_FILE` to an operator-managed JSON file outside Git:

```json
{
  "origin": "https://forge.example.test",
  "bindings": [{
    "workspaceId": "example-workspace",
    "projectId": "example-project",
    "repositoryId": 123,
    "owner": "example",
    "repository": "project",
    "slackWorkspaceId": "TEXAMPLE",
    "slackChannelId": "CEXAMPLE",
    "readTokenFile": "/run/secrets/collab-forge-reader"
  }]
}
```

These are illustrative values, not deployment instructions. Verify immutable
Slack workspace/channel and Forge repository identities before activation.
The [legacy write contract](forge-legacy-write-guard.md) owns write restrictions
and activation prerequisites for configured projects.
Use a separately authorized application reader; do not reuse dashboard
credentials. The [project memory connection contract](forge-project-memory.md#connection-and-limits)
owns the integrated reader/issue-token and isolated Notes-writer boundaries.
Unset configuration shows a connection-not-ready
state. No database migration or automatic issue creation is performed.

Reads verify repository ID before pagination, reject redirects, use a shared
15-second deadline and 2 MiB per-response limit, and cap the view at 1,000
records with an explicit partial-results warning. Failed refreshes retain
previous data with a stale warning; initial failures never resemble emptiness.
Descriptions and task metadata are projected in full within that response
limit; oversized responses fail explicitly instead of returning shortened data.

## Validation

Run `node --test tests/security/forge-*.test.cjs` for executable checks
covering projection, tenant denial, configuration and bounded upstream reads.
Targeted ESLint and nonincremental TypeScript passed for the original read-only
slice; these are historical results, not integrated-release acceptance.

Historical browser verification of the original read-only slice used disposable
PostgreSQL, synthetic identities and a local HTTPS Forge fixture, not live
project data. It checked five status
columns, search, status and attention filters, issue details, refresh failure
with retained data, empty results, and revoked-member 404 with zero upstream
requests. At 320px the page had no horizontal overflow; controls wrapped and
bottom padding let the last card scroll above the then-existing chat overlay.
Enter opened details, Close received focus, and Escape restored the originating
card. No Forge requests were issued by the browser.

Forge-backed Notes publication is documented in the
[project memory guide](forge-project-memory.md).
Live connection, agent execution, staging acceptance and replacement cutover
remain outstanding. See the [issue actions guide](forge-issue-actions.md) for
the required pre-activation write guard.
