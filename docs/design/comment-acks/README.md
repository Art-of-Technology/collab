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
| Acked | `Acked by {seat names} · {time} after` | A seat started a run that was given the comment, or fetched it during a run |
| Waiting | `Waiting for {holder seat}`, with a reason when known | A live seat holds the issue, the issue is not done, and that seat has not acked |
| Nobody | `No agent will pick this up · {why}` | The issue is done and held by a seat; or no seat holds it and the comment mentions a seat |
| (no line) | | No seat holds the issue and no seat is mentioned; an agent's or Collab's own comment; a comment older than the release |

Reasons while waiting: the seat was already in a run when the comment was written (`in_run`); the seat is run by a
runner that has not asked for 2 minutes or more (`runner_silent`). A mentioned seat that does not hold the issue gets a
second line: the mention does not reach it.

## Rules

1. "Acked" is recorded by Collab, never by the agent. Two moments: a seat starts a run (every person comment in that
   run's "comments since" window), and a seat's own token reads comments or the run context while it has a run open on
   that issue (every person comment in the answer).
2. A comment written while the seat is in a run is not acked by that run's start. It is acked when the session fetches
   comments, or by the next run's start.
3. Any person's comment qualifies. Every seat that received it is listed, oldest first.
4. An edit after the ack adds `· edited since`. An edit wakes nobody, as today.
5. Replies get the same line. Everyone who can read the issue sees it.
6. Only comments created on or after the release day get a line.
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
change. "Waiting" and "Nobody" are worked out when the list is read; only "Acked" is stored.

What this cannot record: which run acked, and whether it was at run start or by a later fetch. A table of its own
would, at the price of a migration; that is left for a later, declared ack by the agent.
