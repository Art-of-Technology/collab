# Agent Seats Implementation Plan

> For agentic workers: The workspace owner chose one fresh session for this plan (15 Nov 2026). Use superpowers:executing-plans, task by task, with one independent review of the whole branch of each pull request before it merges. Each task is its own pull request, shipped through the repository's usual pipeline. Start a new session rather than letting one grow past a few hundred thousand tokens: every task ends with its pull request and a note on its CLB issue, so the next session can continue from there.

**Goal:** an issue assigned to a seat can be taken, worked in a fresh run and finished under the rules in "Design", by any runner that speaks the contract.

**Architecture:** two additive tables (`AgentSeat`, `AgentRun`) and two columns; new libraries beside the handoff code; the contract as `apps/auth` routes behind the existing token middleware; the existing CLI worker becomes the interim runner. Projects opt in one at a time through `Project.agentMode`.

**Tech stack:** Next.js 16 route handlers, Prisma 6 on PostgreSQL 17, zod, Node test runner with a throwaway PostgreSQL, the `collab` CLI (Node, `.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-15-agent-seats-and-docs-design.md`.

### Global constraints

- Work in your own worktree from `origin/main`; never touch another agent's working tree.
- Schema: write the migration SQL by hand, register it in `prisma/bootstrap-contract.json` and in the pinned list at the end of `tests/security/bootstrap-recipe.test.cjs`, put new fields last in a model. Never `prisma db push`, `prisma migrate deploy` or `prisma format` against production. The migration is applied to production **before** its pull request merges, by the release owner, following the private migration procedure.
- Role, state and outcome are strings, as `AgentHandoff.status` is. Exact values: roles `developer|reviewer|release`; categories `todo|in_progress|in_review|blocked|done`; run states `running|waiting|finished|lost|stopped` (`lost`: the lease lapsed and nobody confirmed the session ended; `stopped`: confirmed ended without a finish); outcomes `done|in_review|blocked`; modes `handoffs|seats`; request roles on an issue `developer|review|release`.
- Exact numbers: lease 60 s; inbox returns at most 50 items; at most 5 open requests from one project to another; at most 5 issues per day (UTC) assigned to seats by one integration token; exit note headings `## Done`, `## Decisions`, `## Evidence`, `## Next`; role labels `Release request` and `Review request`.
- Errors use the existing `HandoffError` and `handoffResponse` (`src/lib/agent-handoff-http.ts`). Codes: `seat_required` 403, `seat_scope` 403, `wrong_project` 403, `not_assigned` 403, `role_mismatch` 422, `already_running` 409, `run_fenced` 409, `needs_person` 409, `exit_note_required` 422, `exit_state_required` 422, `no_default_seat` 409, `request_cap` 429, `project_uses_seats` 409.
- New code goes in new files. `src/lib/agent-handoffs.ts` changes only for the `project_uses_seats` refusal.
- Tests are behavioural and run on a real throwaway PostgreSQL, following `tests/agents/handoffs.test.cjs:1-38`. Because `prisma db push` cannot create partial unique indexes, each test file applies the migration SQL itself. Add the new files to the path triggers and the test command in `.github/workflows/agent-handoffs.yml`.
- No new dependency in this plan.
- A change under `packages/cli` is a CLI release: bump the version everywhere a CLI release requires, and the release request says which CLI version must exist before deploy.
- Every task: write the named tests first, run them and see them fail, implement, run them and see them pass, run `npm test`, `npx tsc --noEmit -p .` and `npm run lint`, commit.

### Review focus

1. An issue is reassigned (to a person or another seat) while a run is open: the run's next `renew` or `finish` gets `409 run_fenced` and changes neither the issue nor the run's outcome (a fenced `finish` still keeps its note, see 4). Test in A5.
2. An issue is moved to another project while assigned to a seat: the seat is unassigned and an activity entry says why. Test in A3.
3. A project has no status in the category a finish needs: the finish succeeds, the outcome is recorded, the status is left alone and the reply carries `statusUnmapped: true`. Test in A6.
4. A `finish` arrives after the run was marked lost: `409 run_fenced`, but the note is kept as an `AGENT_RUN_LATE` activity so the work is not lost. Test in A6.
5. A seat is retired while it holds issues: refused while a run is open; otherwise its open issues are unassigned, each with an activity entry. Test in A3.

### Files

| File | Responsibility |
|---|---|
| `prisma/migrations/20261116000100_agent_seats/migration.sql` | Tables, partial unique indexes, columns, category backfill |
| `src/lib/issue-assignee.ts` (new) | `assertAssignable`: one place that decides who may be assigned |
| `src/lib/agent-seats.ts` (new) | Seats: create, find for a token, list, retire, write scope |
| `src/lib/agent-runs.ts` (new) | Inbox, checkout, lease, finish, run context |
| `src/lib/agent-requests.ts` (new) | Requests for a role in a project |
| `src/app/api/apps/auth/seats/**`, `runs/**`, `issues/[issueIdOrKey]/run-context/route.ts` (new) | The contract |
| `src/app/api/workspaces/[workspaceId]/agent-seats/**` (new) | Seat management for people |
| `src/components/workspace/AgentTokensManager.tsx` | Project and role on the form |
| `packages/cli/src/commands.mjs`, `packages/cli/src/seat-run.mjs` (new) | `seat` and `run` commands, interim runner |
| `tests/agents/seats*.test.cjs`, `tests/agents/runs*.test.cjs` (new) | Rules 1 to 11 |

### Task A1: schema and migration

**Files:** create the migration above; modify `prisma/schema.prisma`, `prisma/bootstrap-contract.json`, `tests/security/bootstrap-recipe.test.cjs`; test `tests/agents/seats-schema.test.cjs`.

**Produces:**
- `AgentSeat { id, workspaceId, projectId, role, userId @unique, ownerId?, name, isDefault @default(false), lastSeenAt?, retiredAt?, createdAt, updatedAt }`, index `(projectId, role)`.
- `AgentRun { id, workspaceId, issueId, seatId?, userId, runner, generation, state @default("running"), outcome?, note?, ask Json?, usage Json?, leaseUntil?, startedAt @default(now()), endedAt? }`, indexes `(issueId, startedAt)` and `(seatId, endedAt)`. `leaseUntil` is null for a person's run.
- `Issue.agentRequestRole String?`, last in the model. Set only by filing a request.
- Partial unique indexes, in SQL only: `AgentRun_one_open` on `(issueId) WHERE "endedAt" IS NULL`; `AgentSeat_one_release` on `(projectId) WHERE role = 'release' AND "retiredAt" IS NULL`; `AgentSeat_one_default` on `(projectId, role) WHERE "isDefault" AND "retiredAt" IS NULL`.
- `ProjectStatus.category String?`, backfilled from the lower-cased name, first match wins (checked against the status names in use on 15 Nov 2026):
  1. `done`: `isFinal`, or the name contains `done`, `complete`, `cancel`, `deprecated`, `wont_fix`, `won_t_fix`, `rejected`, `deleted`, `waiting_for_deploy`, `ready_to_release`, `to_release`.
  2. `in_review`: contains `review`, `test`, `qa`, or is exactly `pr`.
  3. `blocked`: contains `block`.
  4. `in_progress`: contains `progress` or `doing`.
  5. `todo`: everything else (`backlog`, `to_do`, `todo`, `prioritized`, `ready`, and board-style names such as `tasks`, `stories`, `epics`).
- `Project.agentMode String @default("handoffs")`, `Project.agentSwitchedAt DateTime?`.

- [ ] Test: apply the migration to a database built from `origin/main`'s schema with rows in it; assert a second open run on one issue fails, a second active release seat in one project fails, a second default seat per role fails, and these names get these groups: `canceled` done, `waiting_for_deploy` done, `code_review` in_review, `qa_testing` in_review, `blocked` blocked, `in_progress` in_progress, `prioritized` todo, `stories` todo.
- [ ] Equivalence check and rehearsal on a restored copy, as the private migration procedure describes.
- [ ] Open the pull request, file the release request with "Needs before deploy: migration 20261116000100_agent_seats", merge only after the migration is applied.

### Task A2: one rule for who may be assigned (rule 12)

**Files:** create `src/lib/issue-assignee.ts`; the routes that set an assignee call it. The exact list of files, the cases and the tests are in the private tracker (CLB-484) until this task is deployed.

**Produces:** `assertAssignable(db, issue: { workspaceId: string; projectId: string; agentRequestRole: string | null }, userId: string): Promise<void>`, throwing `HandoffError`. It is the one place that decides who may be assigned an issue; A3 adds the seat rules to the same function.

- [ ] Tests as listed in CLB-484, on a real PostgreSQL.
- [ ] Keep the pull request text, branch name and commit subjects general.

### Task A3: seats

**Files:** create `src/lib/agent-seats.ts`, `src/app/api/workspaces/[workspaceId]/agent-seats/route.ts`, `.../agent-seats/[seatId]/route.ts`, `src/app/api/apps/auth/seats/me/route.ts`; modify `src/lib/agent-tokens.ts` (optional `seat` input written in the same transaction), `src/lib/issue-assignee.ts`, `src/lib/issue-mutation.ts`, `src/app/api/workspaces/[workspaceId]/members/route.ts`, `src/components/workspace/AgentTokensManager.tsx`, `src/components/issue/selectors/IssueAssigneeSelector.tsx`, and the token-facing write routes for issues, comments, relations and worklogs; tests `tests/agents/seats.test.cjs`, `tests/render/agent-tokens-manager.test.cjs`.

**Consumes:** A1 tables, `createAgentToken` (`src/lib/agent-tokens.ts:56`), `assertAssignable` (A2).

**Produces:**
- `createSeat(input: { workspaceId; actorId; projectId; role; ownerId; name; expiresInDays; isDefault? }) → { seat, token } | { error }`
- `seatFor(db, context: AppAuthContext) → AgentSeat | null`, by `context.user.id`
- `requireSeat(db, context) → AgentSeat` (`seat_required`)
- `seatWriteGuard(db, context, projectId: string): Promise<void>` (`wrong_project` when the caller is a seat of another project; no effect for people)
- `AuthMiddlewareOptions.seatWrites?: boolean` in `src/lib/apps/auth-middleware.ts`: when the caller is a seat and the method is not GET, `withAppAuth` answers `403 seat_scope` unless the route passed `seatWrites: true`. Deny is the default, because 34 token-facing route files can write today (projects, workspace, labels, context, posts, leave, secrets among them) and a new one must not be open to seats by accident. Routes that opt in and then call `seatWriteGuard`: `issues` POST, `issues/[issueIdOrKey]` PATCH and DELETE, `comments`, `relations` and `relations/[relationId]`, `restore`, `work-logs` and `work-logs/[workLogId]`, and the new `runs` and `seats/me/requests`.
- `retireSeat(input: { workspaceId; actorId; seatId }) → { unassigned: string[] }`
- `GET seats/me → { seat: { id, projectId, role, ownerId, name, isDefault }, project: { id, name, issuePrefix, agentMode } }`

- [ ] Tests: a seat is created with its token in one step and can authenticate; `GET seats/me` returns it; a personal login gets `seat_required`.
- [ ] Tests: the first active seat of a role in a project becomes its default; minting a token again under the seat's name gives a new token for the same seat (the account is reused, `src/lib/agent-tokens.ts:75`), which is how a token is rotated.
- [ ] Test: an integration token (an agent token with no seat) can create an issue assigned to a project's developer seat; its sixth such issue on the same UTC day is created unassigned and the reply carries `warning: 'assign_cap'`; a person is never capped.
- [ ] Test: a seat cannot change who an issue is assigned to (`seat_scope`). Work moves between seats only through a request (A7) or back to a person through `finish` (A6), so the `assign` route does not opt in and `issues/[issueIdOrKey]` PATCH refuses `assigneeId` from a seat.
- [ ] Tests for rule 7 in `assertAssignable`: a seat can be assigned only issues of its project (`wrong_project`); a release seat only issues whose `agentRequestRole` is `release`, a reviewer seat only `review`, a developer seat only issues where it is null or `developer` (`role_mismatch`). An issue that merely carries the `Release request` label cannot be assigned to a release seat.
- [ ] Test for rule 2 at the middleware: a seat's POST to a route without `seatWrites` gets `403 seat_scope`, with it the handler runs; a person's token is unaffected either way.
- [ ] Test for rule 2, table-driven over every route that opts in: a seat of project A is refused on a project B issue (`wrong_project`) and passes on its own; reads of project B still work.
- [ ] Test: a seat's call to `projects` POST, `workspace` PATCH and `labels` POST is refused with `seat_scope`.
- [ ] Tests for review focus 2 and 5 (issue moved to another project; seat retired).
- [ ] The Agent tokens page creates seats (project, role, owner); the assignee picker shows a badge on seats and hides seats of other projects.

### Task A4: inbox

**Files:** create `src/lib/agent-runs.ts`, `src/app/api/apps/auth/seats/me/inbox/route.ts`; test `tests/agents/runs-inbox.test.cjs`.

**Produces:** `seatInbox(context) → { items: InboxItem[] }` with `InboxItem = { issueId; issueKey; title; priority; category; reason: 'resume'|'review_returned'|'reply'|'blocker_resolved'|'assigned'; lastRunAt: string | null }`. Callable by a seat, or by a person for the issues assigned to that person. Updates `AgentSeat.lastSeenAt` at most once a minute.

- [ ] Test rule 1: an unassigned issue and an issue assigned to someone else never appear.
- [ ] Test rule 3 with one fixture of six issues: the order is resume, then in review with a new comment from someone else, then blocked whose blocking issues are all in category `done`, then to do by priority (`urgent`, `high`, `medium`, `low`) and age; an in review issue with nothing new is absent; at most 50 items.
- [ ] Test: a status with `category` null counts as `done` when `isFinal`, otherwise as `todo`.
- [ ] Test: where an issue stands comes from its last run: an issue whose last run finished `blocked` in a project with no "blocked" status is held back, and appears with reason `blocker_resolved` once its blocking issue is done. The status group is used only for issues that never had a run.
- [ ] Test: an issue whose last run is `lost` is not offered; once that run is `stopped` it is offered first, with reason `resume`.

### Task A5: checkout and lease

**Files:** modify `src/lib/agent-runs.ts`; create `src/app/api/apps/auth/runs/route.ts`, `src/app/api/apps/auth/runs/[id]/route.ts`; test `tests/agents/runs-lease.test.cjs`.

**Produces:**
- `checkout(context, input: { issue: string; generation: string; runner: string }) → { run: { id, issueId, generation, leaseUntil, state } }`
- `actOnRun(context, runId, input: { event: 'renew' | 'close'; generation: string }) → { run }`. `close` is how a runner confirms the session is gone; it is accepted from the run's own token and generation even after the lease lapsed, and turns `running` or `lost` into `stopped`.
- `GET runs/{id} → { run }` including `ask`

- [ ] Test rule 4: two checkouts of one issue at the same moment give exactly one success and one `409 already_running`; the issue moves to its project's first `in_progress` status. The loser's insert fails on `AgentRun_one_open` with Prisma `P2002`: catch it in `checkout`, because `handoffResponse` would otherwise answer `request_conflict` (`src/lib/agent-handoff-http.ts:22`).
- [ ] Test: in a project with no status in group `in_progress`, checkout succeeds and leaves the status alone.
- [ ] Test rule 5: after the lease lapses, the next inbox read marks the run `lost` and writes `AGENT_RUN_LOST`; the issue is not offered and a checkout answers `409 needs_person`. After `close` from the same token and generation the run is `stopped` and the issue is offered with reason `resume`. For a release seat `close` is refused and only a person can clear it.
- [ ] Test: a person's run has no lease, is never marked lost, and a second `run start` by the same person on the same issue returns the open run.
- [ ] Test: `renew` with another generation, or after the run ended, gives `409 run_fenced`.
- [ ] Test: a person can check out an issue assigned to that person (the run has no seat); a person cannot check out an issue assigned to a seat, and a seat cannot check out an issue assigned to a person (`not_assigned`).
- [ ] Test review focus 1 (reassigned while running).
- [ ] A person clears a lost run from the issue page (`POST /api/issues/[issueId]/runs/[runId]/clear`, session auth, needs the assign permission), which sets it to `stopped`.

### Task A6: finish and the exit rule

**Files:** modify `src/lib/agent-runs.ts`, `src/app/api/apps/auth/runs/[id]/route.ts`, `src/components/issue/sections/activity/utils/activityHelpers.ts`; test `tests/agents/runs-finish.test.cjs`.

**Produces:** `actOnRun(context, runId, input: { event: 'finish'; generation; outcome; note; status?: string; reviewRequest?: string; askedUser?: string; blockedBy?: string; usage?: Usage; alsoFinish?: string[] }) → { run, statusUnmapped: boolean }` where `Usage` is the shape the worker already reports (`src/lib/agent-handoffs.ts:55-60`). `status` names the project status to move to and must be in the outcome's group (`exit_state_required` otherwise); without it the issue moves to the group's status with the lowest `order`, and for `done` to the one marked `isFinal` when there is one. A project can have several statuses in one group (for example `done` and `waiting_for_deploy`), so the caller says which when it matters.

- [ ] Test rule 6: a note missing a heading is refused with `exit_note_required` and `missing: ['Evidence']`; `in_review` without `reviewRequest` or `askedUser`, and `blocked` without `blockedBy` or `askedUser`, are refused with `exit_state_required`.
- [ ] Test: a valid finish ends the run, stores note and usage, writes `AGENT_RUN_FINISHED` with the note in `details` (so it is searchable like handoff notes are), and moves the issue to the first status of the matching category.
- [ ] Test rule 10: `usage` is stored on the run and returned by `GET runs/{id}`.
- [ ] Test: `finish` with `outcome: 'done', status: 'waiting_for_deploy'` moves the issue there; with a status from another group it is refused; without `status` in a project that has both `done` (final) and `waiting_for_deploy` it moves to `done`.
- [ ] Tests for review focus 3 and 4.
- [ ] Test: `alsoFinish` is accepted only from a release seat, only for to do issues assigned to that seat; each gets a finished run with the same note.
- [ ] The issue page shows the open run (who, since when) above the timeline and the last exit note in the timeline, rendered like handoff notes are today (render test in `tests/render`).

### Task A7: run context, requests, and reading in MCP

**Files:** create `src/lib/agent-requests.ts`, `src/app/api/apps/auth/issues/[issueIdOrKey]/run-context/route.ts`, `src/app/api/apps/auth/seats/me/requests/route.ts`; modify `src/lib/agent-runs.ts`, `src/lib/mcp-tools.ts`; tests `tests/agents/runs-context.test.cjs`, `tests/agents/requests.test.cjs`.

**Produces:**
- `runContext(context, issueIdOrKey) → { issue; lastExitNote: string | null; commentsSince: Comment[]; blockers: IssueRef[]; requests: IssueRef[]; commands: string[] }`
- `fileRequest(context, input: { project?: string; role; title: string; body: string; fromIssue: string; blocks?: boolean }) → { issue: { id, issueKey }, warning?: 'seat_idle' }`
- MCP tools `seat_inbox` and `run_context` (read only), one `tool(...)` line each in `src/lib/mcp-tools.ts:82`.

- [ ] Test: `run-context` returns the last exit note and only the comments made after the last run ended; with no earlier run it returns all comments.
- [ ] Test rule 8: a request creates an issue in the target project, assigned to its default seat for the role, with `agentRequestRole` set (and the role label, for people to see), linked to the source (`BLOCKS` when `blocks`, else `RELATES_TO`); with no default seat it is refused (`no_default_seat`); the sixth open request between the same two projects is refused (`request_cap`).
- [ ] Test: the request body is held to the workspace's issue template with the existing refusal (`src/lib/issue-template-enforcement.ts:50`), so a request without the required sections is refused with `template_required`.
- [ ] Test: the requesting seat is the request's reporter and may comment on it, and do nothing else, in the target project.
- [ ] Test: a new comment by someone else on a request a seat filed makes that seat's blocked source issue appear in its inbox with reason `reply`.
- [ ] Test: a request for a release seat that has not read its inbox for 10 minutes succeeds with `warning: 'seat_idle'` and a comment on the new issue (closes the "loud when the release agent is missing" part of CLB-471).

### Task A8: CLI and the interim runner

**Files:** modify `packages/cli/src/commands.mjs`, `packages/cli/bin/collab.mjs`, `packages/cli/README.md`, `packages/cli/skills/collab-agents/SKILL.md`; create `packages/cli/src/seat-run.mjs`; tests in `packages/cli/test/cli.test.mjs`. `packages/cli/src/worker.mjs` is not touched.

**Produces:**
- Commands `seat show`, `seat inbox`, `seat request`, `run start`, `run context`, `run renew`, `run finish` (declared like `'inbox list'` in `commands.mjs`).
- `collab seat run [--once] -- <program> [args...]`, with the seat token in the existing `COLLAB_TOKEN` variable (`packages/cli/src/client.mjs:238`). Loop: poll `seats/me/inbox` every 5 s; check out the first item; start the program without a shell (argv as given), in the current directory, with `COLLAB_RUN_ID`, `COLLAB_RUN_GENERATION` and `COLLAB_ISSUE_KEY` added to its environment; renew the lease every 15 s while it runs; when it exits, read the run: if it is not finished, send `close`. One issue at a time. `--once` stops after one issue.

- [ ] Test: a flag the command does not declare is an error (`unknown_flag`), so `collab inbox list --project X` no longer drops `--project` silently.
- [ ] Tests with a fake program and the fake API the CLI tests already use: a program that finishes its run leaves it `finished` and no `close` is sent; a program that exits without finishing gets `close` and the run is `stopped`; a program that runs for 40 s sees at least two renews; a `409` on checkout is not retried and the loop moves on; the program receives its arguments unchanged with no shell in between.
- [ ] `seat inbox --wait-seconds N` waits like `inbox wait` does today (client-side polling, 1 to 60 s), so a plain script can wait for work without a model.
- [ ] The README shows the two lines people will copy: one starting Claude Code and one starting Codex on `$COLLAB_ISSUE_KEY`, each telling the session to read the run context first and to end with `collab run finish`.
- [ ] The skill gets a "Seats" part (the loop, the exit note, requests) and marks handoffs as "for projects not switched yet".
- [ ] CLI release.

### Task A9: switching a project, Collab first (rule 9)

**Files:** create `src/app/api/workspaces/[workspaceId]/projects/[projectId]/agent-mode/route.ts`, `scripts/seat-carry-over.mjs`; modify `src/lib/agent-handoffs.ts` (`sendHandoff`, the claim branch of `actOnHandoff`), `src/lib/agent-label-triggers.ts`, `src/app/(main)/[workspaceId]/projects/[projectSlug]/settings/ProjectSettingsClient.tsx` (a group select per status and the switch), `AGENTS.md` or `CLAUDE.md` of the repo that switches; test `tests/agents/agent-mode.test.cjs`.

- [ ] Test: in a `seats` project, send and claim are refused with `project_uses_seats`, a subscribed label creates no handoff, and old handoffs can still be read; a `handoffs` project in the same workspace behaves as before.
- [ ] Test: in a `seats` project, adding the `Release request` label to an issue files one release request through `fileRequest`, linked to that issue and assigned to the default release seat; adding it twice files one.
- [ ] A project can have seats and runs before it switches (that is how one issue is piloted); the switch only turns handoffs off for that project.
- [ ] Test: a project can switch back to `handoffs`; the switch back is refused while a run is open in it.
- [ ] The switch dialog lists every status of the project with its group, so a person corrects a wrong guess before switching; the switch is refused while the project has no status in group `in_progress` or `done`.
- [ ] `scripts/seat-carry-over.mjs --project <key> --dry-run` lists claims touched in the last 7 days and the seat each issue would get, and the old agent names whose claims are all in this project; without `--dry-run` it assigns the issues and writes an activity entry. Old names are then retired with the existing `collab agents retire`.
- [ ] The switching repo's instruction file gains three lines: its Collab project, its seats, and "work for another project is asked for with `collab seat request`, never handed over in a direct message" (decision 4; no repo names its project today).
- [ ] Switch the Collab project: the workspace owner creates the developer and release seats that day. On that day the release seat is driven by the release setup that exists, pointed at `collab seat inbox --wait-seconds`; the developer seat by `collab seat run --once` on one small real issue first, then without `--once`.
- [ ] Known limits of the interim runner, to say plainly on switch day: the session it starts has the machine's normal permissions and no spend limit of its own, and its token use is not recorded; moving the release seat to a fresh session per release is a later step.

### Task A10: routines, questions for a person, and "Agents today" (rule 11)

Second migration: table `AgentRoutine { id, workspaceId, projectId, seatId, title, body, everyMinutes, dailyCap @default(3), spendCapUSD?, nextDueAt, enabled @default(true), pausedReason?, createdById, createdAt, updatedAt }`.

**Files:** migration `20261123000100_agent_routines`; create `src/lib/agent-routines.ts`, routine routes under `src/app/api/workspaces/[workspaceId]/projects/[projectId]/routines/`, `src/app/api/issues/[issueId]/runs/[runId]/answer/route.ts`; modify `src/lib/agent-runs.ts` (inbox calls `materializeDueRoutines`, `actOnRun` gains `ask`), the agent inbox page (`src/app/(main)/[workspaceId]/agent-inbox/page.tsx`); test `tests/agents/routines.test.cjs`.

- [ ] Test: ten inbox reads at the same moment on a due routine create exactly one issue (compare-and-set on `nextDueAt`), assigned to the routine's seat, with an `AGENT_ROUTINE_CREATED` activity.
- [ ] Test: a routine whose body lacks the sections the workspace's issue template requires is refused when it is saved, not when it fires.
- [ ] Test: after `dailyCap` issues in one day no more are created; when the day's recorded spend of the routine's issues passes `spendCapUSD` the routine is switched off with a `pausedReason`.
- [ ] Test: `ask` puts the run in `waiting` with the question; a person's answer is returned by `GET runs/{id}`. The runner keeps renewing while it waits, so `ask` is for short approvals; a question that can wait hours is a `blocked` finish with `askedUser`. The seat's owner may answer, and so may anyone with the assign permission, which covers seats without an owner.
- [ ] "Agents today" on the agent inbox page: runs per seat, outcomes, cost, lost runs, open questions, paused routines.

### Task A11: close out the old issues

- CLB-445: its remaining two-computer proof moves to the separate runner runner plan; close with that note.
- CLB-447, 449, 454: resolved by design (the owning seat keeps the issue through review); close after the Collab project has switched and one review request has gone round.
- CLB-448, 450, 451, 452, 453: the one-release-seat rule covers the Collab side; the deployment lock on the target and the Sportsbook pilot stay open and are re-scoped to "after Sportsbook switches".
- CLB-471: closed by A7 (idle warning) and A9; "release agent on a server" moves to the separate runner's plan.
- CLB-479: closed as replaced (seats are few and stable; `lastSeenAt` shows a dead one).
- CLB-458: no further work; `claimedOnce` stops mattering in switched projects.
- CLB-399: covered by the scope tests in A3; close with a link to them.
