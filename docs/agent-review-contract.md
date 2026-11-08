# Identity-bound agent review contract

This API lets the agent holding a handoff ask one registered agent for a
review without releasing the original claim. It records a review receipt; it
does not verify GitHub, approve a pull request, run CI, merge, or deploy.
Before merging, the owner must check the repository, pull request, current
head, required reviews and checks, and any holds against their authoritative
sources. A changed head needs a new review.

The caller needs an app token with `issues:read` and `issues:write` to
change reviews, and `issues:read` to read them. Each caller uses its own
registered agent and current issue access. Both the owner and reviewer must
currently have access when the review is requested. Review text is visible to
those two registration IDs, and is not copied into issue activity. Deleting a
reviewer registration does not let a replacement with the same name read or
answer its reviews; the owner can cancel the request and choose another.

## Request and response

The original owner sends `POST /api/apps/auth/agents/reviews` with
`agent`, `handoffId`, `reviewerAgentId`, a UUID `requestId`,
`repository` as `owner/repo`, a positive integer `pullRequestNumber`, the
exact lowercase 40- or 64-character commit `revision`, and `content`.
Managed agents must also supply their current worker `generation`. The
request content is required and is limited to 16,000 characters. The
repository must match the project's configured repository when one exists;
the submitted name alone is not proof of the actual GitHub repository or head.
Reusing the same request ID with the same data returns the existing request;
reusing it with different data fails. A different request for a handoff that
already has an active review fails with `review_already_active`; read that
review before taking further action. An existing pending transfer offer blocks
review creation with `transfer_offer_pending` until it is accepted or cancelled.
Conversely, an active review blocks a new transfer offer with
`review_already_active`; resolve or cancel the review before offering the handoff.
It also blocks the current owner from completing, releasing, superseding or
passing on the claimed handoff with the same 409 response. Resolve or cancel
the review before changing the claim.

The reviewer discovers requests using
`GET /api/apps/auth/agents/reviews?agent=NAME&view=incoming-v1`, follows
`nextCursor` when present, and reads one with
`GET /api/apps/auth/agents/reviews/ID?agent=NAME`. Use the usual workspace
selection parameter. The incoming view filters to this reviewer's pending or
claimed requests on currently accessible issues and the response acknowledges
`view: incoming-v1`. It returns `items` and `nextCursor`; `limit` defaults to 20
and accepts 1–50. Pass the opaque cursor as `cursor` with the same workspace,
agent and view. Pages are ordered by creation time and ID, but are not a snapshot;
start a new pass without a cursor to find earlier requests that became eligible.
The API returns review details to the authorized reviewer; the CLI's `reviews wait`
output limits results to IDs and statuses. The reviewer sends `PATCH` to that review with
`{ "agent": "NAME", "action": "claim" }`, then sends another `PATCH`
with `action: "reply"`, `verdict` as `approved`, `changes_requested`
or `blocked`, the exact `reviewedRevision`, and nonempty `content` of
at most 16,000 characters. Managed-agent mutations also require the current
generation. A mismatched revision or a response from another agent is rejected.

The owner can set a hold with `action: "hold"` and a nonempty `reason`;
clearing it is a separate `release_hold` action. Both actions require
`expectedHoldVersion` equal to the version most recently read. A change
increments the version. If a response is lost or the version is stale, read
the review again and reconcile the outcome before choosing another action;
never retry an old hold or release using a newer version. After an approval for the
exact revision and with no hold, the owner may use `resolve` to acknowledge
the receipt and remove the review guard. This does not complete the original
handoff or authorize a merge. The owner can instead use `cancel` with a
nonempty reason after explicitly clearing any hold; cancellation also leaves
the original handoff claimed. A cancelled or blocked request is not approval;
after a blocked reply, the owner must cancel the active review before requesting
another review after corrections.
Include `agent` and, for managed agents, `generation` in each mutation.

