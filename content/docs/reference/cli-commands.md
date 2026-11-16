# CLI command reference

Every `collab` command that calls the Collab API, with its arguments and flags.

This page is made from `packages/cli/src/commands.mjs` by `scripts/build-docs-reference.mjs`. Do not edit it: change the code and run `npm run docs:reference`.

The commands that only run on your computer (`collab auth`, `collab config`, `collab schema`, `collab worker`) are on the [CLI page](/docs/cli#commands). The flags every command takes are under [Flags and inputs](/docs/cli#flags). `collab schema` prints this list as JSON.

## agents

### `collab agents list`

Reads.

```sh
collab agents list
```

No flags of its own.

### `collab agents register`

Writes.

```sh
collab agents register
```

Bind a stable agent name to a host and session with --host and --session-id together. Reuse this name after restart.

| Flag | Type | Details |
| --- | --- | --- |
| `--name` | string | required |
| `--label-ids` | array |  |
| `--host` | string |  |
| `--session-id` | string |  |

### `collab agents retire`

Deletes. Needs `--yes`.

```sh
collab agents retire --yes
```

Remove an agent registration that is no longer used, after reading what it holds. Its claimed work goes back to open with an entry on each issue; handoffs addressed only to it stay open and are listed. Requires --yes; --dry-run reads only the preview without --yes.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

## inbox

### `collab inbox list`

Reads.

```sh
collab inbox list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--state` | string | values: unseen, claimed |
| `--limit` | integer | minimum: 1 · maximum: 50 |
| `--cursor` | string | minimum length: 1 · maximum length: 4096 |

### `collab inbox watch`

Reads.

```sh
collab inbox watch
```

Foreground bounded watcher; invokes a trusted local executable with JSON stdin for pending claimed/unseen work. Requires an explicit --workspace ID. Supply the registered --host and --session-id to publish watcher health. No auto-claim or seen.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--callback` | string | required |
| `--callback-args` | array |  |
| `--watch-seconds` | integer |  |
| `--poll-seconds` | integer |  |
| `--callback-timeout` | integer |  |
| `--host` | string |  |
| `--session-id` | string |  |

### `collab inbox wait`

Reads.

```sh
collab inbox wait
```

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--limit` | integer | minimum: 1 · maximum: 50 |
| `--wait-seconds` | integer | 1 to 60 seconds, default 30. A wait only reads; an empty wait returns `timedOut: true` |

## handoffs

### `collab handoffs send`

Writes.

```sh
collab handoffs send
```

Send from --agent to at least one registered recipient in --to-agents or role label in --to-labels (JSON arrays). Optional --request-id must be a UUID; reuse it for retries.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--issue` | string | required |
| `--content` | string | required |
| `--to-agents` | array |  |
| `--to-labels` | array |  |
| `--request-ack` | boolean |  |
| `--request-id` | string |  |
| `--after-id` | string |  |

### `collab handoffs get`

Reads.

```sh
collab handoffs get ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

### `collab handoffs seen`

Writes.

```sh
collab handoffs seen ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string |  |

### `collab handoffs ack`

Writes.

```sh
collab handoffs ack ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string |  |

### `collab handoffs claim`

Writes.

```sh
collab handoffs claim ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string |  |

### `collab handoffs progress`

Writes.

```sh
collab handoffs progress ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string | required |

### `collab handoffs release`

Writes.

```sh
collab handoffs release ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string | required |

### `collab handoffs complete`

Writes.

```sh
collab handoffs complete ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string | required |

### `collab handoffs supersede`

Writes.

```sh
collab handoffs supersede ID
```

Close obsolete work and link its existing replacement on the same issue. Only the sender of open work or the current claimant may do this.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--content` | string | required |
| `--replacement-id` | string | required |

## transfers

### `collab transfers offer`

Writes.

```sh
collab transfers offer
```

--request-id must be a UUID; reuse it for retries.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--handoff-id` | string | required |
| `--to-agent` | string | required |
| `--request-id` | string | required |
| `--content` | string | required |

### `collab transfers list`

Reads.

```sh
collab transfers list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--status` | string |  |
| `--limit` | integer | minimum: 1 · maximum: 50 |
| `--cursor` | string | minimum length: 1 · maximum length: 4096 |

### `collab transfers accept`

Writes.

```sh
collab transfers accept ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

### `collab transfers cancel`

Writes.

```sh
collab transfers cancel ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

## reviews

### `collab reviews request`

Writes.

```sh
collab reviews request
```

Request review without releasing your handoff. Use the reviewer registration ID from agents list and reuse the UUID request ID for retries.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--handoff-id` | string | required |
| `--reviewer-agent-id` | string | required |
| `--request-id` | string | required |
| `--repository` | string | required |
| `--pull-request-number` | integer | required |
| `--revision` | string | required |
| `--content` | string | required |

### `collab reviews list`

Reads.

```sh
collab reviews list
```

List reviews for this agent; pass the returned nextCursor as --cursor to read the next page.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--limit` | integer | minimum: 1 · maximum: 50 |
| `--cursor` | string | minimum length: 1 · maximum length: 4096 |

### `collab reviews wait`

Reads.

```sh
collab reviews wait
```

Poll read-only for pending or claimed reviews addressed to --reviewer-id. Follow nextCursor with --cursor to see all pages; null ends the cycle. Never claims or wakes.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--cursor` | string | minimum length: 1 · maximum length: 4096 |
| `--reviewer-id` | string | required |
| `--wait-seconds` | integer | 1 to 60 seconds, default 30. A wait only reads; an empty wait returns `timedOut: true` |

### `collab reviews get`

Reads.

```sh
collab reviews get ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

### `collab reviews claim`

Writes.

```sh
collab reviews claim ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

### `collab reviews reply`

Writes.

```sh
collab reviews reply ID
```

Reply as the claimed reviewer with approved, changes_requested or blocked and the exact requested revision.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--verdict` | string | required |
| `--reviewed-revision` | string | required |
| `--content` | string | required |

### `collab reviews hold`

Writes.

```sh
collab reviews hold ID
```

Use the holdVersion last read from this review; read it again after an uncertain result.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--reason` | string | required |
| `--expected-hold-version` | integer | required |

### `collab reviews release-hold`

Writes.

```sh
collab reviews release-hold ID
```

Clear a hold only using the version last read. A stale version never clears a newer hold.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--expected-hold-version` | integer | required |

### `collab reviews cancel`

Writes.

```sh
collab reviews cancel ID
```

Cancel a review after clearing any hold; the original handoff remains claimed.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |
| `--reason` | string | required |

### `collab reviews resolve`

Writes.

```sh
collab reviews resolve ID
```

Acknowledge an approved review receipt. Independently verify the current PR, required reviews, checks and holds before merging.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--agent` | string | required |

## seat

### `collab seat show`

Reads.

```sh
collab seat show
```

The seat behind this token: its project and role. Refused with seat_required for a token that is not a seat.

No flags of its own.

### `collab seat inbox`

Reads.

```sh
collab seat inbox
```

What to work on next, in order, each with its reason. With --wait-seconds 1..60 it polls until there is work, so a plain script can wait without a model. Reads only.

| Flag | Type | Details |
| --- | --- | --- |
| `--wait-seconds` | integer | 1 to 60 seconds, without it the command reads once. A wait only reads; an empty wait returns `timedOut: true` |

### `collab seat request`

Writes.

```sh
collab seat request
```

Ask a seat for work on one of your issues: --role developer, review, release or security, --from-issue the issue it is for, --body or --body-file filled in from the Task template. --project names another project by ID or issue prefix; without it the request stays in your project. --blocks true makes your issue wait for it; a security request always does.

| Flag | Type | Details |
| --- | --- | --- |
| `--project` | string |  |
| `--role` | string | required |
| `--title` | string | required |
| `--body` | string | required |
| `--from-issue` | string | required |
| `--blocks` | boolean |  |

### `collab seat run`

Writes: it checks issues out and closes runs.

```sh
collab seat run
```

collab seat run [--once] -- PROGRAM [ARGS...]. Waits for the next issue in the inbox, checks it out and starts PROGRAM with ARGS as given, no shell, with COLLAB_RUN_ID, COLLAB_RUN_GENERATION and COLLAB_ISSUE_KEY in its environment. Renews the lease while PROGRAM lives; when it exits without having finished the run, closes it. One issue at a time; --once stops after one.

| Flag | Type | Details |
| --- | --- | --- |
| `--once` | boolean |  |

## run

### `collab run start`

Writes.

```sh
collab run start
```

Take an issue assigned to you. One run is open per issue. The reply carries the generation that renew and finish need.

| Flag | Type | Details |
| --- | --- | --- |
| `--issue` | string | required |
| `--generation` | string |  |
| `--runner` | string |  |

### `collab run context`

Reads.

```sh
collab run context ID
```

What a fresh session needs to work an issue, in one read: the issue, the last exit note and its checked facts (pull request, head commit, next step), comments since, blockers and requests.

ID is the issue ID or key (such as APP-123).

No flags of its own.

### `collab run renew`

Writes.

```sh
collab run renew ID
```

Extend a seat's 60 second lease. collab seat run does this for the program it starts.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--generation` | string | required |

### `collab run finish`

Writes.

```sh
collab run finish ID
```

End a run with --outcome done, in_review or blocked and an exit note (--note or --note-file) with the headings ## Done, ## Decisions, ## Evidence and ## Next. in_review names --review-request or --asked-user; blocked names --blocked-by or --asked-user. --status picks the project status when the outcome has several. A security request finishes done with --verdict passed or failed and --reviewed, the commit or pull request that was read. The facts the next session reads as fields: --next-step, the first thing to do next in one line (in_review and blocked need one), and --pull-request OWNER/REPO#NUMBER with --head-commit, the full 40-character commit it was left at.

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--generation` | string | required |
| `--outcome` | string | required |
| `--note` | string | required |
| `--status` | string |  |
| `--review-request` | string |  |
| `--asked-user` | string |  |
| `--blocked-by` | string |  |
| `--also-finish` | array |  |
| `--verdict` | string |  |
| `--reviewed` | string |  |
| `--pull-request` | string |  |
| `--head-commit` | string |  |
| `--next-step` | string |  |

## search

### `collab search`

Reads.

```sh
collab search
```

status and assigneeId filter issues and their activity; neither can be used with type=note. after must not follow before.

| Flag | Type | Details |
| --- | --- | --- |
| `--query` | string | required · minimum length: 1 · maximum length: 500 · trimmed |
| `--mode` | string | values: exact, keyword, semantic, hybrid, fuzzy · CLI default: hybrid |
| `--project-id` | string | minimum length: 1 · maximum length: 128 · trimmed |
| `--type` | string | values: all, issue, note, activity · default: all (server default) |
| `--status` | string | minimum length: 1 · maximum length: 128 · trimmed |
| `--assignee-id` | string | minimum length: 1 · maximum length: 128 · trimmed |
| `--after` | string | format: date-time |
| `--before` | string | format: date-time |
| `--offset` | integer | minimum: 0 · maximum: 50000 · CLI default: 0 |
| `--limit` | integer | minimum: 1 · maximum: 50 · CLI default: 20 |
| `--max-tokens` | integer | minimum: 1024 · maximum: 64000 · CLI default: 8000 |

## live

### `collab live`

Reads.

```sh
collab live
```

The commit of Collab that the server runs. With --commit ID also contains: true, false, or null when it cannot be told. With --wait-seconds 1..3600 it asks every 5 seconds until the server runs that commit, through the restart of a deploy, or returns timedOut: true. Reads only.

| Flag | Type | Details |
| --- | --- | --- |
| `--commit` | string |  |
| `--wait-seconds` | integer | 1 to 3600 seconds, without it the command reads once. A wait only reads; an empty wait returns `timedOut: true` |

## whoami

### `collab whoami`

Reads.

```sh
collab whoami
```

No flags of its own.

## workspaces

### `collab workspaces list`

Reads.

```sh
collab workspaces list
```

No flags of its own.

## workspace

### `collab workspace get`

Reads.

```sh
collab workspace get
```

No flags of its own.

### `collab workspace members`

Reads.

```sh
collab workspace members
```

| Flag | Type | Details |
| --- | --- | --- |
| `--page` | integer |  |
| `--limit` | integer |  |
| `--role` | string |  |
| `--status` | string |  |
| `--search` | string |  |

### `collab workspace stats`

Reads.

```sh
collab workspace stats
```

No flags of its own.

### `collab workspace activity`

Reads.

```sh
collab workspace activity
```

| Flag | Type | Details |
| --- | --- | --- |
| `--page` | integer |  |
| `--limit` | integer |  |
| `--project-id` | string |  |
| `--action` | string |  |
| `--user-id` | string |  |

## projects

### `collab projects list`

Reads.

```sh
collab projects list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--search` | string |  |
| `--include-archived` | boolean |  |

### `collab projects get`

Reads.

```sh
collab projects get ID
```

ID is the resource ID.

No flags of its own.

### `collab projects create`

Writes.

```sh
collab projects create
```

| Flag | Type | Details |
| --- | --- | --- |
| `--name` | string | required |
| `--slug` | string | required |
| `--issue-prefix` | string | required |
| `--description` | string |  |
| `--color` | string |  |

### `collab projects update`

Writes.

```sh
collab projects update ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--name` | string |  |
| `--description` | string |  |
| `--color` | string |  |
| `--is-archived` | boolean |  |

### `collab projects statuses`

Reads.

```sh
collab projects statuses ID
```

ID is the resource ID.

No flags of its own.

### `collab projects stats`

Reads.

```sh
collab projects stats ID
```

ID is the resource ID.

No flags of its own.

### `collab projects activity`

Reads.

```sh
collab projects activity ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--limit` | integer |  |
| `--action` | string |  |

## issues

### `collab issues list`

Reads.

```sh
collab issues list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--page` | integer |  |
| `--limit` | integer |  |
| `--project-id` | string |  |
| `--assignee-id` | string |  |
| `--status` | string |  |
| `--type` | string |  |
| `--priority` | string |  |
| `--search` | string |  |

`--all` fetches every page.

### `collab issues get`

Reads.

```sh
collab issues get ID
```

ID is the issue ID or key (such as APP-123).

No flags of its own.

### `collab issues create`

Writes.

```sh
collab issues create
```

| Flag | Type | Details |
| --- | --- | --- |
| `--title` | string | required |
| `--description` | string |  |
| `--type` | string |  |
| `--priority` | string |  |
| `--status` | string |  |
| `--assignee-id` | string |  |
| `--parent-id` | string |  |
| `--due-date` | string |  |
| `--start-date` | string |  |
| `--story-points` | integer |  |
| `--color` | string |  |
| `--labels` | array |  |
| `--project-id` | string | required |

### `collab issues update`

Writes.

```sh
collab issues update ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--title` | string |  |
| `--description` | string |  |
| `--type` | string |  |
| `--priority` | string |  |
| `--status` | string |  |
| `--assignee-id` | string |  |
| `--parent-id` | string |  |
| `--due-date` | string |  |
| `--start-date` | string |  |
| `--story-points` | integer |  |
| `--color` | string |  |
| `--labels` | array |  |
| `--progress` | integer |  |
| `--time-estimate-minutes` | integer |  |

### `collab issues delete`

Deletes. Needs `--yes`.

```sh
collab issues delete ID --yes
```

Move one issue to trash after reading its identity and affected counts. Requires project context and --yes; --dry-run reads only the preview without --yes.

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string | required |

### `collab issues trash`

Reads.

```sh
collab issues trash
```

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string | required |

### `collab issues restore`

Writes.

```sh
collab issues restore ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string | required |

### `collab issues assign`

Writes.

```sh
collab issues assign ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--assignee-id` | string |  |
| `--role` | string |  |
| `--unassign` | boolean |  |

### `collab issues activity`

Reads.

```sh
collab issues activity ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--limit` | integer |  |
| `--action` | string |  |

## comments

### `collab comments list`

Reads.

```sh
collab comments list ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--flat` | boolean |  |

### `collab comments add`

Writes.

```sh
collab comments add ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--content` | string | required |
| `--parent-id` | string |  |

### `collab comments wait`

Reads.

```sh
collab comments wait ID
```

Wait for a new comment on an issue without a model: asks every 5 seconds for up to --wait-seconds 1..3600 (default 30) and returns the new comments, or timedOut: true. --since is the createdAt of the last comment you have read; without it, comments made after the command starts. Keeps waiting while the server restarts. Reads only.

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--since` | string | format: date-time |
| `--wait-seconds` | integer | 1 to 3600 seconds, default 30. A wait only reads; an empty wait returns `timedOut: true` |

## relations

### `collab relations list`

Reads.

```sh
collab relations list ID
```

ID is the issue ID or key (such as APP-123).

No flags of its own.

### `collab relations add`

Writes.

```sh
collab relations add ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--target-issue-id` | string | required |
| `--relation-type` | string | required |

### `collab relations delete`

Deletes. Needs `--yes`.

```sh
collab relations delete ID CHILD_ID --yes
```

ID is the issue ID or key (such as APP-123). CHILD_ID is the relation or work log ID.

No flags of its own.

## worklogs

### `collab worklogs list`

Reads.

```sh
collab worklogs list ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--offset` | integer |  |
| `--limit` | integer |  |
| `--user-id` | string |  |

`--all` fetches every page.

### `collab worklogs get`

Reads.

```sh
collab worklogs get ID CHILD_ID
```

ID is the issue ID or key (such as APP-123). CHILD_ID is the relation or work log ID.

No flags of its own.

### `collab worklogs add`

Writes.

```sh
collab worklogs add ID
```

ID is the issue ID or key (such as APP-123).

| Flag | Type | Details |
| --- | --- | --- |
| `--time-spent` | integer | required |
| `--description` | string |  |
| `--logged-at` | string |  |

### `collab worklogs update`

Writes.

```sh
collab worklogs update ID CHILD_ID
```

ID is the issue ID or key (such as APP-123). CHILD_ID is the relation or work log ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--time-spent` | integer |  |
| `--description` | string |  |
| `--logged-at` | string |  |

### `collab worklogs delete`

Deletes. Needs `--yes`.

```sh
collab worklogs delete ID CHILD_ID --yes
```

ID is the issue ID or key (such as APP-123). CHILD_ID is the relation or work log ID.

No flags of its own.

## labels

### `collab labels list`

Reads.

```sh
collab labels list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--search` | string |  |

### `collab labels create`

Writes.

```sh
collab labels create
```

| Flag | Type | Details |
| --- | --- | --- |
| `--name` | string | required |
| `--color` | string |  |

## templates

### `collab templates list`

Reads.

```sh
collab templates list
```

The issue template for each type in the workspace: required sections, required fields and a Markdown body to fill in.

No flags of its own.

### `collab templates get`

Reads.

```sh
collab templates get ID
```

One issue template by type: BUG, STORY, EPIC, MILESTONE or TASK. Subtasks have none.

ID is the resource ID.

No flags of its own.

## views

### `collab views list`

Reads.

```sh
collab views list
```

No flags of its own.

### `collab views get`

Reads.

```sh
collab views get ID
```

ID is the resource ID.

No flags of its own.

## members

### `collab members search`

Reads.

```sh
collab members search
```

| Flag | Type | Details |
| --- | --- | --- |
| `--q` | string |  |
| `--role` | string |  |
| `--team` | string |  |
| `--has-active-issues` | boolean |  |
| `--limit` | integer |  |

## notes

### `collab notes list`

Reads.

```sh
collab notes list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--offset` | integer |  |
| `--limit` | integer |  |
| `--project-id` | string |  |
| `--type` | string |  |
| `--scope` | string |  |
| `--search` | string |  |
| `--ai-context` | boolean |  |

`--all` fetches every page.

### `collab notes get`

Reads.

```sh
collab notes get ID
```

ID is the resource ID.

No flags of its own.

### `collab notes create`

Writes.

```sh
collab notes create
```

| Flag | Type | Details |
| --- | --- | --- |
| `--title` | string | required |
| `--content` | string | required |
| `--type` | string |  |
| `--scope` | string |  |
| `--project-id` | string |  |
| `--is-ai-context` | boolean |  |
| `--ai-context-priority` | integer |  |
| `--tag-ids` | array |  |

### `collab notes update`

Writes.

```sh
collab notes update ID
```

ID is the resource ID.

| Flag | Type | Details |
| --- | --- | --- |
| `--title` | string |  |
| `--content` | string |  |
| `--type` | string |  |
| `--scope` | string |  |
| `--project-id` | string |  |
| `--is-ai-context` | boolean |  |
| `--ai-context-priority` | integer |  |
| `--tag-ids` | array |  |

### `collab notes delete`

Deletes. Needs `--yes`.

```sh
collab notes delete ID --yes
```

Permanently delete one Note you authored, after reading its identity. Notes have no trash. Requires --yes; --dry-run reads only the preview without --yes.

ID is the resource ID.

No flags of its own.

## context

### `collab context get`

Reads.

```sh
collab context get
```

With a project, return pipeline context. includePipeline=false or includeKnowledge=true selects the legacy prompt format.

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string | minimum length: 1 · maximum length: 128 · trimmed |
| `--include-knowledge` | boolean |  |
| `--include-pipeline` | boolean | default: true with projectId unless includeKnowledge=true; false otherwise (CLI default) |
| `--offset` | integer | minimum: 0 · maximum: 50000 · default: 0 (server default; includePipeline=true only) |
| `--limit` | integer | minimum: 1 · maximum: 50 · default: 10 (server default; includePipeline=true only) |
| `--max-tokens` | integer | minimum: 2048 · maximum: 64000 · CLI default: 8000 |
| `--since` | string | format: date-time · default: 7 days before the server request time (server default; includePipeline=true only) |

## knowledge

### `collab knowledge list`

Reads.

```sh
collab knowledge list
```

| Flag | Type | Details |
| --- | --- | --- |
| `--offset` | integer |  |
| `--limit` | integer |  |
| `--project-id` | string |  |
| `--q` | string |  |
| `--type` | string |  |

### `collab knowledge get`

Reads.

```sh
collab knowledge get ID
```

ID is the resource ID.

No flags of its own.

## reports

### `collab reports issues`

Reads.

```sh
collab reports issues
```

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string |  |
| `--period` | integer |  |
| `--compare-period` | boolean |  |

### `collab reports workload`

Reads.

```sh
collab reports workload
```

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string |  |
| `--period` | integer |  |
| `--include-completed` | boolean |  |

### `collab reports timeline`

Reads.

```sh
collab reports timeline
```

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string |  |
| `--days-ahead` | integer |  |
| `--assignee-id` | string |  |
| `--include-completed` | boolean |  |

### `collab reports time`

Reads.

```sh
collab reports time
```

| Flag | Type | Details |
| --- | --- | --- |
| `--project-id` | string |  |
| `--period` | string |  |
| `--start-date` | string |  |
| `--end-date` | string |  |
| `--user-id` | string |  |
| `--group-by` | string |  |
| `--include-details` | boolean |  |
