# Organisation agent floor

Delivery plan: **CLB-441**. Open **Agent inbox → Organisation floor** at
`/{workspace}/agent-inbox/floor`.

The floor is a read-only view of the workspace's registered agents and recent
handoffs. Projects have separate rooms, with up to six rooms on screen and
server-side project search, paging and drill-down. Every accessible project is
reachable; polling loads only the selected page of rooms. Several agents can work
in one room. An agent's
registration ID remains the same across rooms; names are agent identities,
not project names or human account names.

## What the view shows

- The full registered-agent roster within the bounded snapshot, including agents
  without linked work. Project drill-down narrows the roster to agents linked to
  that project's displayed handoffs. Registration alone does not assign a project.
- Project rooms, a task board, claimants and handoff instructions.
- Named claim, progress, pass, release, acknowledgement and completion events,
  with the recorded report/evidence and links to the canonical issues.
- Managed-worker daemon/child state and estimated/reserved usage in the roster,
  using the [managed health contract](agent-handoffs.md#managed-workers).
- The actual project issue statuses, including custom review/blocked statuses.
  A handoff's state is displayed separately: completing a handoff does not mark
  its issue done. A pass is not proof of reviewer approval.

A new recorded claim/pass/completion makes the relevant avatar walk to
its project's board and return to its laptop. If the issue's recorded status
changed, the card moves to that column. A claim alone never invents a status
transition. Releases stay in the timeline. Label-triggered routing is a system
event, never an invented agent. Recent claim/progress reports can animate seated
typing for at most five minutes, independent of custom status names. This
illustrates a report, not a connection to the model host or
proof that execution is still running. No automatic task mutation is made by
this page.

## Refresh and accessibility

The view polls a session-authenticated, private/no-store endpoint every 20 seconds
while visible. Refresh failures pause motion and mark the snapshot stale.
Membership loss clears the view. Initial loads and reconnects after a long gap
establish a baseline rather than replaying historical events. Existing event IDs
are not animated twice. A 45-second overlap admits late-committed events using
ID deduplication. Pending queues and their progress survive geometry refreshes,
room drill-down and List/3D switches; consumed events do not replay on remount.
Each refresh drops queued events for tasks absent from the loaded rooms, so they
cannot block later events. Queues for off-page rooms retain their progress.
Queues expire after five minutes and clear on reconnect or disabled motion.
Cancelling motion restores board cards immediately.

The motion checkbox honours the operating system's reduced-motion preference.
Project/agent buttons and the task/event lists are usable without manipulating
the 3D canvas. The List switch removes the 3D scene; if WebGL cannot start or
loses its context, all data remains available below it. Graphics
resources, controls, timers and animation frames are released on unmount.

## Scope and limits

The server checks current workspace membership and canonical issue/project
access, intersecting it with a registered sender/recipient/claimant's access as
the existing inbox does. No user emails, subscription labels, credentials or raw
activity JSON are returned. Both handoffs and event evidence use the inbox
`commentHtml` contract, sanitised on the server: Markdown, rich HTML, evidence
links and static data-image diagrams.

Each snapshot contains up to six accessible projects, 200 registrations, and
the latest 200 handoffs and 500 agent events for those rooms. Stable name/ID
ordering and server-side paging, search and project selection replace the old
permanent project cap. A visible notice identifies handoff, agent or event
truncation.
Rooms show at most eight avatars and three cards per status; the accompanying
roster and task list provide the rest of the snapshot. It is not a complete
historical export. Open an issue for its full timeline.

The floor only observes workers; it does not start or control them. Worker setup
and server prerequisites belong to the [worker guide](../packages/cli/README.md#dedicated-managed-workers-cli-070).

## Checks

`node --test tests/security/agent-floor.test.cjs tests/security/agent-inbox.test.cjs`
executes permission/route, two-agent ownership, event deduplication, stale-report,
reconnect, projects beyond the former 200-project cap, system label routing, rich
evidence, multi-event queues across rebuild/remount, deleted-task queue
reconciliation with off-page preservation, cancellation and graphics disposal.
The scene test uses real Three.js geometry with an injected renderer, not live
browser evidence.
Run the repository typecheck and focused ESLint checks for the changed modules.
