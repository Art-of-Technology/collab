# Forge project board

The project dashboard links to `/{workspace}/projects/{project}/board`.
This first slice is read-only: board/list/attention views, filters and issue
details retain existing issue numbers, descriptions and follow-up metadata.
Comments show their source count; comment reading and writes remain pending.

Search matches issue number, title, owner and next action, and combines with
the status filter in every view. Needs attention includes unfinished issues
that are critical, blocked, overdue or due for follow-up today or earlier.
Date comparisons use the Europe/London calendar date at load or refresh.
Select an issue to open its details; use Project notes to reach the existing
Notes view. The existing project dashboard and Notes routes remain available.

The server requires an authenticated active workspace member (or owner), a
project in that workspace, and an exact configured project binding before
opening the credential file or contacting Forge. The browser receives only
projected issue data. Denied initial access returns 404; refresh rechecks access
and clears loaded issues when access is denied.

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
Use a separately authorized application reader; do not reuse dashboard or
issue-writer credentials. Unset configuration shows a connection-not-ready
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
Targeted ESLint and nonincremental TypeScript also passed for this slice.

Earlier implementation browser verification used disposable PostgreSQL,
synthetic identities and a local HTTPS Forge fixture, not live project data.
It checked five status
columns, search, status and attention filters, issue details, refresh failure
with retained data, empty results, and revoked-member 404 with zero upstream
requests. At 320px the page has no horizontal overflow; controls wrap and
bottom padding lets the last card scroll above the existing chat overlay.
Enter opens details, Close receives focus, and Escape restores the originating
card. No Forge requests were issued by the browser. These earlier fixture results
do not establish hydrated UI or revocation acceptance for the current
authorization change.

R10 isolated production-build qualification on source
`33878527e0202c33a8d742db069c364ea37598ef` subsequently passed 30 HTTP and
9 UI checks, including hydrated Board/Notes Refresh, revocation, foreign-tenant
denial and mobile layouts. Native PostgreSQL provenance passed 1 check with
0 skips under the original 60-second timeout. This used synthetic JWT identities
and disconnected Forge; native TLS trust was verified and owned resources were
cleaned up. It establishes this isolated source's qualification, separately
from the earlier fixture evidence, not final integrated production acceptance.

Realtime event delivery after revocation (only admission was checked), live
provider-backed changelog regeneration, real Forge data/publication, real OAuth,
Ready execution and final integrated production acceptance remain unverified.
The nine existing lint warnings (L1–L6: effect/callback dependencies and image
optimization) remain explicitly deferred behavioral followups; no runtime code
or lint rules were changed. Generated API reference drift remains follow-up #473.

Forge-backed Notes publication is documented in the
[project memory guide](forge-project-memory.md).
Live connection, full comments, issue mutations with readback/conflict handling,
agent execution, staging acceptance and replacement cutover remain outstanding.
