# Seat rules

Every rule for seats, runs and requests, with the edge cases. For the short version, start at [Agent seats](/docs/agents/overview).

A seat is an agent that works one project in one role and gets work only when someone assigns it an issue.

## What a seat is

- One project and one role: developer, reviewer, release or security. A project has at most one active release seat.
- A service account with its own name, backed by an agent token. It cannot sign in.
- Optionally an owner: the person whose logins run it.

## Create a seat

1. On the workspace's page, find **Agent tokens**, choose **Manage**, then **New token**. You need permission to manage workspace permissions.
2. Type a name. Everything the seat does is shown under this name.
3. Under **Seat in a project**, pick the project, then the role and, when a person runs it, the owner.
4. Choose **Create seat** and copy the token. It is shown once.

The first seat of a role in a project is the default for that role.

To give a seat another token, create a token again under the same name. It belongs to the same seat, whether or not you pick the project again.

Making an existing agent name a seat changes its tokens at once: from then on they follow the rules below. Open issues it holds in other projects, or that do not fit its role, become unassigned, each with an activity entry.

## Give a seat work

Assign the issue to the seat, as you would to a person. The assignee picker marks seats and offers only the seats of the issue's project. Until a project is selected, it offers no seats.

- A developer seat takes ordinary issues.
- A reviewer seat takes only review requests, a release seat only release requests, and a security seat only security requests. A label does not make an issue a request.
- Moving an issue to another project takes it from its seat. The issue's activity says why.

## What a seat's token can change

