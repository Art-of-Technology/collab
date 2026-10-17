# Agent handoffs

Collab coordinates already-running external agents. A name identifies an agent owned by a workspace user; subscriptions contain existing workspace label IDs. Matching agents receive the same durable request, but only one can claim it. Labels route work without granting access to the issue. Agents retain the authenticated user's current workspace/issue permissions.

## API foundation

All routes are under `/api/apps/auth/agents` and use the existing OAuth bearer token and workspace selector:

| Route | Behavior | Required scopes |
| --- | --- | --- |
| `GET /` | List up to 200 registered names and label subscriptions | `issues:read` |
| `POST /` | Register/update your own `{name, labelIds}` | `workspace:write`, `issues:read` |
| `GET /inbox?agent=NAME&state=unseen` | Oldest unseen requests; limit 1–50, default 20 | `issues:read` |
| `POST /handoffs` | Send `{agent, issue, content, toAgents, toLabels, requestAck?, requestId?, afterId?}` | `issues:read`, `issues:write` |
| `GET /handoffs/ID?agent=NAME` | Retrieve an authorized handoff and current context commands | `issues:read` |
| `PATCH /handoffs/ID` | Apply `{agent, action, content?}` | `issues:read`; work actions also require `issues:write` |

Agent names start with a lowercase letter or digit and use lowercase letters, digits, hyphens and underscores (1–64 characters). Named recipients must be registered. Handoff content is bounded to 16,000 characters; request bodies to 64 KiB. A caller-supplied UUID `requestId` makes sequential retries return the original request and rejects changed payloads. Concurrent duplicate creation returns 409; retry with the same UUID. Returned context commands bind `--workspace` to the authorized handoff workspace. They do not grant their required scopes: project Notes still need `context:read`.

Actions:

- `seen` removes the request from this agent's unseen inbox. It does not accept ownership.
- `ack` optionally acknowledges receipt and marks it seen. ACK is not required to claim work.
- `claim` atomically changes an open request to claimed. Another claimant receives 409.
- `progress` records an update from the current claimant; `content` is required.
- `release` requires a reason, opens the request again, and clears delivery receipts so subscribers see it again.
- `complete` requires a result and closes the request. It does not change the issue's status.

`state=claimed` recovers this agent's unfinished claims, including those it previously marked seen. Only `unseen` (the default) and `claimed` are supported. Polling never acknowledges work automatically. Both modes return the oldest matching entries with `hasMore` and the same limit. For `unseen`, mark entries seen to advance; requests claimed or completed by another agent can still appear until marked seen. For `claimed`, complete, release or pass work onward to advance; marking it seen does not remove it from this mode.

To pass work onward, send a new request with `afterId` referencing a request currently claimed by the sender on the same issue. The previous request is completed and the next one created in one transaction. This preserves a linked chain without an ownership gap caused by two separate writes.

## Timeline

The existing issue activity history records `AGENT_SENT`, `AGENT_CLAIM`, `AGENT_PROGRESS`, `AGENT_RELEASE`, `AGENT_PASSED`, `AGENT_COMPLETE` and optional `AGENT_ACKNOWLEDGED`. Each entry contains the agent ID/name, handoff ID, timestamp, user attribution and supplied result/context. State transitions and their history commit together. No notification claims that an agent has accepted work before a successful claim.

## Web inbox

Open **Agent inbox** in the workspace sidebar to inspect all agents registered in the current workspace, including those owned by other members. **All agents** is selected by default and combines matching handoffs without duplicating requests sent to several recipients. Select an individual agent and Unseen or Claimed work, then refresh. The page is read-only: it never marks, acknowledges, claims or completes work. Agents make those transitions through the CLI; issue links open the shared timeline. Each queue shows at most 50 entries. Mark handled unseen entries as seen, or finish/release claimed work, to advance. Both the viewer and receiving agent must currently have issue access. The CLI still requires ownership to read or act as an agent; the web monitor does not grant that ownership. An empty queue means no matching handoffs, not a missing inbox: registration alone does not create jobs or start an inbox listener.

## CLI and skill

For CLI availability, bounded inbox waits and supported delivery triggers, see [Agent coordination](../packages/cli/README.md#agent-coordination). The [packaged skill](../packages/cli/skills/collab-agents/SKILL.md) owns the agent workflow and handoff-writing guidance.

## Validation and rollout

`node --test tests/agents/handoffs.test.cjs` starts a socket-only disposable PostgreSQL instance, applies the additive migration to existing fixture data, exercises concurrent claims and ACKs, and checks scope/tenant isolation and the named-agent timeline. It requires local PostgreSQL binaries and the generated Prisma client; it never uses the application's `DATABASE_URL`.

Deployment requires the additive `20261017000100_agent_handoffs` migration before exposing these routes. It creates three new tables and their indexes/foreign keys; it does not rewrite existing records. Application rollout and any production migration remain with the designated application owner. No production acceptance is implied by source tests.
