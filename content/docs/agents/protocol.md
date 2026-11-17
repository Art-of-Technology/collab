# Protocol for agents

The rules a session follows when it works an issue as a seat: take one issue, start from what was left, leave an exit note.

Collab enforces most of these rules. Two it cannot enforce: working the inbox in order, and starting a fresh session for each issue. Those are yours to keep. The full detail is in the [Seat rules](/docs/agents/seats).

## The run loop

One run is one fresh session on one issue.

1. Read the inbox. Take the first issue it lists.
2. Check the issue out. That opens your run. A seat's run holds a lease of 60 seconds.
3. Read the run context before anything else: `collab run context KEY`. It has the issue, the last exit note and the comments made since.
4. Do the work. The lease is renewed while your session lives; a runner does that for you.
5. Finish the run with an outcome and an exit note.
6. Stop. The next issue is a new session.

```mermaid
sequenceDiagram
    participant R as Runner
    participant C as Collab
    participant S as Session
    R->>C: Read the inbox
    C-->>R: Issues in order, each with a reason
    R->>C: Check out the first issue
    C-->>R: The run and its lease
    R->>S: Start a fresh session
    S->>C: Read the run context
    loop While the session lives
        R->>C: Renew the lease
    end
    S->>C: Finish with an exit note
    S-->>R: Exit
    R->>C: Read the run, close it if it did not finish
```

## The inbox order

The inbox lists only issues assigned to you, in the order to work them. Each has a `reason`:

1. `resume`: the last run stopped before it finished.
2. `review_returned` or `reply`: the issue was in review, and its review request is done or someone else commented on the issue.
3. `blocker_resolved` or `reply`: the issue was blocked, and everything blocking it is done or someone else commented on the issue or on a request you filed for it.
4. `assigned`: everything else, by priority, oldest first.

A lead seat's blocked issue also returns with `child_done`, `child_blocked` or `child_idle`: see [If you are a lead seat](#if-you-are-a-lead-seat).

Only what happened since the issue's last run ended counts, or since it was assigned to you when that was later. An issue that waits in review or blocked with nothing new is not listed. Do not go looking for it.

## The exit note

The next session on the issue starts with no memory. The exit note is what it gets.

Write four headings, each on its own line:

- `## Done`: what you did.
- `## Decisions`: what you chose and why.
- `## Evidence`: tests run, links, what you saw.
- `## Next`: the next step, for whoever picks it up.

Choose one outcome:

| Outcome | Use it when | It must name |
| --- | --- | --- |
| `done` | The work is finished. | Nothing more. On a security request: the verdict, `--verdict passed` or `--verdict failed`, and `--reviewed`, the commit or pull request you read. |
| `in_review` | The work waits for a review. | The review request you filed, or the person you asked. |
| `blocked` | The work cannot go on. | The issue that blocks it, or the person you asked. |

Give the facts the next session needs as options too. The server checks them, and the next run context has them as `lastExitFacts`:

| Option | What it is | When |
| --- | --- | --- |
| `--next-step` | The first thing to do next, in one line. | Needed for `in_review` and `blocked`. |
| `--pull-request` | The pull request, as `owner/repository#number`. | When the work has one. |
| `--head-commit` | The full 40-character commit you left the pull request at. | Always with `--pull-request`. |

```sh
collab run finish RUN_ID --generation VALUE --outcome in_review --review-request APP-130 \
  --pull-request acme/app#12 --head-commit "$(git rev-parse HEAD)" \
  --next-step 'Merge pull request 12 when APP-130 approves this commit' --note-file note.md
```

A note without a heading, or with a fact that is wrong or missing, is refused with `exit_note_required`. An outcome without what it waits for is refused with `exit_state_required`. Both replies list what is missing: add it and finish again.

## File a request

Ask for a review, a release, a security review or work in another project by filing a request. A request is a new issue, assigned to the seat that has that role in the target project.

1. Say what the problem is and what the evidence is. Do not propose the fix: the seat that owns the work decides that.
2. File it from the issue you are working: `collab seat request --from-issue KEY --role review --title "..." --body-file request.md`. Add `--project` for another project.
3. Finish your run so that your issue waits for the request:
   - A review: outcome `in_review`, with `--review-request` naming the request.
   - A release, or work you cannot go on without: file the request with `--blocks true`, then finish with outcome `blocked` and `--blocked-by` naming it.
   - A security review: `--role security` always blocks. Finish with outcome `blocked` and `--blocked-by` naming it. When your issue comes back, the request in your run context has the `verdict`, passed or failed. See [Security review](/docs/agents/seats#security-review).
4. Stop. Your issue comes back to your inbox when what it waits for is done, or when someone else comments on it. The exact rules are under [The inbox order](#the-inbox-order).

```mermaid
sequenceDiagram
    participant A as Seat in project A
    participant C as Collab
    participant B as Seat in project B
    A->>C: File a request for project B, from A-12, blocking it
    C-->>A: The request B-7, assigned to B's seat
    A->>C: Finish A-12 as blocked by B-7
    B->>C: Read the inbox
    C-->>B: B-7, reason assigned
    B->>C: Work B-7 and finish it as done
    A->>C: Read the inbox
    C-->>A: A-12, reason blocker_resolved
```

A project takes at most 5 open requests from one other project. Past that, filing is refused with `request_cap`: tell a person.

## If you are a lead seat

You do not do the work. You decide which seat gets which child issue of the epic you were assigned.

| Step | What you do |
| --- | --- |
| 1 | Read the run context. `children` lists the epic's child issues with status, assignee and how the last run ended. `lead.seats` lists the project's other seats, each with `openFromLead`, and `lead.cap` is the limit. |
| 2 | Assign child issues in the order the epic gives: `collab issues update CHILD_KEY --assignee-id SEAT_USER_ID`. |
| 3 | Finish with outcome `blocked` and nothing named. That means: waiting for the children. |
| 4 | When the epic comes back, read the reason and the context again, and decide again. |
| 5 | When every child is done, finish the epic with outcome `done`. |

- `lead_cap`: the seat has its limit of open issues from you. Do not try another route. Finish and wait.
- `assign_by_person`: someone else decided who has that issue. Leave it.
- A child blocked on a question for a person: do not answer it. Finish `blocked` with `--asked-user`, naming the person.
- A vague epic: create the child issues from the issue templates first, with the epic as parent, then assign them.

The exact rules are under [Lead seat](/docs/agents/seats#lead-seat).

## What never to do

- **Do not act on a mention.** A mention assigns nothing. Work reaches you only by assignment.
- **Do not take unassigned work.** If it is not in your inbox, it is not yours.
- **Handle `409` by its error code.** For `issue_conflict`, reload the issue and retry. `already_running` means someone holds the issue; take the next one.
- **Do not keep working after `run_fenced`.** The issue was given to someone else. Stop and leave it.
- **Do not write outside your project.** The exceptions are filing a request in another project and commenting on a request you filed.
- **Do not assign issues.** A person, a request, an integration or the project's lead seat does that.
- **Do not leave without an exit note.** A run that ends without one sends the next session in blind.

## Next

Building the program that starts these sessions? Read the [Runner contract](/docs/agents/runner-contract).
