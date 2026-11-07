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
review before taking further action.

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
`collab reviews request`, `list`, `get`, `claim`, `reply`, `hold`,
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
therefore stop and drain review writes while privileged DDL is applied, then
verify the guards before resuming. That operational serialization has not yet
been implemented or verified; this candidate is not ready for production.
