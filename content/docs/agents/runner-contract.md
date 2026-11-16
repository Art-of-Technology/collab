# Runner contract

The seven HTTP calls a program makes to run sessions for a seat, with what each one takes and what it returns.

A runner is the program that starts a session for each issue of a seat. Collab decides which issue is next and who may work it. The runner decides how the session is run. `collab seat run` is a small runner built on these calls: see [Run a seat from the CLI](/docs/agents/seats#run-a-seat-from-the-cli).

## Before you start

- Every call is under `/api/apps/auth` on the Collab server and carries the seat's token: `Authorization: Bearer TOKEN`.
- The token needs the scopes `issues:read` and `issues:write`.
- A success is HTTP 200 with a JSON body, also for a checkout and a new request.
- An error is `{ "error": "<code>", "error_description": "<text>" }`. Some errors add keys, named below.
- A JSON body holds at most 64 KiB. A key the call does not know is refused with `400 invalid_request`.
- Text fields are trimmed and must not be empty.

```sh
curl -H "Authorization: Bearer $COLLAB_TOKEN" https://collab.example.com/api/apps/auth/seats/me
```

## The calls

| Call | Does |
| --- | --- |
| `GET seats/me` | Says which seat the token is. |
| `GET seats/me/inbox` | Lists the seat's issues in the order to work them. |
| `POST runs` | Checks an issue out: opens a run with a lease. |
| `GET runs/{id}` | Reads a run. |
| `PATCH runs/{id}` | Renews the lease, finishes the run, or confirms the session is gone. |
| `GET issues/{key}/run-context` | Gives a fresh session what it needs in one read. |
| `POST seats/me/requests` | Files a request for another seat. |

## The loop

1. Read the inbox. If it is empty, wait and read again. Nothing is pushed to a runner.
2. Check out the first issue. On `409`, do not retry it: try the next issue of the same read.
3. Start a fresh session for the issue. Give it the issue key, the run id and the generation.
4. Renew the lease while the session lives. A lease lasts 60 seconds from each renewal; renew well inside that.
5. The session reads the run context, does the work and finishes the run with an exit note.
6. When the session has exited, read the run. If it is not finished, close it.
7. Go back to step 1.

The same loop as a picture is on [Protocol for agents](/docs/agents/protocol#the-run-loop).

## Say which seat: GET seats/me

Takes nothing. Needs no scope.

```json
{
  "seat": { "id": "cm3seat0000001", "projectId": "cm3proj0000001", "role": "developer", "ownerId": "cm3user0000001", "name": "dev-a", "isDefault": true },
  "project": { "id": "cm3proj0000001", "name": "Website", "issuePrefix": "AA", "agentMode": "handoffs" }
}
```

- `role` is `developer`, `reviewer` or `release`. `ownerId` is a person's id or `null`.
- A token that is not a seat gets `403 seat_required`.

## List the work: GET seats/me/inbox

Takes nothing. Needs `issues:read`. The call does not wait: it answers at once, also when there is no work.

```json
{
  "items": [
    { "issueId": "cm3issue000001", "issueKey": "AA-12", "title": "Fix the login timeout", "priority": "high", "category": "todo", "reason": "assigned", "lastRunAt": null }
  ]
}
```

- At most 50 items, already in the order to work them. An empty inbox is `{ "items": [] }`.
- `reason` is `resume`, `review_returned`, `reply`, `blocker_resolved` or `assigned`, and for a lead seat also `child_done`, `child_blocked` or `child_idle`. What each means is under [What a seat works on next](/docs/agents/seats#what-a-seat-works-on-next).
- `category` is the group of the issue's status, or `in_review` or `blocked` when its last run ended that way.
- `lastRunAt` is when the last run on the issue ended, or `null`.
- An issue with an open run and an issue in a done status are not listed.

Reading the inbox also tells Collab the seat is alive. A release seat that has not read its inbox for 10 minutes is reported as idle to whoever files a request for it.

## Check an issue out: POST runs

Needs `issues:write`. All three fields are required.

| Field | Type | What it is |
| --- | --- | --- |
| `issue` | text, up to 128 | The issue's key or id. |
| `generation` | text, up to 128 | A value the runner makes up for this run, such as a UUID. Every later call on the run repeats it. |
| `runner` | text, up to 64 | The name of the program that runs the session. It is stored with the run. |

```json
{ "issue": "AA-12", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11", "runner": "my-runner 1.0" }
```

The reply is the run:

```json
{
  "run": {
    "id": "cm3run00000001", "issueId": "cm3issue000001", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11",
    "state": "running", "outcome": null, "note": null, "ask": null, "usage": null,
    "leaseUntil": "2026-11-16T10:01:00.000Z", "startedAt": "2026-11-16T10:00:00.000Z", "endedAt": null
  }
}
```

The checkout moves the issue to the project's first active "in progress" status. It stays where it is if it is already in that group or the project has no active status in that group.

| Status | `error` | When |
| --- | --- | --- |
| 404 | `not_found` | The issue is not in the workspace, or it is in Trash. |
| 403 | `wrong_project` | The issue is in another project than the seat's. |
| 403 | `not_assigned` | The issue is assigned to someone else. |
| 403 | `seat_required` | The token is an agent token that is not a seat. |
| 409 | `already_running` | A run is open on the issue. Take the next issue; do not retry. |
| 409 | `needs_person` | The open run on the issue is lost. The runner that holds it closes it, or a person clears it. |

A project connected to Forge takes no runs: `409 forge_connected_project`.

## The run object

Every run call returns the run with these keys:

| Key | Value |
| --- | --- |
| `id`, `issueId`, `generation` | Text. |
| `state` | `running`, `finished`, `stopped` or `lost`. |
| `outcome` | `done`, `in_review`, `blocked`, or `null` while the run is open. |
| `note` | The exit note, or `null`. |
| `usage` | What the finish reported, or `null`. |
| `leaseUntil` | When the lease ends. It is not cleared when the run ends. |
| `startedAt`, `endedAt` | Timestamps. `endedAt` is `null` while the run is open. |

The key `ask` is always `null` today.

A run is **lost** when its lease lapsed without a renewal. A lapsed lease does not prove the session stopped, so a lost run stays open: the issue is not offered and cannot be checked out until the run is closed or a person clears it. Collab notices a lapsed lease the next time the inbox or a run is read or written.

## Renew the lease: PATCH runs/{id}

Needs `issues:write`.

```json
{ "event": "renew", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11" }
```

The reply is `{ "run": { ... } }` with `leaseUntil` 60 seconds from now.

A renewal is refused with `409 run_fenced` when the generation is not the run's, the run has ended or is lost, or the issue was given to someone else. After `run_fenced`: stop the session, then close the run.

## Finish the run: PATCH runs/{id}

The session that did the work finishes the run. Needs `issues:write`.

| Field | Required | What it is |
| --- | --- | --- |
| `event` | yes | `"finish"`. |
| `generation` | yes | The run's generation. |
| `outcome` | yes | `done`, `in_review` or `blocked`. |
| `note` | yes | The exit note, up to 16,000 characters, with the headings `## Done`, `## Decisions`, `## Evidence` and `## Next`, each on a line of its own. |
| `reviewRequest`, `blockedBy`, `askedUser` | see below | What the issue waits for. |
| `nextStep` | for `in_review` and `blocked` | The first thing to do next, in one line of at most 300 characters. If absent for those outcomes, the first non-empty line under `## Next` is used, with a leading list mark removed and truncated to 300 characters; a heading is not a next step. `done` does not use this fallback. |
| `pullRequest`, `headCommit` | no, but together | The pull request as `owner/repository#number`, and the full lowercase 40-character commit it was left at. Neither is taken without the other. |
| `verdict`, `reviewed` | see below | For a security request that finishes `done`: `passed` or `failed`, and the commit or pull request that was read, up to 200 characters. |
| `status` | no | The name of the status to move the issue to. It must be an active status of the outcome's group. |
| `usage` | no | What the run cost. See below. |

- `in_review` must carry `reviewRequest` (a review request this seat filed for the issue) or `askedUser` (the id of a person in the workspace).
- `blocked` must carry `blockedBy` (an issue linked as blocking this one) or `askedUser`. A lead seat may carry neither while its issue has a child issue that is not done: it waits for the children.
- `done` carries none of the three.
- A security request that finishes `done` must carry `verdict` and `reviewed`; no other finish takes them. See [Security review](/docs/agents/seats#security-review).
- A release seat may add `alsoFinish`: 1 to 20 other release requests to finish with the same note. See [Finish a run](/docs/agents/seats#finish-a-run).

```json
{
  "event": "finish",
  "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11",
  "outcome": "in_review",
  "reviewRequest": "AA-19",
  "pullRequest": "acme/app#12",
  "headCommit": "5d2c1f0a9b8e7d6c5b4a39281706f5e4d3c2b1a0",
  "nextStep": "Merge pull request 12 when AA-19 approves this commit",
  "note": "## Done\n...\n\n## Decisions\n...\n\n## Evidence\n...\n\n## Next\n..."
}
```

The reply is `{ "run": { ... }, "statusUnmapped": false }`. `statusUnmapped` is `true` when the issue is not already in the outcome's group and the project has no active status for the outcome. The issue stays where it was, and the outcome still counts.

| Status | `error` | Extra key | When |
| --- | --- | --- | --- |
| 422 | `exit_note_required` | `missing`: the headings not found, or the fields to correct | The note lacks a heading; `pullRequest` or `headCommit` is malformed or comes without the other; or `in_review` or `blocked` has no next step. |
| 422 | `exit_state_required` | `missing`: the fields to supply | The outcome lacks what it waits for, a security request finishes `done` without `verdict` or `reviewed`, or the finish names something that cannot bring the issue back: a request or blocker that is done or not linked, a person who is not an active member, a status outside the outcome's group. |
| 400 | `invalid_request` | | A field the outcome does not take, an unknown key, or a `usage` that is not complete. |
| 409 | `run_fenced` | | The run is not the one working the issue any more. If the generation matches and the run had not finished already, the note is kept on the issue's timeline as a late exit note. |
| 404 | `not_found` | | The run is not the caller's, or its issue is in Trash. |

### Report usage

`usage` is optional. When it is sent, all twelve keys are required:

```json
{
  "day": "2026-11-16",
  "chargedUSD": 0, "reservedUSD": 0, "estimatedUSD": 1.25, "unknownUSD": 0,
  "restarts": 0, "starts": 1, "totalStarts": 1,
  "inputTokens": 1000, "outputTokens": 200, "cacheReadTokens": 5000, "cacheWriteTokens": 300
}
```

Amounts are numbers of 0 or more. Counts are whole numbers of 0 or more; `restarts` is at most 100.

## Confirm the session is gone: PATCH runs/{id}

When the session exited without finishing, the runner says so. Needs `issues:write`.

```json
{ "event": "close", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11" }
```

The reply is the run with `"state": "stopped"`. The issue is offered again with reason `resume`.

- Close only after the session's process is gone. A close is the runner's word that nothing is still working the issue.
- A close also ends a lost run, and a run whose issue was given to someone else.
- A release seat's run cannot be closed: `409 needs_person`. A person clears it.
- A wrong generation, or a run that has ended, gets `409 run_fenced`.

## Read a run: GET runs/{id}

Needs `issues:read`. Returns `{ "run": { ... } }` for a run the token's account holds, also after it ended. Any other run gets `404 not_found`.

Read the run after the session exits: `state` tells you whether it finished.

## Read the run context: GET issues/{key}/run-context

Needs `issues:read`. The session reads this first. Any token that can read the workspace's issues may call it.

| Key | What it is |
| --- | --- |
| `issue` | `id`, `issueKey`, `title`, `description`, `type`, `priority`, `projectId`, `status`, `category`, `assigneeId` and `agentRequestRole`. |
| `lastExitNote` | The note of the last run that finished, or `null`. |
| `lastExitFacts` | `null` if no run finished; otherwise `pullRequest`, `headCommit` and `nextStep`, each `null` when the last finished run supplied none. |
| `commentsSince` | The comments made after that run ended, oldest first: `id`, `content`, `createdAt`, `parentId` and `author` with `id` and `name`. All comments when no run has finished. |
| `blockers` | The issues linked as blocking this one. |
| `requests` | The requests linked to this issue. |
| `requestFor` | When the issue is itself a request: the issues it was filed for. |
| `children` | Only when the issue has child issues: up to 100, oldest first. Each has the keys below, and `assigneeId`, `assignee` (the name) and `lastRun`: `null`, `running`, `stopped` or the outcome of its last run. |
| `lead` | Only when the issue is assigned to a lead seat: `cap`, and `seats`, the project's other seats, each with `userId`, `name`, `role` and `openFromLead`. |
| `commands` | `collab` commands that fetch the rest and end the session's work. |

An issue in `blockers`, `requests`, `requestFor` or `children` has `id`, `issueKey`, `title`, `projectId`, `status` and `category`. A request also has `requestRole`; a security request that has its verdict also has `verdict` and `reviewed`.

## File a request: POST seats/me/requests

Needs `issues:write`. Only a seat may call it.

| Field | Required | What it is |
| --- | --- | --- |
| `role` | yes | `developer`, `review`, `release` or `security`. |
| `title` | yes | Up to 200 characters. |
| `body` | yes | Up to 32,000 characters. When the workspace enforces templates, it must include the sections of its Task template. |
| `fromIssue` | yes | The key or id of the issue the request comes from. It must be in the seat's own project. |
| `project` | no | The target project's id or issue prefix. Without it, the seat's own project. |
| `blocks` | no | `true` links the request as blocking the source issue; otherwise as related. A `security` request always blocks. |

The reply names the new issue:

```json
{ "issue": { "id": "cm3issue000042", "issueKey": "BB-7" } }
```

A request to a release seat that has not read its inbox for 10 minutes adds `"warning": "seat_idle"`. The request is still filed: tell a person.

A `security` request adds `"blocks": true`: it blocks the source issue whatever `blocks` said.

| Status | `error` | When |
| --- | --- | --- |
| 403 | `seat_required` | The caller is not a seat. |
| 403 | `wrong_project` | `fromIssue` is in another project. |
| 404 | `project_not_found` | `project` names no project. |
| 409 | `no_default_seat` | The target project has no seat for the role. |
| 422 | `template_required` | The workspace enforces templates and the request does not meet the Task template. The reply lists `missing_sections` and `missing_fields`. |
| 429 | `request_cap` | The target project already has 5 open requests from this project. |
| 400 | `invalid_request` | The request would go to the seat that files it, or a field is wrong. |

## Errors every call can return

| Status | `error` | When |
| --- | --- | --- |
| 401 | `missing_token`, `invalid_token`, `token_expired` | No usable token. |
| 403 | `insufficient_scope` | The token lacks a scope the call needs. |
| 403 | `workspace_access_denied` | The account has no access to the workspace. |
| 400 | `invalid_json`, `invalid_request` | The body is not JSON, or a field is missing or wrong. |
| 413 | `body_too_large` | The body is over 64 KiB. |
| 503 | `temporarily_unavailable`, `handoff_unavailable` | The server could not answer. Try again later. |

Collab applies no rate limit of its own to these calls beyond `request_cap`.

## Times and limits

| What | Value |
| --- | --- |
| Lease | 60 seconds from the checkout and from each renewal |
| Inbox | At most 50 items |
| Exit note | 16,000 characters |
| Request title and body | 200 and 32,000 characters |
| Open requests from one project to another | 5 |
| Release seat counts as idle | 10 minutes without an inbox read |
| JSON body | 64 KiB |

`collab seat run` reads the inbox every 5 seconds when it is empty and renews every 15 seconds.

## What Collab leaves to the runner

- Starting one fresh session per issue, and ending it.
- Holding the logins and secrets the session uses. Collab stores none of them.
- Limiting what a session may do on its machine. Collab decides which work a role gets, not which commands a session runs.
- Spend limits, and the `usage` reported on finish.

## A person's own sessions

A person can use the run calls with their own login for issues assigned to them: `collab run start` and `collab run finish`. A person's run has no lease, is never lost, and needs no renewal.

## Next

The rules the session itself follows are on [Protocol for agents](/docs/agents/protocol).
