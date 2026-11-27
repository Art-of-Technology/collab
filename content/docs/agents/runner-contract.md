# Runner contract

The seven HTTP calls a program makes to run sessions for a seat, with what each one takes and what it returns.

A runner is the program that starts a session for each issue of a seat. Collab decides which issue is next and who may work it, and sends the [repository](#the-repository) and the [instructions](#the-instructions) with it: nobody types either into a runner. The runner decides how the session is run. `collab seat run` is a small runner built on these calls: see [Run a seat from the CLI](/docs/agents/seats#run-a-seat-from-the-cli).

## Before you start

- Every call is under `/api/apps/auth` on the Collab server and carries the seat's token: `Authorization: Bearer TOKEN`.
- The token needs the scopes `issues:read` and `issues:write`.
- A success is HTTP 200 with a JSON body, also for a checkout and a new request.
- An error is `{ "error": "<code>", "error_description": "<text>" }`. Some errors add keys, named below.
- A JSON body holds at most 64 KiB. A key the call does not know is refused with `400 invalid_request`.
- Text fields must not be empty. They are trimmed except for the question in an `ask`.

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
| `PATCH runs/{id}` | Renews the lease, asks the seat owner a question, finishes the run, or confirms the session is gone. |
| `GET issues/{key}/run-context` | Gives a fresh session what it needs in one read. |
| `POST seats/me/requests` | Files a request for another seat. |

## The loop

1. Read the inbox. If it is empty, wait and read again. Nothing is pushed to a runner.
2. Check out the first issue. On `409`, do not retry it: try the next issue of the same read. The exception is `repository_required`: keep that issue and try it again at the next read of the inbox after a seat pick or project default resolves.
3. Start a fresh session for the issue. Give it the issue key, the run id, the generation and the repository the checkout named. Put the [instructions](#the-instructions) from the run context at its start, in their order.
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
  "scope": "project",
  "project": { "id": "cm3proj0000001", "name": "Website", "issuePrefix": "AA", "agentMode": "handoffs" }
}
```

- `scope` is `project` or `workspace`. A seat of the whole workspace has `projectId: null` and `project: null`.

- The [built-in role](/docs/agents/roles-and-layers#the-roles) is `developer`, `reviewer`, `release`, `security`, `lead`, `planner` or `docs`. `ownerId` is a person's id or `null`.
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
- A seat of the whole workspace gets the issues assigned to it in every project its account can read. Each of its items also has `project`: `{ "id", "name", "issuePrefix" }`.
- `reason` is `resume`, `review_returned`, `reply`, `blocker_resolved` or `assigned`, and for a lead seat also `child_done`, `child_blocked`, `child_idle`, `child_no_room` or `other_child_done`. What each means is under [What a seat works on next](/docs/agents/seats#what-a-seat-works-on-next).
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

The reply is the run and the repository to work in:

```json
{
  "run": {
    "id": "cm3run00000001", "issueId": "cm3issue000001", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11",
    "state": "running", "outcome": null, "note": null, "ask": null, "usage": null,
    "leaseUntil": "2026-11-16T10:01:00.000Z", "startedAt": "2026-11-16T10:00:00.000Z", "endedAt": null
  },
  "repository": { "id": "cm3repo0000001", "provider": "github", "name": "acme/app", "url": "https://github.com/acme/app", "defaultBranch": "main" }
}
```

The checkout moves the issue to the project's first active "in progress" status. It stays where it is if it is already in that group or the project has no active status in that group.

| Status | `error` | When |
| --- | --- | --- |
| 404 | `not_found` | The issue is not in the workspace, or it is in Trash. |
| 403 | `wrong_project` | The issue is in another project than the seat's. A seat of the whole workspace is not refused this way for an issue of its workspace that its account can read. |
| 403 | `not_assigned` | The issue is assigned to someone else. |
| 403 | `seat_required` | The token is an agent token that is not a seat. |
| 409 | `repository_required` | Several repositories are connected and neither the seat's pick nor the project default resolves. Ask an administrator to choose a default in Project settings. The checkout can be repeated once a pick or default resolves, and `collab seat run` 0.14.3 and later waits for the issue rather than leaving it alone. |
| 409 | `already_running` | A run is open on the issue. Take the next issue; do not retry. |
| 409 | `needs_person` | The open run on the issue is lost. The runner that holds it closes it, or a person clears it. |

A project connected to Forge takes no runs: `409 forge_connected_project`.

## The repository

Collab sends the repository with each checked-out issue, so no address is typed into a runner. It is the repository of the **issue's** project, not of the seat's project.

| Key | Value |
| --- | --- |
| `id` | The repository's id in Collab. For an address typed on the project, the project's id. |
| `provider` | `github` for a repository connected by the GitHub sign-in, `address` for an address typed on the project, otherwise the connection's own provider, in lower case. |
| `name` | The path at the provider, `owner/name`. |
| `url` | What the runner clones. |
| `defaultBranch` | The default branch where Collab knows it, else `null`. |

- The role is read first: `repository` is `null` when the seat's role works in none, whatever its project has. A lead seat hands work out and gets `null`; so does a person's own run. The checkout and the run context answer the same for an issue.
- For a role that works in one, Collab works out one repository: the project's only connected repository; with several, the seat's own pick, else the project's default for agents; with none connected, the address typed on the project. The same repository connected twice, by the GitHub sign-in and as a connection, is one; the same path at two servers is two.
- The seat's pick is made when the seat is created, among the active repositories connected to the seat's project: see [Which repository](/docs/agents/create-a-seat#which-repository). A pick whose repository is connected no more is passed over, and the seat follows the project again.
- A typed address is an `https` address with no user name, password, query or fragment, saved by someone with the **Manage agent seats and tokens** permission on a project that has no connected repository. Collab knows no provider and no branch for it: `provider` is `address`, `name` is the address's path without `.git`, and `defaultBranch` is `null`. A repository connected later comes before it.
- In Project settings, under repository connections, anyone with the **Manage agent seats and tokens** permission can select the default repository for agents. One connected repository is automatically the default. Only active connections in the issue's project can resolve as its default. What was chosen is the repository and not the row it was connected by: connecting the same repository a second time, or switching off the row the choice was saved as while another of the same repository stays, keeps the default.
- With several repositories, if neither the seat's pick nor the project default resolves, checkout for a role that works in a repository returns `409 repository_required` before creating a run. Ask an administrator to choose a default in Project settings.
- With no connected repository and no typed address, checkout still returns `repository: null` and starts the run, preserving compatibility with runners that have a configured copy.
- No token, secret or credential is ever in the reply. The runner clones with its owner's own sign-in.

## The run object

Every run call returns the run with these keys:

| Key | Value |
| --- | --- |
| `id`, `issueId`, `generation` | Text. |
| `state` | `running`, `waiting`, `finished`, `stopped` or `lost`. |
| `outcome` | `done`, `in_review`, `blocked`, or `null` while the run is open. |
| `note` | The exit note, or `null`. |
| `usage` | What the finish reported, or `null`. |
| `leaseUntil` | When the lease ends. It is not cleared when the run ends. |
| `startedAt`, `endedAt` | Timestamps. `endedAt` is `null` while the run is open. |

The key `ask` is `null` until a question is sent. On an open run with questions it is an array in the order they were sent. Each entry has `id`, the `text` exactly as sent, and `answer`. The answer is `null` until the owner answers. Once answered, it has `decision` (`approved` or `refused`), `text` (the optional reply, or `null`), `userId` (the person who answered) and `at` (Collab's timestamp for the answer). For example:

```json
{
  "id": "0486014d-905c-46c1-8867-24fe46205d83",
  "text": "Step: deploy\nCommit: 0123456789abcdef",
  "answer": { "decision": "approved", "text": null, "userId": "cm3user0000001", "at": "2026-11-16T10:00:42.000Z" }
}
```

The run returns `ask: null` once it ends. The issue's timeline keeps the answer record.

The read, renewal and ask replies also include `run.issueKey` and a top-level `now` timestamp from Collab. Use `now` and `answer.at` to measure the age of an answer by Collab's clock.

A run is **lost** when its lease lapsed without a renewal. A lapsed lease does not prove the session stopped, so a lost run stays open: the issue is not offered and cannot be checked out until the run is closed or a person clears it. Collab notices a lapsed lease the next time the inbox or a run is read or written.

## Renew the lease: PATCH runs/{id}

Needs `issues:write`.

```json
{ "event": "renew", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11" }
```

The reply is `{ "run": { ... }, "now": "2026-11-16T10:00:20.000Z" }` with `leaseUntil` 60 seconds from now. A waiting seat run keeps its lease even while no session is running. The runner renews it on the same schedule.

A renewal is refused with `409 run_fenced` when the generation is not the run's, the run has ended or is lost, or the issue was given to someone else. After `run_fenced`: stop the session, then close the run.

## Ask the seat's owner: PATCH runs/{id}

Needs `issues:write`, the run holder's token and its generation.

```json
{ "event": "ask", "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11", "ask": "Step: deploy\nCommit: 0123456789abcdef" }
```

`ask` is nonblank plain text of up to 16,000 characters. Spaces and line breaks are preserved. Collab gives the question its own ID, puts the run in `waiting`, notifies the owner in Collab and returns `{ "run": { ... }, "now": "..." }`. The notification tells the owner to open the issue in Collab and select **Activity**.

The holder cannot edit, replace, withdraw or answer a question. A second ask while a question is open returns `409 question_open`. After the owner answers, the run returns to `running` and may ask again. The runner reads the question history to tell whether the owner answered. A seat without an owner who can read the issue gets `409 owner_required`. A person's own run gets `403 seat_required`. A wrong generation, lost lease, ended run or changed assignee gets `409 run_fenced`.

The owner reads the question above the issue timeline. Each original line has a number, and its wrapped text stays under that number. Collab renders the text as sent, including Markdown markup or URLs as literal text. The owner chooses **Approve** or **Refuse** and can include a reply of up to 4,000 characters.

Collab accepts an answer only as a same-origin JSON POST from its own browser cookie session for that owner. The POST names the specific question ID. CLI logins, OAuth grants (including MCP), seat or other agent tokens, and gateway identities cannot answer. Opening a link or replying to a notification cannot record an answer. An answered question stays bound to its ID. A duplicate submission, a submission for an earlier question or a submission after the run ends or is lost returns `409 question_not_open`. The timeline shows who answered and when.

The current browser session is sufficient. Fresh Google or Maestro sign-in or a passkey would require separate work. A browser controlled by someone else, or a copy of the owner's valid session cookie, can act as the owner.

## Finish the run: PATCH runs/{id}

The session that did the work finishes the run. Needs `issues:write`. A `waiting` run can finish the same way as a `running` run. An open question expires with the run.

| Field | Required | What it is |
| --- | --- | --- |
| `event` | yes | `"finish"`. |
| `generation` | yes | The run's generation. |
| `outcome` | yes | `done`, `in_review` or `blocked`. |
| `note` | yes | The exit note, up to 16,000 characters, with the headings `## Done`, `## Decisions`, `## Evidence` and `## Next`, each on a line of its own. |
| `reviewRequest`, `blockedBy`, `askedUser` | see below | What the issue waits for. |
| `ask` | only with `askedUser` | What the person is asked: a decision or work for their hands. See [Say what the person is asked](#say-what-the-person-is-asked). |
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
| 422 | `exit_note_required` | `missing`: the headings not found, or the fields to correct | The note lacks a heading; `pullRequest` or `headCommit` is malformed or comes without the other; `nextStep` is malformed; `in_review` or `blocked` has no next step; or `ask` is malformed, with the place in `missing`, such as `ask.questions.0.options`. |
| 422 | `exit_state_required` | `missing`: the fields to supply | The outcome lacks what it waits for, a security request finishes `done` without `verdict` or `reviewed`, or the finish names something that cannot bring the issue back: a request or blocker that is done or not linked, a person who is not an active member, a status outside the outcome's group. Also `ask` without `askedUser`, and `askedUser` without `ask` on a deployment that requires it. |
| 400 | `invalid_request` | | A field has the wrong type, the outcome does not take it, an unknown key is supplied, or `usage` is not complete. |
| 409 | `run_fenced` | | The run is not the one working the issue any more. If the generation matches and the run had not finished already, the note is kept on the issue's timeline as a late exit note. |
| 404 | `not_found` | | The run is not the caller's, or its issue is in Trash. |

### Say what the person is asked

A finish that names a person with `askedUser` can say what it asks of them in `ask`. Collab's Home page shows the person the question or the steps from these fields. Without `ask`, Home reads them out of the seat's last comment on the issue.

| `kind` | Use it when | Fields |
| --- | --- | --- |
| `decision` | The person has to choose. | `questions`: 1 to 5. Each has `question` (up to 2,000 characters), `options` (2 to 4 different reply words) and, optionally, `suggested` (one of its options). |
| `hands` | The person has to do something. | `steps` (what to do, up to 4,000 characters) and `doneWord` (the reply word that says it is done). |

A reply word is what the person sends back as a comment on the issue: at most 40 characters, with no line break and no slash.

```json
{
  "event": "finish",
  "generation": "5b1f0c1e-6f0a-4a57-9a43-2f1f6f1f0a11",
  "outcome": "blocked",
  "askedUser": "cmexampleperson0000000001",
  "nextStep": "Run the migration the way the answer says",
  "ask": {
    "kind": "decision",
    "questions": [
      { "question": "Run the migration in tonight's window, or split it into two releases?", "options": ["window", "split"], "suggested": "split" }
    ]
  },
  "note": "## Done\n...\n\n## Decisions\n...\n\n## Evidence\n...\n\n## Next\n..."
}
```

```json
"ask": { "kind": "hands", "steps": "1. Open the repository's settings.\n2. Add the pull request event to the webhook.", "doneWord": "webhook added" }
```

- The reply belongs on the issue that stopped: `ask` names no other issue. One question is answered on Home with a button per reply word; several are shown with their reply words and a link to the issue.
- A comment by anyone other than the seat brings the issue back to the seat's inbox with reason `reply`. After the finish, any such comment counts. Before the finish, only a person's comment counts, and only when it is later than the seat's last comment of that run: a comment by another seat or agent account in that time is not the person's answer.
- `ask` is optional unless the deployment sets `COLLAB_STOP_ASK_REQUIRED=true`. With that setting, a finish with `askedUser` and no `ask` is refused with `422 exit_state_required` and `"missing": ["ask"]`. It is off by default, there is no setting per workspace, and a finish that names no person is not affected.

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

Needs `issues:read`. Returns `{ "run": { ... }, "now": "..." }` for a run the token's account holds, also after it ended. Any other run gets `404 not_found`.

Read the run after the session exits: `state` tells you whether it finished.

## Read the run context: GET issues/{key}/run-context

Needs `issues:read`. The session reads this first. Any token that can read the workspace's issues may call it.

| Key | What it is |
| --- | --- |
| `issue` | `id`, `issueKey`, `title`, `description`, `type`, `priority`, `projectId`, `status`, `category`, `assigneeId` and `agentRequestRole`. |
| `repository` | The repository of the issue's project, as [above](#the-repository), or `null`: the read answers what that issue's checkout answers, and a project that works none out returns `null` in the context (an ambiguous checkout is refused). |
| `instructions` | The seat's instructions in three layers, in the order to give them to the session: `platform`, `organisation`, `seat`; four, with `role` before `seat`, for a seat with one of the workspace's own roles. See [below](#the-instructions). |
| `lastExitNote` | The note of the last run that finished, or `null`. |
| `lastExitFacts` | `null` if no run finished; otherwise `pullRequest`, `headCommit` and `nextStep`, each `null` when the last finished run supplied none. |
| `movedFrom` | `null`, unless the last run that finished was another account's than the assignee. Then `seat`, `pullRequest`, `headCommit` and `branch` may each be `null`, and `first` says what the session does before anything else. See [the handoff protocol](/docs/agents/protocol#when-the-issue-was-moved-to-you). |
| `commentsSince` | The comments made after that run ended, oldest first: `id`, `content`, `createdAt`, `parentId` and `author` with `id` and `name`. All comments when no run has finished. When that run named a person and a person answered before it finished, after the seat's last comment of that run, it starts with that answer. |
| `blockers` | The issues linked as blocking this one. |
| `requests` | The requests linked to this issue. |
| `requestFor` | When the issue is itself a request: the issues it was filed for. |
| `children` | Only when the issue has child issues: up to 100, oldest first. Each has the keys below, and `assigneeId`, `assignee` (the name) and `lastRun`: `null`, `running`, `stopped` or the outcome of its last run. When the lead seat itself reads, each also has `movedOff`, the user IDs of seats the child was moved off. |
| `lead` | Only when the issue is assigned to a lead seat: `cap`, and `seats`, the project's other seats and the workspace's Developer seats, each with `userId`, `name`, `role` and `openFromLead` (for a workspace seat, from every project's lead together). For the lead seat itself, each also has `owner`, `room` and `openRuns`, and the seats of a role are ordered [by room](/docs/agents/seats#what-the-lead-is-given). |
| `commands` | `collab` commands that fetch the rest and end the session's work. |

An issue in `blockers`, `requests`, `requestFor` or `children` has `id`, `issueKey`, `title`, `projectId`, `status` and `category`. A request also has `requestRole`; a security request that has its verdict also has `verdict` and `reviewed`.

### The instructions

`instructions` is a list of three, in this order, or of four for a seat with one of the workspace's own roles. Put each layer's `text` at the start of the session in the order of the list; a later layer adds to an earlier one. Read the list as it comes, not by position. Who writes each layer, and where, is on [Roles and layers](/docs/agents/roles-and-layers).

```json
"instructions": [
  { "layer": "platform", "text": "2. Do the work on the current branch. ..." },
  { "layer": "organisation", "text": "" },
  { "layer": "seat", "text": "" }
]
```

| Layer | What it holds | At most |
| --- | --- | --- |
| `platform` | Collab's prompt for the seat's role, the same in every organisation. Collab ships it, and a Collab system admin can replace it on the admin Roles page; a run gets the text in force when it started. The seat owner's user id stands where it names the person to ask. | 8,000 characters |
| `organisation` | What the workspace adds for the role. | 16,000 characters |
| `role` | Only for a seat with one of the workspace's own roles: that role's instructions. The seat's `role` is then the built-in role it behaves like, and the first two layers are that role's. | 16,000 characters |
| `seat` | What this seat adds. | 16,000 characters |

- The layers are those of the seat the issue is assigned to. An issue assigned to no seat, or to a retired one, gets the three layers with empty text.
- A layer with nothing in it is present with `"text": ""`. The organisation layer is what the workspace saved for the seat's role under Workspace settings, Roles; the seat layer is what was saved under **Instructions for this seat** on the seat's own page (open the seat's name under **Agents**, **Seats**).
- Each maximum is checked when the layer is saved.
- How the session hands its result back is the runner's own rule and not a layer.
- `collab seat run` 0.16.0 and later writes the layers to a file named in `COLLAB_INSTRUCTIONS_FILE`: see [Run a seat from the CLI](/docs/agents/seats#run-a-seat-from-the-cli).

## Acks

Under a person's comment, Collab shows whether a seat has taken it in. Collab records this itself. A runner and a session call nothing new, and no scope, command or CLI version is added.

| When | For which comments |
| --- | --- |
| A seat starts a run: `POST /api/apps/auth/runs` | The person comments in that run's `commentsSince` window. |
| The seat's own token reads `GET /api/apps/auth/issues/:key/comments` or the run context while the seat has a run open on that issue | The person comments in the answer. |

A comment written while the seat is in a run is not acked by that run's start. It is acked when the session reads comments, or by the next run's start.

- If recording fails, the run still starts and the read is still answered.
- An ack never wakes a seat and never changes an inbox.
- An ack is stored as a comment reaction of type `ack`, under the seat's account. `reactionCounts` on the token route therefore gains an `ack` count. Likes are counted as before.
- The ack does not record which run took the comment in, or whether it was at the start of a run or by a later read.

Each comment and reply in the comment list answer has one added field, `ack`. It is `null` when no line is shown, and otherwise:

```json
{
  "state": "acked",
  "seats": [{ "userId": "cm3user000001", "name": "Developer", "at": "2026-11-27T10:00:09.000Z" }]
}
```

| Key | What it is |
| --- | --- |
| `state` | `acked`, `waiting` or `none`. |
| `seats` | The seats that took the comment in, oldest first: `userId`, `name`, `at`. |
| `waitingFor` | With `waiting`: the seat that holds the issue. |
| `reason` | `in_run` or `runner_silent` with `waiting`; `issue_done` or `not_holder` with `none`. |
| `missed` | Names of mentioned seats that do not hold the issue. |

`waitingFor`, `reason` and `missed` are present only when they apply. Fields only get added: nothing an answer carried before has changed.

## File a request: POST seats/me/requests

Needs `issues:write`. Only a seat may call it.

| Field | Required | What it is |
| --- | --- | --- |
| `role` | yes | `developer`, `review`, `release`, `security` or `docs`. |
| `title` | yes | Up to 200 characters. |
| `body` | yes | Up to 32,000 characters. When the workspace enforces templates, it must include the sections of its Task template. |
| `fromIssue` | yes | The key or id of the issue the request comes from. It must be in the seat's own project. |
| `project` | no | The target project's id or issue prefix. Without it, the seat's own project. |
| `blocks` | no | `true` links the request as blocking the source issue; otherwise as related. A `security` request always blocks. |

The reply names the new issue:

```json
{ "issue": { "id": "cm3issue000042", "issueKey": "BB-7" } }
```

A request to a release seat that has not read its inbox for 10 minutes adds `"warning": "seat_idle"`. The request is still filed: tell a person. The same warning is added when placement chooses among multiple seats and all are known to have no room.

When a review, security or release request has more than one seat that could take it, Collab [places it by room](/docs/agents/seats#where-a-request-goes) and the reply says where it went:

```json
{ "issue": { "id": "cm3issue000042", "issueKey": "BB-7" }, "placed": { "seat": "Reviewer (Bob)", "why": "most room" } }
```

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
| Pairing code | Works once, for 15 minutes |
| Token fetched by a runner | 30 days |
| Renewed from | 7 days before it runs out |
| Room figure counts as unknown | 15 minutes after it arrived |
| Runner counts as offline | 10 minutes without a `seats` call |
| Eligible work no run has started on can move | 10 minutes without room |
| Started work can move, between runs, when its last run pushed | 30 minutes without room |

`collab seat run` reads the inbox every 5 seconds when it is empty and renews every 15 seconds.

## What Collab leaves to the runner

- Starting one fresh session per issue, and ending it.
- Making the working copy of the repository Collab names: cloning it, and the branch the session works on.
- Holding the logins and secrets the session uses. Collab stores none of them.
- Limiting what a session may do on its machine. Collab decides which work a role gets, not which commands a session runs.
- Spend limits, and the `usage` reported on finish.

## A runner fetches its seats

A runner can get its seats' tokens from Collab instead of having them entered by hand. These two calls are under `/api/runner`, not `/api/apps/auth`, and neither takes a seat's token. People's steps are on [Connect a runner](/docs/agents/admit-a-runner).

| Call | Carries | Does |
| --- | --- | --- |
| `POST /api/runner/pair` | Nothing | Starts a pairing: answers with the runner's credential and a code to show. |
| `POST /api/runner/seats` | The runner credential | Lists the runner's seats, with a token for each seat whose token the runner does not hold or whose token is in its last week. Can also [report room](#report-room). |
| `POST /api/runner/goodbye` | The runner credential | Says the runner is going: its tokens are revoked at once and its credential stops working. |

1. Call `pair` once. Keep the credential in a file only the runner's user can read. Show the code to the person.
2. Call `seats` about once a minute, not more often. Until a person has typed the code into Collab it answers `403 runner_pending`.
3. Keep each token you are given. Send the ids of the tokens you hold as `have` on every call: `{"have":[]}` only while you hold none, because every new token costs the server work.
4. When an answer carries a token for a seat you already have one for, that is a renewal: start using the new one. The token it replaces ends on your first request with the new one.
5. When a seat is no longer in the answer, stop running it and delete its token.
6. To report room, add `state` and `rooms` to the same call: see [Report room](#report-room).
7. Before the machine is deleted on purpose, call `goodbye` as the last act.

```sh
curl -X POST -H "Content-Type: application/json" -d '{"name":"seat-runner on build-1"}' https://collab.example.com/api/runner/pair
```

```json
{ "code": "K7QF-M2XD", "credential": "collab_rc_...", "expiresAt": "2026-11-16T10:15:00.000Z" }
```

```sh
curl -X POST -H "Authorization: Bearer $RUNNER_CREDENTIAL" -H "Content-Type: application/json" -d '{"have":["cmw..."]}' https://collab.example.com/api/runner/seats
```

```json
{
  "runner": { "id": "cmw...", "name": "seat-runner on build-1", "workspaceId": "cm8...", "ownerId": "cm8..." },
  "seats": [
    { "id": "cmw...", "name": "App Developer", "role": "developer", "project": { "id": "cm9...", "name": "App", "issuePrefix": "APP" },
      "tokenId": "cmw...", "expiresAt": "2026-12-16T10:02:11.000Z", "token": "collab_at_..." }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `tokenId`, `expiresAt` | The token to use for the seat: the newest one you said you hold, or the new one. |
| `token` | Present only when the token is new. It is sent once and never again. |
| `problem` | Present when no token could be made this time, beside whatever token you already hold. Ask again later. `paused` means the seat's agent is switched off or removed: asking never switches it on again, a person does. |
| `refused` | Beside `runner` and `seats`, when any reported figures were not stored: the ids of those seats. See [Report room](#report-room). |
| `refusedRuns` | Beside `runner` and `seats`, when any runs under `ended` were not eligible: the ids of those runs. See [Report the program a run used](#report-the-program-a-run-used). |

A seat for which you hold no usable token gets a new one. With three overlapping asks, the first answer can arrive last with a revoked token. If a retained token is refused, ask again with what you hold to get a new one. If an answer or file is lost, ask again with what you hold.

### Report room

Room is the percent of allowance a seat has left on the program it would run next. A runner can send it with the `seats` call it already makes, so no extra call is needed.

```json
{
  "have": ["cmw..."],
  "state": "working",
  "rooms": [
    { "seat": "cmw...", "room": 60, "program": "Claude Code" }
  ]
}
```

| Field | Type | What it is |
| --- | --- | --- |
| `state` | `working`, `paused` or `disk_full` | How the runner itself is. Collab keeps it until you send another, so send it with every call. |
| `rooms` | list, up to 1000 entries | One entry per seat you report for. A seat appears at most once. The body as a whole stays within 64 KiB, which long names reach before 1000 entries. |
| `seat` | text, 1 to 128 characters | The seat's `id`, as the answer of this call lists it. |
| `room` | whole number, 0 to 100 | Percent of allowance left, after your own hold-back. `0` means no room: the allowance is used up, or the seat cannot run now for a reason of your own (switched off, paused, or no program signed in). Collab reads it as "its runner reports no room". |
| `program` | text, 1 to 64 printable ASCII characters after trimming | The name of the program the seat would run next, such as `Claude Code`. Collab stores the trimmed name. |

Both `state` and `rooms` are optional. In an entry of `rooms`, all three fields are required.

- **Only percentages and program names are sent.** No login, account, plan or billing detail is ever sent: a runner has no field to put one in, and any other key is refused.
- Collab stores a figure with the time it arrived, by its own clock. Send the figures with every call: a figure at least 15 minutes old counts as unknown.
- A seat that is retired and made again, or given another project, role or owner, starts with no figure. A figure stays when its person's runner is replaced, because it is the same person's allowance: send the figures with your first call after pairing.
- A call without `state` and `rooms` stores no state and no figure, and is answered exactly as before.
- A value outside the table is `400 invalid_request`, and a body over 64 KiB is `413 body_too_large`. Nothing of that call is stored and no seats are answered.
- A figure for a seat that this call's answer does not list is not stored. The call is still answered, and the answer names those seats' ids under `refused`. That happens when a seat was retired since your last call: stop running it, as in step 5.

What Collab makes of it:

| A seat reads as | When |
| --- | --- |
| A number | Its figure is newer than 15 minutes and above 0, and its runner called within the last 10 minutes and did not say `paused` or `disk_full`. |
| No room | No runner is connected for the seat's person, or the runner has not called for 10 minutes (offline), or it said `paused` or `disk_full`, or the seat's fresh figure is `0`. |
| Unknown | The seat is run by hand, or its runner is connected, online and working but no figure was sent or the figure is at least 15 minutes old. |

A runner that never sent a `state` counts as working. What a runner says about itself comes before the figure: the seat of a paused runner has no room, however new its figure is.

Eligible work can move after a seat has had no room: see [When a seat has had no room for 10 minutes](/docs/agents/seats#when-a-seat-has-had-no-room-for-10-minutes). Keep sending `state` and the figures with every call, also while you are paused or at your cap.

Collab places work by the figure: see [Placed by room](/docs/agents/seats#placed-by-room). It shows the figure under **Agents**, **Seats**, to the seat's owner and to anyone with the **Manage agent seats and tokens** permission: see [Room on the Seats tab](/docs/agents/overview#room-on-the-seats-tab).

### Report the program a run used

The issue can show whose allowance a finished or lost run used and its program: see [Give a seat work](/docs/agents/give-a-seat-work). Send the program with the same `seats` call, once a run has ended:

```json
{
  "have": ["cmw..."],
  "ended": [
    { "run": "cmw...", "program": "Codex" }
  ]
}
```

| Field | Type | What it is |
| --- | --- | --- |
| `ended` | list, up to 100 entries | One entry per run that ended since your last call that was answered with `200`. A run appears at most once. Optional. |
| `run` | text, 1 to 128 characters | The run's `id`, as `checkout` answered it. |
| `program` | text, 1 to 64 printable ASCII characters after trimming | The program the run used, the same names as in `rooms`. |

- In an entry, both fields are required and no other fields are allowed. A value outside the table is `400 invalid_request`, and nothing of that call is stored.
- A run is stored only when it is a run of a seat this call's answer lists. The first program stored for a run stays: a later entry for the same run is ignored, not an error.
- A run that is not of your seats, or does not exist, is not stored. The call is still answered `200`, and the answer names those runs' ids under `refusedRuns`. Every such run reads the same.
- A call without `ended` is answered exactly as before.

### Renewal

A fetched token lasts 30 days. Once it has a week or less left, your next ask carries a new token for that seat as well, and both work:

- Start using the new token. Your first request with it ends the one before, so the seat is never without a valid token.
- Until you use it, the old token keeps working to its own expiry. A renewal nobody picks up is shown to people as "Renewal not picked up"; it stops nothing.
- A token also ends when a second newer one is made for the same seat: you hold at most two usable tokens for a seat.
- A runner that is away for the whole week comes back to an expired token. Ask with what you hold: a seat whose token ran out gets a new one. While it is out, the seat's work waits and whoever files a request for it is told.

Nothing is renewed for a seat run by hand. Those tokens keep the expiry they were made with.

| Error | When |
| --- | --- |
| `403 runner_pending` | No person has connected the runner yet. Ask again. |
| `401 runner_refused` | The credential is unknown, the runner was removed, replaced or said goodbye, its person left the workspace, or the pairing ran out after 15 minutes. Stop every seat and pair again. |
| `429 pairing_busy` | 50 pairings are waiting on this server. Try `pair` again in a few minutes. |
| `400 invalid_request` | A field is missing or wrong, or the body has a key the call does not know. |
| `413 body_too_large` | The body is over 64 KiB. |

## Say goodbye: POST /api/runner/goodbye

Carries the runner credential and no body. Call it once, as the last thing the runner does, when its machine is being deleted on purpose.

```sh
curl -X POST -H "Authorization: Bearer $RUNNER_CREDENTIAL" https://collab.example.com/api/runner/goodbye
```

```json
{ "revokedTokens": 2 }
```

- Every token this runner fetched is revoked at once, and the credential is refused from then on: `401 runner_refused`. Its seats show no runner until a runner is connected again.
- Saying it twice, or with an unknown credential, is `401 runner_refused`.
- A machine that is lost says nothing. Expiry is the backstop for that: its tokens stop within 30 days.
- A runner that comes back pairs again and is connected again.

A runner credential reads no issue, and every other call refuses it. The runner can also report its own state and its seats' room.

## A person's own sessions

A person can use the run calls with their own login for issues assigned to them: `collab run start` and `collab run finish`. A person's run has no lease, is never lost, and needs no renewal.

## Next

The rules the session itself follows are on [Protocol for agents](/docs/agents/protocol).
