# Agent handoffs

Collab coordinates external agent sessions and dedicated managed workers. A name identifies an agent owned by a workspace user; subscriptions contain existing workspace label IDs. Matching agents receive the same durable request, but only one can claim it. Labels route work without granting access to the issue. Agents retain the authenticated user's current workspace/issue permissions.

## API foundation

All routes are under `/api/apps/auth/agents` and use the existing OAuth bearer token and workspace selector:

| Route | Behavior | Required scopes |
| --- | --- | --- |
| `GET /` | List up to 200 agents with label subscriptions, bindings and reported watcher or managed-worker health | `issues:read` |
| `GET /worker?agent=NAME` | Read one exact agent owned by the current user and workspace for managed recovery | `issues:read` |
| `POST /worker` | Configure or report a managed run using [`workerSchema`](../src/lib/agent-handoffs.ts); see [managed workers](#managed-workers) | `issues:write`; `configure` also requires `workspace:write`, `issues:read` |
| `GET /coordinator?project=ID` | Page visible open and claimed project handoffs and relevant worker health; optional `cursor` and repeated `route` parameters | `issues:read`, `projects:read` |
| `POST /coordinator` | Acquire, renew, close or reconcile a project coordinator lease using [`coordinatorSchema`](../src/lib/project-coordinator.ts) | `workspace:write`, `issues:read`, `issues:write`, `projects:read` |
| `POST /` | Register/update your own manual agent using [`registrationSchema`](../src/lib/agent-handoffs.ts) | `workspace:write`, `issues:read` |
| `POST /heartbeat` | Report a manual agent's bound watcher start, poll, callback success, stop or error | `issues:read` |
| `GET /inbox?agent=NAME&state=unseen` | Page through an owned agent's unseen or claimed requests using [`inboxSchema`](../src/lib/agent-handoffs.ts) | `issues:read` |
| `POST /handoffs` | Send using [`sendSchema`](../src/lib/agent-handoffs.ts), including the current generation for a managed sender | `issues:read`, `issues:write` |
| `GET /handoffs/ID?agent=NAME` | Retrieve an authorized handoff and current context commands | `issues:read` |
| `PATCH /handoffs/ID` | Apply a handoff action using [`actionSchema`](../src/lib/agent-handoffs.ts); see the actions below | `issues:read`; work actions also require `issues:write` |
| `GET /transfer-offers` | Page pending or accepted manual transfer offers visible to the named owned agent; the workspace owner can inspect offers on accessible issues | `issues:read` |
| `POST /transfer-offers` | Offer a claimed handoff to one named manual agent with an idempotent request UUID | `issues:read`, `issues:write` |
| `PATCH /transfer-offers/ID` | Accept or cancel a manual offer | `issues:read`, `issues:write` |

Agent names start with a lowercase letter or digit and use lowercase letters, digits, hyphens and underscores (1–64 characters). Named recipients must be registered. Handoff content is bounded to 16,000 characters; request bodies to 64 KiB. A caller-supplied UUID `requestId` makes sequential retries return the original request and rejects changed payloads. Concurrent duplicate creation returns 409; retry with the same UUID. Returned context commands bind `--workspace` to the authorized handoff workspace. They do not grant their required scopes: project Notes still need `context:read`.

Actions:

- `seen` removes the request from this agent's unseen inbox. It does not accept ownership.
- `ack` optionally acknowledges receipt and marks it seen. ACK is not required to claim work.
- `claim` atomically changes an open request to claimed. Another claimant receives 409.
- `progress` records an update from the current claimant; `content` is required.
- `release` requires a reason, opens the request again, and clears delivery receipts so subscribers see it again.
- `complete` requires a result and closes the request. It does not change the issue's status.
- `supersede` requires a reason and `replacementId` referring to another open, claimed or completed handoff on the same issue that the acting agent can read. Only the original sender of still-open work or its current claimant can close it. It never takes another agent's claim. The old request leaves actionable inboxes, retains its contents, and links the replacement. A retry with the same replacement does not duplicate history; simultaneous replacements cannot create cycles.

`state=claimed` recovers this agent's unfinished claims, including those it previously marked seen. Only `unseen` (the default) and `claimed` are supported. Polling never acknowledges work automatically. Marking an entry seen removes it from `unseen`; requests claimed or completed by another agent can still appear until marked seen. Completing, releasing or passing work onward removes it from `claimed`; marking it seen does not.

Both modes return `items`, `agent`, `hasMore` and `nextCursor`, ordered by `createdAt` ascending, then `id` ascending for tied timestamps. Pass a returned `nextCursor` as the `cursor` query parameter to read later entries without changing their state. The final page has `hasMore: false` and `nextCursor: null`. Query bounds are defined by `inboxSchema` above.

A cursor binds the workspace, agent identity and queue state to the last returned position. Ownership, current workspace/issue access and queue membership are checked on every request. Deleting or changing the cursor's handoff does not invalidate its position. Pages reflect current data, not a snapshot; start again without a cursor to discover entries that become eligible at or before a previous position.

Deploy the matching server before using pagination. Older clients can omit `cursor` and ignore the additive `nextCursor` field. Older servers reject `cursor` and may return `hasMore: true` without `nextCursor`. Consumers needing all pages must report that unsupported server instead of treating the first page as complete or retrying without the cursor.

To pass work onward, send a new request with `afterId` referencing a request currently claimed by the sender on the same issue. The previous request is completed and the next one created in one transaction. The new request remains open until a recipient claims it; sending does not grant ownership to that recipient.

### Transfers that retain ownership until acceptance

For manual agents, use a transfer offer when the current owner must remain
accountable until the recipient accepts. The sender first stops or reconciles
any active work and records the outcome. The recipient must independently verify
the current state before acting. For deployments, this does not establish that a
previous process stopped or replace the target's deployment lock.

```sh
collab transfers offer --agent owner --handoff-id CLAIMED_ID --to-agent peer \
  --request-id UUID --content 'Stopped; candidate, checks and next action' --workspace WORKSPACE_ID
collab transfers list --agent peer --workspace WORKSPACE_ID
collab transfers accept OFFER_ID --agent peer --workspace WORKSPACE_ID
```

Use a fresh UUID for each offer and retain it for exact retries. An offer is not
placed in the managed-worker inbox and does not wake or run an agent. The sender
keeps the original claim until the named recipient accepts; acceptance closes
the original and creates the recipient's already-claimed successor atomically.
Transfer lists default to pending offers; use `--status accepted` for accepted
offers. A pagination cursor is bound to the workspace, agent and status, so use
it only with the same status. Pages reflect current data rather than a snapshot.
Offer text is excluded from shared issue activity and search. The successor
contains an offer reference, not the private text. The sender,
recipient and workspace owner can retrieve accepted offer text with
`collab transfers list --agent NAME --status accepted --workspace WORKSPACE_ID`.
The recipient can also retry acceptance with the same offer ID after a lost response.
Accept and cancel retries retain the response fields and offer identity. Acceptance
returns the existing successor with its current status and owner; both actions
return the current issue details, rather than a snapshot of the original response.
The sender, recipient or authenticated workspace owner may cancel a pending
offer; cancellation leaves the original claim intact. If access is revoked,
the workspace owner can list and cancel the offer without taking ownership.
The sender must resolve or cancel a pending offer before releasing, completing,
or passing its claim through the legacy path. A current server reports
`transfer_offer_pending`; an older server may report a generic error. Deleting a
claimant with a pending offer is blocked until the offer is cancelled; do not
infer a stopped process from cancellation or account removal.

The database migration installs the guards before a new server creates offers.
Transfer successors cannot be claimed by managed workers, including through older
servers; workers must not run without these guards. The migration refuses existing
managed claims on transfer successors until they are resolved.
All server replicas and the database must be qualified before use. Drain writers
and managed workers, resolve transfer successors and cancel pending offers before
removing either guard or rolling back schema.
Legacy `afterId` behavior remains available and does not retain custody until
acceptance, so adopting offers alone does not enforce the rule for older clients.
Managed workers do not participate in this manual protocol.

## Current identities and watcher health

For manual agents, use one stable agent name across restarts. Register a human-readable host identifier and the actual agent session identifier together; do not use credentials, user data or task text in either field. One workspace user cannot bind multiple names to the same host/session pair. Existing names without a binding remain compatible and are displayed as unbound. Registration without these fields preserves an existing binding. Registration still replaces the complete label subscription list. Managed identities use the lifecycle below instead of registration or watcher heartbeats.

The same name can bind a replacement session after its current watcher stops or becomes stale. Active watcher bindings refuse takeover. Rebinding clears old health so a prior session's success cannot look like current-session evidence. Never reuse a name belonging to another active agent. Host/session fields describe an owner's declared runtime; they are not new authentication credentials or proof of machine identity.

CLI 0.6.0 `inbox watch --host HOST --session-id SESSION_ID` reports health against that exact registration. Each watch window has its own UUID; the server accepts one fresh watcher per agent, rejects competing watchers, and rejects subsequent reports from an old watcher after replacement. Heartbeat timestamps are server-generated. `agents list` and the web Agent inbox expose host/session, running/stale/stopped/error status, last successful inbox poll, and last successful wake callback. `agents list` also returns heartbeat time and a bounded error code. No heartbeat for five minutes makes running health stale; it does not prove the process exited. `stopped` records normal window expiry or cancellation; `error` records a reported operational failure. Agents with no health reports show no reported health, not healthy or connected. Watchers without health flags leave any prior reports unchanged.

`lastWakeAt` means the local callback exited successfully after host acceptance. It does **not** prove a model turn or completed work. Verify those through the handoff's claim, progress and reply. No callback success is recorded on timeout, cancellation or failure. Health report bodies contain no token, task content, callback arguments or raw error text. Health failures stop a reporting watcher; an error while recording a prior failure never replaces that original error. If the server is unavailable at shutdown, the last running report becomes stale.

The heartbeat body is `{agent, host, sessionId, watcherId, event, errorCode?}`; events are `started`, `poll`, `wake`, `stopped`, `error`, with `errorCode` required for `error` and forbidden for other events. Only the owning user can report, and the exact host/session must already be registered. The CLI manages this lifecycle; do not manually report success on behalf of a watcher.

## Managed workers

The daemon manages `POST /worker` for its owning user, workspace and exact saved
host/session binding. `configure` creates a managed registration or updates a closed
one without changing its host/session identity. Converting a manual registration
requires explicit `convert: true`, no running watcher and no claimed manual work.
Omitted labels preserve subscriptions; supplied labels replace the full list.
Legacy registration and watcher heartbeats refuse managed agents with `managed_agent`.
For setup and operator recovery, use the [worker guide](../packages/cli/README.md#dedicated-managed-workers-cli-070).

`start` admits a fresh generation UUID only after the prior run is closed. A retry
of the active generation returns its existing state. `renew` requires that exact,
open generation and an unexpired server lease; accepted starts and renewals grant
a 60-second lease. `close` requires the matching generation, including after expiry,
and is safe to repeat. Neither expiry nor a closed generation permits revival by
renewal. Expiry alone does not prove child closure or permit another run to take over.

Managed send and action requests must include the current `generation`, including
pass, seen, ACK and supersession as well as claim, progress, release and completion.
Missing, stale, closed or expired generations fail with `worker_fenced`; there is no
name-only fallback. Manual agents retain their existing semantics and reject a
supplied generation with `worker_not_managed`. These fences preserve the existing
owner, workspace, scope and issue-access checks.

Agent reads expose a `worker` health object, or null for manual agents. The exact
owned lookup returns `{agent}`; lifecycle reports return `{worker}`. Health includes
generation, closure, server heartbeat/lease, reported state and usage. `online`
means the generation is open with an unexpired lease; `working` additionally
requires the daemon's reported working state. Neither flag proves task completion.
The web inbox displays these worker states and estimated/reserved/unknown usage;
watcher poll and callback timestamps remain separate manual-session evidence.

## Timeline

Agent-authored timeline entries record `AGENT_SENT`, `AGENT_CLAIM`, `AGENT_PROGRESS`, `AGENT_RELEASE`, `AGENT_PASSED`, `AGENT_COMPLETE`, `AGENT_SUPERSEDED` and optional `AGENT_ACKNOWLEDGED`. Each contains the agent ID/name, handoff ID, timestamp, user attribution and supplied result/context. State transitions and their history commit together. No notification claims that an agent has accepted work before a successful claim. For entries created by issue edits, see [Automatic label delivery](#automatic-label-delivery).

## Web inbox

Open **Agent inbox** in the workspace sidebar to inspect all agents registered in the current workspace, including those owned by other members. **All agents** is selected by default and combines matching handoffs without duplicating requests sent to several recipients. A handoff remains in the combined Unseen queue while at least one matching agent with current issue access has not marked it seen. Select an individual agent and Unseen or Claimed work, then refresh. The page is read-only: it never marks, acknowledges, claims or completes work. Agents make those transitions through the CLI; issue links open the shared timeline. Each queue shows at most 50 entries. Mark handled unseen entries as seen, or finish/release claimed work, to advance. Both the viewer and receiving agent must currently have issue access. The CLI still requires ownership to read or act as an agent; the web monitor does not grant that ownership. An empty queue means no matching handoffs, not a missing inbox: registration alone does not create jobs or start an inbox listener.

Handoff details render Markdown headings, bold text, lists, links, inline code and fenced code blocks. HTML is sanitized before display, images have no click-to-open viewer, and the stored handoff text is unchanged.

For the inbox's **Organisation floor** view, see [Organisation agent floor](agent-organisation-floor.md).

## CLI and skill

For CLI availability and bounded inbox waits, see [Agent coordination](../packages/cli/README.md#agent-coordination). The [packaged skill](../packages/cli/skills/collab-agents/SKILL.md) owns the agent workflow and handoff-writing guidance.

## Automatic label delivery

Adding one or more subscribed labels in a single issue edit creates one durable `label_added` handoff for those newly added labels. This includes labels supplied during issue creation through the web or CLI API. All matching role subscribers can see it subject to current issue access; exactly one can claim it. Registration opts an agent into automatic delivery for its label IDs. Ordinary labels with no subscribers create no handoff. Issue labels must belong to the issue workspace; a foreign-workspace label aborts the whole write.

The issue edit, handoff and `AGENT_LABEL_ADDED` timeline entry commit in one transaction. The entry identifies the user who edited the issue and includes the handoff ID, routed label IDs and generated context; it has no sending agent. An unchanged save does not notify again. Concurrent updates either serialize or return a conflict; reload before retrying. Removing a label does not cancel existing handoffs or revoke a claim. Removing then re-adding it creates a new handoff, so read the timeline before starting duplicate work. Label renames, mentions and historical issue backfills are not triggers.

Delivery persists while agents are offline. Inbox retrieval and claims still require the agent owner's current issue access. Inbox creation itself does not wake a model: a [dedicated worker](../packages/cli/README.md#dedicated-managed-workers-cli-070) must be running, or an existing session's host must provide and verify an adapter under the [CLI wake callback contract](../packages/cli/README.md#wake-a-running-agent-through-its-host). Label delivery needs only the original agent-handoff tables; current identity/health and supersession additionally require the agent-operations migration.

## Validation and rollout

`node --test tests/agents/handoffs.test.cjs` starts a socket-only disposable PostgreSQL instance, applies the additive migration to existing fixture data, exercises concurrent claims and ACKs, and checks scope/tenant isolation and the named-agent timeline. Label-delivery coverage includes rollback, unchanged and concurrent edits, removal/re-addition, unsubscribed labels, and creation through the transaction helper; it also exercises the web mutation helper and CLI update route. It requires local PostgreSQL binaries and the generated Prisma client; it never uses the application's `DATABASE_URL`.

`node --test tests/agents/handoff-supersession.test.cjs` uses a disposable PostgreSQL database with the production Prisma visibility guard to cover replacement links, ownership refusal, retries and concurrent cycle prevention. It requires the same local prerequisites and does not exercise HTTP routes.

Deployment requires the additive `20261017000100_agent_handoffs` migration before exposing these routes. It creates three new tables and their indexes/foreign keys; it does not rewrite existing records. Application rollout and any production migration remain with the designated application owner. No production acceptance is implied by source tests.

CLI 0.6.0 identity/health/supersession requires `20261026000100_agent_operations` before deploying the matching app. The additive migration adds nullable fields and a unique host/session binding index; legacy unbound rows and handoffs are preserved. Verify the target database and ledger, take and inspect a fresh private backup with an off-host copy, then use the established migration path. A database without a Prisma migration ledger must receive only this reviewed SQL, never an unqualified replay of history or `db push`. Keep the columns and index if reverting the app image. See [empty-database bootstrap](database-bootstrap.md) only for a new, empty database.

Older server images can expose superseded rows to older watchers after rollback. Keep the additive schema and prefer a compatible forward repair.

CLI 0.7.0 workers require the matching server and additive
`20261027000100_managed_workers` migration, which adds nullable
`AgentRegistration.managedWorker` JSONB and leaves manual registrations unchanged.
Apply the same target, ledger and protected-backup requirements above. Retaining
the column alone is insufficient for safe worker operation after an app rollback:
an older server does not enforce managed generations. Stop workers before reverting
to such a server. See the [worker guide](../packages/cli/README.md#dedicated-managed-workers-cli-070)
for CLI operation and release qualification boundaries.

CLI 0.8.0 project coordinators require the matching server and additive
`20261029000100_project_coordinator` migration, which adds nullable
`Project.coordinator` JSONB. Apply the same target, ledger and protected-backup
requirements above. See the [coordinator guide](../packages/cli/README.md#project-coordinator-cli-080)
for operation and release qualification boundaries.

Manual transfer offers require the matching server and additive
`20261030000200_agent_transfer_offer` migration, including its pending-offer
guard. Apply the same target, ledger and protected-backup requirements above.
For fresh databases, see [empty-database bootstrap](database-bootstrap.md).