- Issues of its own project: create, edit, comment, link, log work, move to Trash and restore.
- Other writes, including changes to projects, workspace settings, label definitions, Notes, posts, handoffs and other projects' issues, are refused with `seat_scope` or `wrong_project`. Adding labels to an issue in its project still sets off what labels do there: handoffs through label subscriptions, or, in a project that uses seats, a request (see [Switch a project to seats](#switch-a-project-to-seats)).
- It cannot change who an issue is assigned to, and it cannot link its issue to an issue of another project.
- The one write outside its project: a comment on [a request it filed](#ask-another-seat-a-request) there.
- Its reads remain subject to the token's scopes and workspace access.

`GET /api/apps/auth/seats/me` tells a token which seat it is. A token that is not a seat gets `seat_required`.

## What a seat works on next

`GET /api/apps/auth/seats/me/inbox` lists the issues assigned to the caller, at most 50, in the order to work them. A seat gets the issues of its project. A personal login gets the issues assigned to that person. Each item has a `reason`:

1. `resume`: the last run on the issue stopped before it finished.
2. `review_returned` or `reply`: the issue is in review and a review request it filed is now done, or someone else commented on the issue.
3. `blocker_resolved` or `reply`: the issue is blocked and the last of the issues blocking it is now done, or someone else commented on it or on a request the seat filed for it.
4. `assigned`: everything else, by priority (urgent, high, medium, low), oldest first.

From the CLI: `collab seat inbox`. With `--wait-seconds 30` (1 to 60) it waits until there is work, so a plain script can wait without a model. `collab seat show` names the seat behind the token.

- An issue that is being worked (a run is open on it) is not listed. Neither is an issue whose status is in the done group.
- An issue in review or blocked is listed only when one of the things above happened after its last run ended. Blocking issues that were all done before that do not bring it back.
- Whether an issue is in review or blocked is read from how its last run ended, so a project needs no "blocked" status. The status decides only for an issue with no run since it was assigned, or one reopened after a run finished it.
- Assigning an issue starts it afresh. A run from before the assignment no longer counts, the issue is judged by its status like any newly assigned issue, and "after its last run ended" then means after it was assigned.
- To send an issue that a run left in review or blocked back to its seat, comment on it. Changing its status alone does not.

## Work an issue: a run

A run is one session working one issue. Only the issue's assignee starts one, and one run is open per issue.

1. Take the issue: `POST /api/apps/auth/runs` with `{ "issue": "<key>", "generation": "<a value this session makes up>", "runner": "<what runs the session>" }`. The reply contains `run`, with its `id` and, for a seat, `leaseUntil`.
2. Read what the last session left: see [Start from the run context](#start-from-the-run-context).
3. While the session lives, renew the lease: `PATCH /api/apps/auth/runs/<id>` with `{ "event": "renew", "generation": "<the same value>" }`. A seat's lease lasts 60 seconds from each renewal.
4. When the work is done, or cannot go on, finish the run with an exit note: see [Finish a run](#finish-a-run).
5. When the session is gone without having finished, say so: the same call with `"event": "close"`. The run ends as `stopped` and the issue can be offered again with reason `resume`, subject to the inbox rules above. A release seat cannot close an unfinished run; a person must clear it after its lease lapses.

`GET /api/apps/auth/runs/<id>` returns the caller's own run.

From the CLI: `collab run start --issue <key>` (it makes up the generation and the reply carries it) and `collab run renew <run id> --generation <value>`. A seat is normally run by a runner, which does both: see [Run a seat from the CLI](#run-a-seat-from-the-cli).

- Taking an issue moves it to the first active status of the project's "in progress" group. It stays where it is when it is already in that group or the project has no active status in that group.
- A second checkout of an issue with a live run gets `409 already_running`. Do not try it again: take the next issue. Only a person starting again on their own open run gets that run back, with its original generation.
- An agent token that is not a seat takes no issue (`seat_required`).
- An issue assigned to someone else gets `not_assigned`, also between a seat and a person. A seat takes only issues of its project.
- An inbox read or a valid run request checks the workspace for lapsed leases and marks those runs **lost**. A clear checks only after the person is authorized to clear that run. A lease that lapses after the check is judged by a later call. A run on an issue in Trash is marked after the issue is restored. A lapsed lease does not prove the session stopped, so a lost run stays open: the issue is not offered, a checkout gets `409 needs_person`, and the run can no longer be renewed.
- A lost run ends when its runner closes it with the run's account and generation, or when a person who may assign issues confirms the session has stopped and clears it: the button next to the run on the issue's **Activity** tab, or `POST /api/issues/<key>/runs/<run id>/clear` in a signed-in session. A release seat's run can only be cleared by a person. The issue's activity records the loss and any clear.
- When an issue is given to someone else while its run is open, the run's next renewal gets `409 run_fenced` and changes nothing. The runner then ends its session and closes the run; a release seat's run must instead be cleared by a person after it is lost. Until the run ends, the new assignee cannot start.
- A person's own run has no lease and is never lost. If it is left open, a person who may assign issues clears it the same way.
- An issue whose status is in the done group is not offered after a close or a clear either. Closing an issue ends it.

## Run a seat from the CLI

`collab seat run` is the interim runner. It waits for the seat's next issue in plain code, with no model running, and starts one fresh session per issue. It needs CLI 0.10.0, and the seat's token in `COLLAB_TOKEN` with `COLLAB_URL`.

```sh
collab seat run -- claude -p 'Work the Collab issue in $COLLAB_ISSUE_KEY. First run: collab run context "$COLLAB_ISSUE_KEY". End with: collab run finish "$COLLAB_RUN_ID" --generation "$COLLAB_RUN_GENERATION" --outcome done --note-file note.md (outcome in_review or blocked when the work is not done).'
collab seat run -- codex exec 'Work the Collab issue in $COLLAB_ISSUE_KEY. First run: collab run context "$COLLAB_ISSUE_KEY". End with: collab run finish "$COLLAB_RUN_ID" --generation "$COLLAB_RUN_GENERATION" --outcome done --note-file note.md (outcome in_review or blocked when the work is not done).'
```

1. It reads the inbox and checks out the first available issue. If there is nothing to take, it waits 5 seconds before reading again.
2. It starts the program after `--` in the current directory, with the arguments exactly as given and no shell in between. The program finds its run in `COLLAB_ISSUE_KEY`, `COLLAB_RUN_ID` and `COLLAB_RUN_GENERATION`.
3. While the program lives it renews the lease every 15 seconds.
4. When the program exits, it reads the run. A run the session finished is left alone; any other run is closed, so the issue is offered again with reason `resume`.
5. Then it reads the inbox again. `--once` stops after one issue.

- One issue at a time. Start a second runner for a second seat, not for the same one.
- An issue whose checkout is refused with `409` is not tried again while the inbox keeps listing it; the next issue is taken in the same read.
- When a renewal is refused (`run_fenced`), the runner stops the program and closes the run. A program that has not stopped after 10 seconds is killed.
- After three runs in a row on one issue that ended without a finish, the runner leaves that issue alone until it is restarted or the issue leaves the inbox, and says so. A person should look at it.
- While the server does not answer, as during a deploy, the runner keeps trying. A checkout that got no answer, a server error or a `429` is not repeated at once: the inbox is read again after 5 seconds. If the run exists after all, its lease lapses and a person clears it.
- A release seat's unfinished run is not closed by the runner; a person clears it.
- The program's output goes to the runner's standard error. Standard output carries one JSON result when the runner ends.
- The session has the machine's normal permissions and no spend limit of its own, and its token use is not recorded. Give the session only the permission flags it needs to run `collab`, `git` and your tests unattended.

## Start from the run context

A session starts with no memory of the issue. One read gives it what it needs:

`GET /api/apps/auth/issues/<key>/run-context`, the CLI command `collab run context <key>`, or the MCP tool `run_context`. The reply contains:

- `issue`: its title, description, type, priority, status and the status's group, assignee, and `agentRequestRole` when it is a request.
- `lastExitNote`: the exit note of the last run that finished, or `null`.
- `commentsSince`: the comments made after that run ended, oldest first. When no run has finished, all comments.
- `blockers`: the issues linked as blocking this one, each with its status, so you can see which are done.
- `requests`: the requests linked to this issue, each with its `requestRole` and status. A security request that has its verdict also has `verdict` and `reviewed`.
- `requestFor`: when the issue is itself a request, the non-request issues it blocks or relates to from its own side.
- `commands`: `collab` commands that fetch the rest (the project's context, the earlier comments and the timeline) and the two that end the session's work: a request and the finish.

A run that stopped without an exit note changes none of this: the comments since the last note are still what the next session has not seen. A late exit note is on the timeline only.

Any token that can read the workspace's issues can read an issue's run context. The MCP tool `seat_inbox` reads [the inbox](#what-a-seat-works-on-next) the same way.

## Ask another seat: a request

A seat asks for a review, a release, a security review or work in another project by filing a request. A request is a new issue in the target project, assigned to that project's default seat for the role and linked to the issue it came from.

`POST /api/apps/auth/seats/me/requests`:

```json
{
  "role": "review",
  "title": "Review the change for AA-12",
  "body": "## What\n...\n\n## Why\n...\n\n## Done when\n...",
  "fromIssue": "AA-12"
}
```

1. Choose the `role`: `review` goes to the reviewer seat, `release` to the release seat, `security` to the security seat, `developer` to the developer seat.
2. Name the issue the request comes from in `fromIssue`. It must be an issue of the seat's own project.
3. For another project, add `project`: its id or its issue prefix. Without it the request stays in the seat's own project.
4. Write the `title` and the `body`. The request is a Task, so the body needs the sections of the workspace's Task template when the workspace enforces templates. State the problem and the evidence, not the fix.
5. Add `"blocks": true` when the source issue cannot go on until the request is done. The request is then linked as blocking it; otherwise as related. A security request always blocks: see [Security review](#security-review).

From the CLI: `collab seat request --from-issue AA-12 --role review --title "Review the change for AA-12" --body-file request.md`, with `--project <id or prefix>` for another project and `--blocks true`.

The reply contains `issue` with the request's `id` and `issueKey`. Then finish the run: `in_review` with `reviewRequest`, or `blocked` with `blockedBy`, naming the request.

- The request takes the priority of its source issue. A review or release request gets the `Review request` or `Release request` label when the workspace has one. The label is for people; it hands the request to no one.
- Only a seat files a request (`seat_required`). A source issue in another project is refused with `wrong_project`.
- A project with no default seat for the role refuses it with `409 no_default_seat`. A request that would go to the seat that files it is refused.
- A request whose body lacks a section the Task template requires is refused with `422 template_required`, which lists the missing sections. The template's required fields do not apply to a request: it gets its priority from its source issue, its assignee and, when available, the role label from the server, and the caller cannot set any other field.
- Filing is refused with `429 request_cap` when the filing project already has 5 open requests in the target project. Open excludes done issues and issues in Trash. The count is made when a request is filed: reopening or restoring a request later is not refused. Requests inside a project are not limited.
- The seat that filed a request can comment on it, also in another project. It can change nothing else there.
- A comment by someone else on the request brings the source issue back to the seat's inbox with reason `reply` when its run finished `blocked`. A review request that is done brings an issue in review back with `review_returned`.
- A request to a release seat that has not read its inbox for 10 minutes still succeeds. Inbox reads are recorded at most once a minute, so the 10 minutes can be up to a minute short. The reply carries `"warning": "seat_idle"` and the request gets a comment that says so: tell a person, because the release seat may not be running.

## Security review

A security seat gives a change an independent read before it goes on. Any seat asks for one with a request of role `security`.

| Step | Who | What happens |
| --- | --- | --- |
| 1 | The asking seat | Files the request with `"role": "security"`, then finishes its run `blocked` with `blockedBy` naming the request. |
| 2 | Collab | Assigns the request to the project's default security seat and links it as blocking the source issue, also when the caller sent `"blocks": false`. The reply says `"blocks": true`. |
| 3 | The security seat | Works the request and finishes it `done` with `"verdict"`: `"passed"` or `"failed"`, and `"reviewed"`: the commit or pull request it read. The findings go in the exit note. |
| 4 | Collab | Writes the verdict to the timeline of the request and of the source issue. The source issue returns to its seat's inbox with reason `blocker_resolved`, whatever the verdict. |

From the CLI:

```sh
collab seat request --from-issue AA-12 --role security --title "Security review of AA-12" --body-file request.md
collab run finish <run id> --generation <value> --outcome done --verdict failed --reviewed "PR 12 at abc1234" --note-file note.md
```

Where a person reads it, on the source issue's **Activity** tab:

- Above the timeline, one line lists every security request of the issue with where it stands: open, passed, failed, or closed without a verdict. Each links to its request.
- The timeline shows each step in order: who asked, who reviewed, what was reviewed and the verdict, with a link to the request. The request's timeline has the exit note.

The rules:

- Finishing a security request `done` without `verdict` or `reviewed` is refused with `422 exit_state_required`, and `missing` lists them. `reviewed` holds at most 200 characters. Any other finish that carries either is refused with `400 invalid_request`.
- After `failed`, fix the findings and file a new security request for the new commit. Each request keeps its own verdict, so the issue shows the history: failed, then passed.
- The next session on the source issue reads the verdict in its [run context](#start-from-the-run-context): the request under `requests` has `verdict` and `reviewed`.
- The verdict goes to the issue the request was filed for. A link added to the request later moves no verdict.
- A failed verdict stops no merge and no release by itself. It is a record, and the issue comes back to its seat.
- A person who moves a security request to a done status by hand leaves no verdict. The line above the timeline then shows it as closed without a verdict.
- Like any blocking issue, a security request brings its source back once it is in a done status. In a project with no status in the done group, the finish replies `"statusUnmapped": true`, the verdict is still recorded, and the source issue keeps waiting: give the project a done status.
- A project with no security seat refuses the request with `409 no_default_seat`. No label files a security request.

## Finish a run

The next run on an issue starts with no memory. Leave an exit note for the next session.

`PATCH /api/apps/auth/runs/<id>` with `"event": "finish"`, the run's `generation`, an `outcome` and a `note`:

```json
{
  "event": "finish",
  "generation": "<the same value>",
  "outcome": "done",
  "note": "## Done\n...\n\n## Decisions\n...\n\n## Evidence\n...\n\n## Next\n..."
}
```

1. Choose the `outcome`: `done`, `in_review` or `blocked`.
2. Write the `note` with the four headings `## Done`, `## Decisions`, `## Evidence` and `## Next`, each on a line of its own. It holds at most 16,000 characters.
3. For `in_review`, say what the issue waits for: `reviewRequest` (a review request the caller filed, linked to this issue) or `askedUser` (the id of a person in the workspace). For `blocked`: `blockedBy` (an issue linked as blocking this one) or `askedUser`. A security request that finishes `done` names its `verdict` and what was `reviewed`: see [Security review](#security-review).
4. Optionally name the `status` to move the issue to, and report the run's `usage`.

From the CLI: `collab run finish <run id> --generation <value> --outcome done --note-file note.md`, with `--status`, `--review-request`, `--asked-user`, `--blocked-by`, `--verdict`, `--reviewed` and `--also-finish '["<key>"]'` for the fields above. It does not report `usage`.

The reply contains the finished `run` and `statusUnmapped`.

- A note without one of the headings is refused with `422 exit_note_required`, and `missing` in the reply lists the headings.
- `in_review` or `blocked` without what it waits for is refused with `422 exit_state_required` and `missing`. So is a review request or a blocking issue that is not linked to the issue or is done already, because it would never bring the issue back. `askedUser` is another person who is an active member, not an agent.
- The issue moves to a status of the outcome's group. `status` names it and must be an active status of that group. Without `status`, an issue already in the group stays where it is; otherwise it goes to the group's first active status, and for `done` to a final status before the others.
- When the issue is not already in the outcome's group and the project has no active status in that group, the finish still succeeds, the issue stays where it is and the reply says `"statusUnmapped": true`. The outcome is recorded with the run, and the inbox reads it: an issue finished `in_review` or `blocked` waits as usual, and one finished `done` in a project with no done status is not offered again until it is assigned again.
- If a person moved the issue to a done status while its run was open and there is no active status for the outcome, it stays in the done status and out of the inbox. Otherwise the finish follows the status rules above.
- The exit note is on the issue's timeline and is found by search. `usage` has the fields a managed worker reports and is returned with the run.
- The issue is offered again according to [the inbox rules](#what-a-seat-works-on-next), including its current status.
- A finish is accepted from the session that holds the run, while the run is running or waiting and the issue is still assigned to the caller. Otherwise it gets `409 run_fenced` and changes neither the run nor the issue. If the generation matches and the run had not finished, the note is kept on the timeline as a late exit note.
- A release seat can finish the other release requests of one release with the same call: `"alsoFinish": ["<key>", ...]`, at most 20, with outcome `done`. Each must be assigned to the seat, in a to do status and without an open run. Each gets a finished run with the same note. If one cannot be finished, the whole finish is refused and nothing changes; `409 already_running` names an issue that has a run.

The issue's **Activity** tab shows the open run above the timeline: who is working the issue and since when.

## Other agent tokens

An agent account without a seat, such as an integration, gives a seat work by creating an issue assigned to it, up to 5 issues a day (UTC). Tokens for the same account share this limit. Unassigning an issue later does not restore a slot, and assignments by a person do not count toward it.

- Past 5, the issue is still created, unassigned, with `"warning": "assign_cap"` in the reply. It waits for a person.
- It cannot assign an existing issue to a seat (`assign_by_person`). A person does that.
- It can ask for a release of an existing issue by adding the `Release request` label. See [Ask for a release](/docs/agents/releases#ask-for-a-release).

## Retire a seat

1. On **Agent tokens**, choose **Retire seat** next to the seat or one of its tokens.
2. Its open issues become unassigned, each with an activity entry. Finished issues keep its name.
3. Revoke its tokens. Until then they can still read, but change nothing.

A seat that is working an issue cannot be retired until that work has ended. A retired name can be made a seat again, also in another project.

## Switch a project to seats

A project gives agents work in one of two ways: by handoffs or by seats. Seats and runs work in both. The switch decides whether handoffs still do. Projects switch one at a time.

1. Create the project's seats first: a developer seat, and a release seat if agents release it.
2. Open the project's **Settings**, then **Agents**. You need permission to manage workspace permissions.
3. Check the group of each status. A run moves its issue to an In progress status when it starts and to a status of its outcome when it ends. The switch is refused until one status is in the In progress group and one is in the Done group.
4. Choose **Switch to seats**. The dialog lists every status with its group, and the issues agents claimed in the last seven days. The issues you leave ticked are assigned to the default developer seat, each with an activity entry.

From then on, in that project:

- Sending, claiming, offering and accepting a handoff are refused with `project_uses_seats`. Old handoffs stay readable, and a claim made before the switch can still be reported on, released or completed.
- A label no longer hands an issue to the agents subscribed to it.
- Adding the `Release request` or `Review request` label to an issue files a request for the default seat of that role, related to the issue. Adding the label again files nothing while that request is open. With no seat for the role, the change is refused with `no_default_seat`. Any agent token of the workspace may add `Release request`, seat or not. `Review request` from an agent token that is not a seat is refused with `assign_by_person`; a person or a seat of the project adds it.
- The Agents tab lists agent names that hold claims only in this project. Before retiring one, check its other work and subscriptions across the workspace. If it is no longer needed, use `collab agents retire --agent NAME`.

**Switch back to handoffs** on the same tab undoes the switch. It is refused with `run_open` while a run is open in the project.

## Next

Back to the [documentation home](/docs).
