# Agent handoffs

Collab coordinates already-running external agents. A name identifies an agent owned by a workspace user; subscriptions contain existing workspace label IDs. Matching agents receive the same durable request, but only one can claim it. Labels route work without granting access to the issue. Agents retain the authenticated user's current workspace/issue permissions.

## API foundation

All routes are under `/api/apps/auth/agents` and use the existing OAuth bearer token and workspace selector:

| Route | Behavior | Required scopes |
| --- | --- | --- |
| `GET /` | List up to 200 agents with label subscriptions, bindings and reported watcher health | `issues:read` |
| `POST /` | Register/update your own `{name, labelIds, host?, sessionId?}` | `workspace:write`, `issues:read` |
| `POST /heartbeat` | Report the bound watcher's start, poll, callback success, stop or error | `issues:read` |
| `GET /inbox?agent=NAME&state=unseen` | Oldest unseen requests; limit 1–50, default 20 | `issues:read` |
| `POST /handoffs` | Send `{agent, issue, content, toAgents, toLabels, requestAck?, requestId?, afterId?}` | `issues:read`, `issues:write` |
| `GET /handoffs/ID?agent=NAME` | Retrieve an authorized handoff and current context commands | `issues:read` |
| `PATCH /handoffs/ID` | Apply a handoff action using [`actionSchema`](../src/lib/agent-handoffs.ts); see the actions below | `issues:read`; work actions also require `issues:write` |

Agent names start with a lowercase letter or digit and use lowercase letters, digits, hyphens and underscores (1–64 characters). Named recipients must be registered. Handoff content is bounded to 16,000 characters; request bodies to 64 KiB. A caller-supplied UUID `requestId` makes sequential retries return the original request and rejects changed payloads. Concurrent duplicate creation returns 409; retry with the same UUID. Returned context commands bind `--workspace` to the authorized handoff workspace. They do not grant their required scopes: project Notes still need `context:read`.

Actions:

- `seen` removes the request from this agent's unseen inbox. It does not accept ownership.
- `ack` optionally acknowledges receipt and marks it seen. ACK is not required to claim work.
- `claim` atomically changes an open request to claimed. Another claimant receives 409.
- `progress` records an update from the current claimant; `content` is required.
- `release` requires a reason, opens the request again, and clears delivery receipts so subscribers see it again.
- `complete` requires a result and closes the request. It does not change the issue's status.
- `supersede` requires a reason and `replacementId` referring to another open, claimed or completed handoff on the same issue that the acting agent can read. Only the original sender of still-open work or its current claimant can close it. It never takes another agent's claim. The old request leaves actionable inboxes, retains its contents, and links the replacement. A retry with the same replacement does not duplicate history; simultaneous replacements cannot create cycles.

`state=claimed` recovers this agent's unfinished claims, including those it previously marked seen. Only `unseen` (the default) and `claimed` are supported. Polling never acknowledges work automatically. Both modes return the oldest matching entries with `hasMore` and the same limit. For `unseen`, mark entries seen to advance; requests claimed or completed by another agent can still appear until marked seen. For `claimed`, complete, release or pass work onward to advance; marking it seen does not remove it from this mode.

To pass work onward, send a new request with `afterId` referencing a request currently claimed by the sender on the same issue. The previous request is completed and the next one created in one transaction. This preserves a linked chain without an ownership gap caused by two separate writes.

## Current identities and watcher health

Use one stable agent name across restarts. Register a human-readable host identifier and the actual agent session identifier together; do not use credentials, user data or task text in either field. One workspace user cannot bind multiple names to the same host/session pair. Existing names without a binding remain compatible and are displayed as unbound. Registration without these fields preserves an existing binding. Registration still replaces the complete label subscription list.

The same name can bind a replacement session after its current watcher stops or becomes stale. Active watcher bindings refuse takeover. Rebinding clears old health so a prior session's success cannot look like current-session evidence. Never reuse a name belonging to another active agent. Host/session fields describe an owner's declared runtime; they are not new authentication credentials or proof of machine identity.

