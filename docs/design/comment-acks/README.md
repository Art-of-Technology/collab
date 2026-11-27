# "Acked" on issue comments

Decided by Erdem on 26 and 27 November 2026, from a clickable mockup. This note is the specification.

## The problem

A person writes a comment on an issue that an agent seat works. Until the seat replies, minutes later, nothing shows
that the comment reached it. And when the issue is done, or held by nobody, the comment reaches no agent at all and
nothing says so. A mention does not wake a seat: only the seat that holds the issue is woken by a comment.

## What is added

One always-visible line under a person's comment on the issue page. No new screen, no notification, no Home panel.

| State | The line | When |
| --- | --- | --- |
| Acked | `Acked by {seat names} · {time} after` | A seat started a run that was given the comment, or read it during a run (the run context, or new comments with `since`) |
| Waiting | `Waiting for {holder seat}`, with a reason when known | A live seat holds the issue, the issue is not done, and that seat has not acked |
| Nobody | `No agent will pick this up · {why}` | The issue is done and held by a seat; or the seat that holds it has no live run open on it and the comment came before the window its next run is given (`not_given`); or no seat holds it and the comment mentions a seat |
| (no line) | | No seat holds the issue and no seat is mentioned; an agent's or Collab's own comment; for waiting and nobody, a comment written before the workspace's first ack |

Reasons while waiting: the seat was already in a live run when the comment was written (`in_run`: ` · it is in a run
now and gets this when it next asks for new comments`); the seat is run by a runner that has not asked for 2 minutes or
more (`runner_silent`). A runner's last sign is stamped at most once a minute and it asks about once a minute, so
`runner_silent` is given only after 3 minutes without one; the copy still says 2 minutes or more. A run that is lost is
not "in a run". A mentioned seat that does not hold the issue gets a second line: the mention does not reach it.

A comment no run will be given reads `No agent will pick this up · it was not given to a run of {seat}. Comment again to
send it`. The line for a mentioned seat that does not hold the issue is for an issue no seat holds.

## Rules

1. "Acked" is recorded by Collab, never by the agent. Two moments: a seat starts a run (every person comment in that
   run's "comments since" window, up to the run's start), and a seat's own token reads new comments (the token comment
   list with `since`, what `collab comments wait` sends) or the run context while it has a run open on that issue
   (every person comment in the answer). A plain comment list records nothing: `collab comments wait` sends one for its
   baseline and throws the answer away. At a run start and a run-context read the ack is recorded after the answer has
   left.
2. A comment written while the seat is in a run is not acked by that run's start. It is acked when the session asks for
   new comments. If that run finishes without asking, no run is given the comment: the next run's window opens at the
   last finished run's end, and a comment does not wake a seat that was mid-run when it was written. Once the seat has
   no live run open on the issue, such a comment reads "not given" (`not_given`), and commenting again sends it.
3. Any person's comment qualifies. Every seat that received it is listed, oldest first.
4. An edit after the ack adds `· edited since`. An edit wakes nobody, as today.
5. Replies get the same line. Everyone who can read the issue sees it.
6. Lines for waiting and nobody appear for comments written after the workspace's first ack, so a comment written before
   acks existed is never said to wait. "Acked" is shown whenever ack rows exist, whenever the comment was written.
7. The same fact is in the comment data that the CLI and MCP read.

## What must not change

- No agent, runner or CLI has to change, Stech's included. No new command, scope or version.
- Recording an ack can never fail or delay a run start or a read. If the write fails, the run still starts and the
  list is still answered.
- Every answer an agent gets today keeps its shape. Fields are only added.
- An ack is not a comment: it wakes no seat and changes no inbox.

## Where the ack lives

An `IssueCommentReaction` row with `type: 'ack'`, written under the seat's account. The table has a free `type` and one
row per author, comment and type; likes are counted by `type === 'like'`, so they are unaffected. There is no schema
change. "Waiting" and "Nobody" are worked out when the list is read; only "Acked" is stored. An ack is not listed among
a comment's `reactions` in either comment list, nor counted in `reactionCounts`: the fact is in the `ack` field.

What this cannot record: which run acked, and whether it was at run start or by a later fetch. A table of its own
would, at the price of a migration; that is left for a later, declared ack by the agent.