The review endpoints are separate from name-addressed handoffs. When the
matching CLI and server release are installed, manual agents can use
`collab reviews request`, `list`, `get`, `wait`, `claim`, `reply`, `hold`,
`release-hold`, `cancel` and `resolve`; see the [agent skill](../packages/cli/skills/collab-agents/SKILL.md#request-an-identity-bound-review)
for the command sequence. Check `collab schema` for installed commands.
Older clients cannot discover these requests; lack of a response must not be
treated as approval or as permission to re-execute a task. The manual commands
do not expose managed-worker generation credentials, and coordinator dispatch
for this contract is not implemented. Workers
bound to a coordinator cannot mutate these reviews, even with a live worker
generation; they remain fenced until coordinator admission is implemented.

## Rollout prerequisite

Apply and verify the database migration before enabling review traffic. Writes
check the installed guards and fail closed when they differ from the expected
definitions; exact catalog rendering must be validated on every supported
PostgreSQL version. A database owner can replace a trigger function while a
request is in flight despite the table locks. The deployment process must
therefore stop and drain all affected writers, including indirect cascade
deletes, while privileged DDL is applied, then verify the guards before
resuming. Enforce that boundary for the initial rollout and every later
privileged DDL change; preventing reconnects must be verified, not assumed.
That operational serialization has not yet been implemented or verified; this
candidate is not ready for production.

## Runtime database privileges

The migration creates `AgentReviewRequest` as the migration executor. The
application and other writers may use different database roles, and privileges
on old tables do not automatically grant access to this new table. The new
triggers run with the caller's privileges: if the runtime cannot read the new table,
existing handoff status changes, transfer offers and agent deletions can fail
even before any agent uses reviews.

This is a mandatory release gate, not a permission to deploy. Under one
controlled rollout window, stop and drain all affected writers, including
review, handoff, transfer and agent registration changes and indirect cascade
deletes. Identify the exact migration executor and inventory every effective
database writer role from its actual connection, including app replicas, old
workers, legacy clients and authorized maintenance jobs. Take the required
backup. Confirm the migration connection resolves unqualified objects into
`public`, apply the reviewed migration, and verify the new table is
`public."AgentReviewRequest"`. Grant each writer role only the privileges its
paths need, and verify every role and the guards before any writer resumes.
The migration has its own `BEGIN` and `COMMIT`, so migration and separately issued grant are not one SQL
transaction. The drain must remain in force across both commits and all
verification. If any step fails or a writer identity or inventory is
uncertain, keep the writers stopped and reconcile the rollout rather than
assuming access.

When a grant is needed, the table owner or an authorized grantor can issue this
for each independently verified review-API writer role, with psql's
identifier-quoted variable `runtime_role` set to that role. In an interactive
psql session, use this recipe only if the verified role matches the ASCII
allowlist `[A-Za-z_][A-Za-z0-9_]{0,62}` exactly. Stop and use a separately
reviewed quoting method for any other role name. Replace the example value
with the verified allowed role, then run:

```sql
\set ON_ERROR_STOP on
\set runtime_role verified_role_name
GRANT SELECT, INSERT, UPDATE ON TABLE public."AgentReviewRequest" TO :"runtime_role";
```

Grant by capability, not by application label:

- A role changing handoff claims or creating pending transfers needs `SELECT`
  on the review table for the corresponding guards. A pending transfer also
  locks the parent handoff: the role needs `SELECT` and `UPDATE` on at least
  one column of `AgentHandoff`, plus its normal transfer-write privileges.
- A role directly deleting agent registrations needs `SELECT` and, when an
  owned review is active, `UPDATE` to cancel it. The active-review path also
  locks the parent handoff and needs `SELECT` and `UPDATE` on at least one
  `AgentHandoff` column. Indirect cascades may have different privilege
  behavior; test each actual deletion path and role.
- A role creating and mutating reviews needs `SELECT`, `INSERT` and `UPDATE`.

Use the same identifier-quoted command with the privileges each verified role
needs. Never substitute roles inferred from historic evidence.

Connect as each actual writer and confirm its effective principal and required
privileges, including inherited privileges, before resuming. For a review-API
writer, schema USAGE and the three required table privileges must be true:

```sql
SELECT current_user, session_user,
       effective_principal.rolsuper AS current_is_superuser,
       login_principal.rolsuper AS login_is_superuser,
       effective_principal.rolcreaterole AS current_can_create_roles,
       login_principal.rolcreaterole AS login_can_create_roles,
       pg_get_userbyid(review_table.relowner) AS table_owner,
       pg_has_role(current_user, review_table.relowner, 'MEMBER') AS current_owner_member,
       pg_has_role(session_user, review_table.relowner, 'MEMBER') AS login_owner_member,
       has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
       has_table_privilege(current_user, review_table.oid, 'SELECT') AS can_read,
       has_table_privilege(current_user, review_table.oid, 'INSERT') AS can_insert,
       has_table_privilege(current_user, review_table.oid, 'UPDATE') AS can_update,
       has_table_privilege(current_user, review_table.oid, 'DELETE') AS can_delete,
       has_table_privilege(current_user, review_table.oid, 'TRUNCATE') AS can_truncate,
       has_any_column_privilege(current_user, review_table.oid, 'REFERENCES') AS can_reference,
       has_table_privilege(current_user, review_table.oid, 'TRIGGER') AS can_trigger,
       EXISTS (
         SELECT 1 FROM pg_roles candidate
         WHERE (pg_has_role(current_user, candidate.oid, 'MEMBER')
             OR pg_has_role(session_user, candidate.oid, 'MEMBER'))
           AND (candidate.rolsuper OR candidate.rolcreaterole
             OR pg_has_role(candidate.oid, review_table.relowner, 'MEMBER')
             OR has_table_privilege(candidate.oid, review_table.oid, 'DELETE')
             OR has_table_privilege(candidate.oid, review_table.oid, 'TRUNCATE')
             OR has_any_column_privilege(candidate.oid, review_table.oid, 'REFERENCES')
             OR has_table_privilege(candidate.oid, review_table.oid, 'TRIGGER'))
       ) AS unsafe_member_role
FROM pg_class review_table
JOIN pg_roles effective_principal ON effective_principal.rolname = current_user
JOIN pg_roles login_principal ON login_principal.rolname = session_user
WHERE review_table.oid = to_regclass('public."AgentReviewRequest"');
```

Verify schema USAGE and the required permissions for each role; a review API
writer needs the three listed table privileges. Handoff and transfer writers
need at least `can_read`; direct registration deletion also needs `can_update`
when the agent owns an active review. Exactly one row must be returned. Neither
the login nor current role may be superuser, hold CREATEROLE, or be a member
of the table-owner role. `unsafe_member_role` must be false: the conservative
membership scan includes NOINHERIT roles and roles with ADMIN options even
when SET is initially disabled. Effective DELETE, TRUNCATE, column REFERENCES
and TRIGGER privileges must be absent, including privileges inherited through
PUBLIC or other roles. Do
not revoke broader existing privileges without a separately reviewed plan;
keep the rollout held while they are reconciled. Verify a
bounded synthetic handoff, transfer and review flow under the respective writer
identities in an isolated or otherwise safely admitted target, including the
review guard; do not use real active work as a probe.
Review admission reads and locks rows in `User`, `Workspace`, `WorkspaceMember`,
`Issue`, `Project`, `ProjectStatus`, `AgentRegistration` and `AgentHandoff`;
request creation also locks `Repository` rows. The guard reads
`AgentTransferOffer` and performs a no-op update of the handoff timestamp.
Verify the runtime has `SELECT` and column-level `UPDATE` rights needed to
acquire each row lock, plus `UPDATE` on `AgentHandoff.updatedAt` and the other
existing-table privileges required by the real flow. Privilege checks on the new
table alone do not prove old-table privileges, function permissions, live
connection settings or guard behavior are correct.
Every review mutation also takes `ROW EXCLUSIVE` table locks on
`AgentReviewRequest`, `AgentHandoff`, `AgentTransferOffer` and
`AgentRegistration`. On each table, the actual review writer must already have
an appropriate table-level write privilege for that lock; column-level UPDATE
alone is insufficient. Check the effective role under the supported PostgreSQL
version, including inherited rights. For example, the following checks for
table-level INSERT, UPDATE, DELETE or TRUNCATE; a `false` result or missing
table is a rollout blocker:

```sql
SELECT table_name,
       COALESCE(has_table_privilege(current_user, to_regclass(format('public.%I', table_name)), 'INSERT')
         OR has_table_privilege(current_user, to_regclass(format('public.%I', table_name)), 'UPDATE')
         OR has_table_privilege(current_user, to_regclass(format('public.%I', table_name)), 'DELETE')
         OR has_table_privilege(current_user, to_regclass(format('public.%I', table_name)), 'TRUNCATE'), false) AS can_lock
FROM unnest(ARRAY['AgentReviewRequest', 'AgentHandoff', 'AgentTransferOffer', 'AgentRegistration']) AS tables(table_name);
```

Do not grant broader existing-table write privileges merely to pass this check;
review their operational scope and security implications first. This check does
not replace the excess-privilege restrictions on the new review table above.
This table-privilege readback is necessary but does not establish guard DDL
safety. Separately inventory and qualify trusted schema and function owners,
role administrators, powerful built-in roles, security-definer routines,
proxy identities, and any other means to alter guard functions or assume
privileged roles. Prove the affected-writer drain and no-reconnect boundary is
enforced during this rollout and every later privileged DDL change; verify
supported PostgreSQL catalog definitions before resuming. Preserve the stop
until every release prerequisite passes.
`db push` does not apply this migration or its triggers and is not a supported
rollout or upgrade path.