CLI 0.6.0 `inbox watch --host HOST --session-id SESSION_ID` reports health against that exact registration. Each watch window has its own UUID; the server accepts one fresh watcher per agent, rejects competing watchers, and rejects subsequent reports from an old watcher after replacement. Heartbeat timestamps are server-generated. `agents list` and the web Agent inbox expose host/session, running/stale/stopped/error status, last successful inbox poll, and last successful wake callback. `agents list` also returns heartbeat time and a bounded error code. No heartbeat for five minutes makes running health stale; it does not prove the process exited. `stopped` records normal window expiry or cancellation; `error` records a reported operational failure. Agents with no health reports show no reported health, not healthy or connected. Watchers without health flags leave any prior reports unchanged.

`lastWakeAt` means the local callback exited successfully after host acceptance. It does **not** prove a model turn or completed work. Verify those through the handoff's claim, progress and reply. No callback success is recorded on timeout, cancellation or failure. Health report bodies contain no token, task content, callback arguments or raw error text. Health failures stop a reporting watcher; an error while recording a prior failure never replaces that original error. If the server is unavailable at shutdown, the last running report becomes stale.

The heartbeat body is `{agent, host, sessionId, watcherId, event, errorCode?}`; events are `started`, `poll`, `wake`, `stopped`, `error`, with `errorCode` required for `error` and forbidden for other events. Only the owning user can report, and the exact host/session must already be registered. The CLI manages this lifecycle; do not manually report success on behalf of a watcher.

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

Delivery persists while agents are offline. Inbox retrieval and claims still require the agent owner's current issue access. Inbox creation itself does not wake a model: the host must provide and verify an adapter. For watcher availability and setup, see the [CLI wake callback contract](../packages/cli/README.md#wake-a-running-agent-through-its-host). Label delivery needs only the original agent-handoff tables; current identity/health and supersession additionally require the agent-operations migration.

## Validation and rollout

`node --test tests/agents/handoffs.test.cjs` starts a socket-only disposable PostgreSQL instance, applies the additive migration to existing fixture data, exercises concurrent claims and ACKs, and checks scope/tenant isolation and the named-agent timeline. Label-delivery coverage includes rollback, unchanged and concurrent edits, removal/re-addition, unsubscribed labels, and creation through the transaction helper; it also exercises the web mutation helper and CLI update route. It requires local PostgreSQL binaries and the generated Prisma client; it never uses the application's `DATABASE_URL`.

`node --test tests/agents/handoff-supersession.test.cjs` uses a disposable PostgreSQL database with the production Prisma visibility guard to cover replacement links, ownership refusal, retries and concurrent cycle prevention. It requires the same local prerequisites and does not exercise HTTP routes.

Deployment requires the additive `20261017000100_agent_handoffs` migration before exposing these routes. It creates three new tables and their indexes/foreign keys; it does not rewrite existing records. Application rollout and any production migration remain with the designated application owner. No production acceptance is implied by source tests.

CLI 0.6.0 identity/health/supersession requires `20261026000100_agent_operations` before deploying the matching app. The additive migration adds nullable fields and a unique host/session binding index; legacy unbound rows and handoffs are preserved. Verify the target database and ledger, take and inspect a fresh private backup with an off-host copy, then use the established migration path. A database without a Prisma migration ledger must receive only this reviewed SQL, never an unqualified replay of history or `db push`. Keep the columns and index if reverting the app image. See [empty-database bootstrap](database-bootstrap.md) only for a new, empty database.

Older server images can expose superseded rows to older watchers after rollback. Keep the additive schema and prefer a compatible forward repair.

The shipped identity/health reporting does not install an Orca adapter, supervisor or stopped-agent launcher. The Sportsbook SBK-41 pilot proved a same-host round trip and duplicate suppression; its bounded, handoff-allowlisted prototype is not a general service. A reusable adapter must bind an actual current Orca handle, read `result.send.accepted`, retain the request ID for uncertain-delivery recovery, coalesce repeated handoff IDs, renew bounded watcher windows, and verify a remote idle model's claim/reply. Keep that acceptance separate from callback health and the completed pilot.
