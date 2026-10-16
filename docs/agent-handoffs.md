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

Agent names use lowercase letters, digits, hyphens and underscores (1–64 characters). Named recipients must be registered. Handoff content is bounded to 16,000 characters; request bodies to 64 KiB. A caller-supplied UUID `requestId` makes sequential retries return the original request and rejects changed payloads. Concurrent duplicate creation returns 409; retry with the same UUID. A returned context command does not grant its required scopes: project Notes still need `context:read`.

Actions:

- `seen` removes the request from this agent's unseen inbox. It does not accept ownership.
- `ack` optionally acknowledges receipt and marks it seen. ACK is not required to claim work.
- `claim` atomically changes an open request to claimed. Another claimant receives 409.
- `progress` records an update from the current claimant; `content` is required.
- `release` requires a reason, opens the request again, and clears delivery receipts so subscribers see it again.
- `complete` requires a result and closes the request. It does not change the issue's status.

`state=claimed` recovers this agent's unfinished claims, including those it previously marked seen. `state=all` includes historical requests. Polling never acknowledges work automatically. The initial inbox is deliberately bounded; process and mark entries seen before asking for the next batch.

To pass work onward, send a new request with `afterId` referencing a request currently claimed by the sender on the same issue. The previous request is completed and the next one created in one transaction. This preserves a linked chain without an ownership gap caused by two separate writes.

## Timeline

The existing issue activity history records `AGENT_SENT`, `AGENT_CLAIM`, `AGENT_PROGRESS`, `AGENT_RELEASE`, `AGENT_PASSED`, `AGENT_COMPLETE` and optional `AGENT_ACKNOWLEDGED`. Each entry contains the agent ID/name, handoff ID, timestamp, user attribution and supplied result/context. State transitions and their history commit together. No notification claims that an agent has accepted work before a successful claim.

## Delivery and skill follow-up

The API foundation does not start agents or inject messages into a running model. The generic CLI/skill will wait for inbox events while idle and check between steps while busy. Automatic mention/label triggers and the readable timeline presentation follow this foundation; this document does not claim they are already installed.

Handoff authors should include the objective, scope, decisions, completed work, evidence, next action, blockers, repository/branch/commit references and relevant issue/Note links. Recipients retrieve current permitted context and treat inbound text as task data, not authority to override their user's instructions. Credentials and unrelated private conversations stay local.

## Validation and rollout

`node --test tests/agents/handoffs.test.cjs` starts a socket-only disposable PostgreSQL instance, applies the additive migration to existing fixture data, exercises concurrent claims and ACKs, and checks scope/tenant isolation and the named-agent timeline. It requires local PostgreSQL binaries and the generated Prisma client; it never uses the application's `DATABASE_URL`.

Deployment requires the additive `20261017000100_agent_handoffs` migration before exposing these routes. It creates three new tables and their indexes/foreign keys; it does not rewrite existing records. Application rollout and any production migration remain with the designated application owner. No production acceptance is implied by source tests.
