# Forge issue and comment actions

The connected project board supports issue creation, title/description editing,
channel-task status/priority/owner/date/next-action updates, close/reopen, comment
reading and posting, and editing comments owned by the configured shared Forge
writer. It never offers labels, native assignees, repository settings or code
writes. Owner is existing channel-task display metadata, not a Forge assignee.
Clearing Owner leaves the board unassigned without changing the native assignee;
the board falls back to the native assignee only when no string owner is stored.

Every action validates its exact typed payload and checks the
[board access requirements](forge-board.md) and field-specific permissions
before loading connection metadata or credentials. Issue creation requires
CREATE_TASK. Issue editing requires the corresponding EDIT_ANY_TASK, CHANGE_TASK_STATUS or ASSIGN_TASK grant. Comment
creation uses COMMENT_ON_TASK; shared-account comment edits require
EDIT_ANY_COMMENT and the configured immutable Forge author ID. Self-only grants
are not treated as ownership of the shared provider account. This does not
claim individual Forge authorship.

The optional server-only binding `issues` object contains `writeTokenFile`,
`principalId` and `tokenSha256`. A private operator must verify issuance under the
intended account and bind the new scoped token's fingerprint to its immutable
principal ID. No self-enrollment or reuse of existing dashboard credentials is
performed. The token digest is checked in constant time before any remote call;
the immutable repository ID is then checked. Forge authenticates every request.
The restricted repository token cannot call `/user`; no extra user scope is
requested. Keep the fingerprint and credential file in protected configuration,
never browser data or public reports. Rotating tokens requires a newly verified
binding. Real credential setup and activation remain outstanding.

Edits fetch the complete raw issue, compare its content fingerprint with the
reviewed version and preserve unknown channel-task metadata and untouched human
text outside the block. Malformed or multiple task blocks disable edits pending
source review. Explicit description edits replace the human description while
retaining the metadata block. Human descriptions in create/edit requests cannot
contain `channel-task` blocks; use the individually authorized task fields instead.
Comment reads are capped at 1,000 with a partial-results warning.
Closing uses native state only and does not rewrite the body. Comments do not rewrite the issue body.

Forge issue/comment PATCH does not provide atomic client compare-and-swap.
Preflight detects already-stale reads; an external edit between preflight and
PATCH remains possible. This limitation is not represented as an atomic lock.
Every accepted write requires a fresh readback. Lost POST responses are uncertain
and are never automatically retried. Reload and inspect the source before
retrying to avoid duplicate creation. Pending forms are disabled. Conflict
reloads retain only dirty fields, refresh untouched fields and require explicit
review for overlapping edits. Expand **Current source text for comparison** to
review the latest title, native open/closed state and body before acknowledging
an overlap. A missing comment edit never becomes a new post.

Project routes retain their existing navigation and layout. Server-side legacy
connected-project write protection
remains a separate pending slice and is required before activation.

Local checks: `node --test tests/security/forge-issue-*.test.cjs` exercises raw
content preservation, malformed blocks, wrong-token rejection before remote
calls, repository mismatch, stale edits, own/other comments, lost responses,
readback and field-specific tenant authorization. Historical retained-branch Next/Postgres and
HTTPS Forge fixtures exercised pending-form locking, stale-save retention,
external-owner preservation on reload, creation/readback, and a single persisted
comment after a lost response. Both forms retained unrelated drafts, repeated
reloads preserved overlap review, missing comments were not reposted, and revoked
access cleared the issue/board with zero Forge calls. The 320px browser layout had
no horizontal overflow or browser-to-Forge requests. Those historical runs do not qualify this integrated release. Synthetic gateway headers are not native OIDC proof. Production
Forge credentials, runtime isolation and rollout are separate acceptance gates.
