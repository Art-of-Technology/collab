# Agent seats and public documentation: design

Approved on 15 November 2026. Tracked in the private backlog as epic CLB-482.

## Why

An audit found that nothing ties an agent to a project: registration, inbox, claim and label triggers are all workspace-wide. Handoffs did not leak across projects by accident, but cross-project work also travels in direct session-to-session messages that Collab never sees, open handoffs pile up, and long-lived agent sessions spend most of their tokens carrying old context.

The decisions, in one sentence: an agent becomes a seat (one project, one role), the issue becomes the unit of work, every run is a fresh session, Collab owns the work and a separate runner owns the run.

## Design

### What it is for

- A seat can only be given work on purpose, in its own project.
- The board is the truth: one issue, one owner, one status.
- A run costs what the task costs, not what an old conversation costs.
- Any runner can drive a seat through one small contract, so a separate runner product can take over running without Collab changing.
- Agents and people read the same documentation.

Not goals: building a second runner in Collab; an org chart of agents; moving existing handoff history; changing how people work issues by hand.

Would count as failure: a seat acting on an issue nobody assigned to it; two runs on one issue; a project forced to switch before it is ready; docs for agents that differ from docs for people.

### Terms

- **Seat**: one project, one role, and optionally an owner (the person whose logins run it; a release or routine seat paid by an API key has none). Backed by a Collab agent token, which already is a service account that can be assigned issues.
- **Role**: `developer`, `reviewer` or `release`. One release seat per project.
- **Run**: one fresh session working one issue under a lease, from checkout to finish.
- **Request**: a new issue assigned to a seat of a given role, linked to the issue it came from. Used between projects, and inside a project for review and release.
- **Exit note**: the text a run leaves on finish, with four headings: Done, Decisions, Evidence, Next.

### Rules (each one is tested)

1. Work reaches a seat only by assignment: `Issue.assigneeId` is the seat's account. Nothing unassigned is ever offered.
2. A seat token may write only to issues of its own project, and to nothing else: every other write the API offers (projects, workspace settings, labels, context, posts and so on) is refused for a seat unless a route opts in. It may read the workspace as a member does today. The one exception is rule 8.
3. Inbox order: issues to resume (a run stopped without finishing), then in review or blocked issues with something new (a reply, a finished review, a resolved blocker), then to do issues by priority and age. In review and blocked issues with nothing new are not offered. Where an issue stands is read from its last run's outcome; the board status is only a mirror of it, so a project without a "blocked" status still works.
4. Checkout is atomic. One open run per issue; a second checkout gets `409 already_running` and is never retried by the caller.
5. A seat's run holds a 60 second lease and renews it. When the lease lapses the run is marked `lost` on the next read and the issue is **not** offered again: a lapsed lease does not prove the session stopped. It is offered again, with reason `resume`, only after the runner that held it confirms the session is gone (`close`), or a person clears it. A release seat's lost run can only be cleared by a person. A person's own run has no lease and does not expire.
6. A run finishes with one of `done`, `in_review`, `blocked`, plus an exit note with all four headings. `in_review` must name the review request it filed or the person asked. `blocked` must name the blocking issue or the person asked. Anything else is refused with `exit_note_required` or `exit_state_required` and a list of what is missing.
7. Roles decide what may be assigned: a release seat takes only release requests, a reviewer seat only review requests, a developer seat everything else. A request is recognised by a field that only filing a request sets (`Issue.agentRequestRole`), never by a label, because a label can be put on any issue. Only a person, a routine, a request or an integration assigns an issue to a seat; a seat cannot assign. An integration (an agent token that is not a seat, such as a CRM's) may assign at most 5 new issues per day to seats; over that, its issues are filed unassigned and wait for a person (decided 15 Nov 2026). What a role may do outside Collab (merge, deploy) is limited by the tool list the runner gives it, which is the runner's side: Collab enforces who gets which work, not what a session does on a machine.
8. A seat may file a request: a new issue in the target project, held to the workspace's issue template, assigned to that project's default seat for the role, linked to the source issue. The seat may comment on a request it filed and do nothing else there. At most 5 open requests from one project to another. A reporter states the problem and the evidence, never the fix.
9. A project is either in `handoffs` mode (today) or `seats` mode. In `seats` mode, sending or claiming handoffs on that project's issues is refused with `project_uses_seats` and label subscriptions no longer create handoffs; old handoffs stay readable. Adding the `Release request` or `Review request` label to an issue files the matching request, so asking by label keeps working. Any agent token of the workspace may add `Release request`, also one that is not a seat (decided 16 Nov 2026, CLB-527: this loosens rule 7 for the release label only); `Review request` from such a token is refused with `assign_by_person`. Messages are issue comments. A mention never assigns. A project can switch back to `handoffs` while no run is open in it.
10. Finishing a run records its usage (tokens, estimated cost) on the run, so cost per issue is visible.
11. Routines: a routine belongs to a seat and has an interval, a title, a body, a daily cap on new issues and a spend cap. When the seat's inbox is read and the routine is due, Collab creates its issue once (idempotent per period) and assigns it to the seat. No scheduler runs in the app.
12. Two access checks are tightened on the way (details are in the private tracker, CLB-484, until the fix is deployed).

### Shape in Collab

- Data, all additive: tables `AgentSeat` and `AgentRun`; columns `ProjectStatus.category` (`todo`, `in_progress`, `in_review`, `blocked`, `done`, backfilled from the status name), `Project.agentMode` with `agentSwitchedAt`, and `Issue.agentRequestRole`. Later, with routines: table `AgentRoutine`.
- New code lives in new files (`src/lib/agent-seats.ts`, `src/lib/agent-runs.ts`), not in `src/lib/agent-handoffs.ts`. It reuses the atomic `updateMany` claim pattern, the 60 second lease and generation fence, the issue-template refusal style, `createAgentToken`, issue relations, the MCP `tool(...)` declaration and the real-PostgreSQL test harness in `tests/agents`.
- The contract, under `/api/apps/auth`. A runner calls it with the seat's token; a person's session calls the inbox and run calls with that person's login, for issues assigned to that person:

| Call | Does |
|---|---|
| `GET seats/me` | The seat: project, role, owner |
| `GET seats/me/inbox` | Ordered, compact list; each item has a `reason` |
| `POST runs` | Checkout an issue, returns the run and its lease |
| `GET runs/{id}` | The run, including a pending question and its answer |
| `GET issues/{key}/run-context` | One call a fresh session needs: issue, last exit note, comments since the last run, blockers, links to project context |
| `PATCH runs/{id}` | `renew`, `finish`, `close` (the runner confirms the session is gone) or `ask` (a question or approval for a person) |
| `POST seats/me/requests` | File a request for a role in a project |

- People create seats on the existing Agent tokens settings page (project and role added to the form). Seats show in the assignee picker with a badge, only for issues of their project. The issue page shows the running run and the last exit note.
- The interim runner (the workspace owner's choice, 15 Nov 2026) is one small CLI command, `collab seat run`: it waits for the seat's next issue without a model, checks it out, starts a fresh ordinary Claude Code or Codex session in the repo with the machine's normal permissions, renews the lease while that session lives, and confirms the stop when it exits. The session itself reads the run context and finishes the run. It has no token counts or budgets; those come with the separate runner, which replaces it. The restricted worker that exists today cannot run shell commands, so it cannot commit or open a pull request, and is left as it is for projects still on handoffs.
- A person's own session uses the same run calls on issues assigned to that person (`collab run start`, `collab run finish`), so "one task, one session, one exit note" holds for a person's own sessions too.

### Documentation

- Published pages are Markdown files in a new folder `content/docs/`, listed in one navigation file. The existing `docs/` folder stays internal.
- One source, three outputs that cannot drift: the page at `/docs/...`, the same page as plain Markdown at `/docs/....md`, and index files `/llms.txt` and `/llms-full.txt`. Two MCP tools, `docs_search` and `docs_get`, read the same files.
- Search: one index built from the Markdown at build time, searched in the browser (⌘K) and by `docs_search` on the server with the same code, so agents and people get the same results. The workspace owner's two priorities, in his words: "agents read it as well as people" and "finding things fast".
- Layout like Vercel's docs: sections on the left, headings of the page on the right, search on top, previous and next at the bottom, "copy page as Markdown".
- Page shape: a title, one line saying what the page is, numbered steps, short lists, one next step. Diagrams are Mermaid text.
- A check in CI fails when a page links to nothing, names a `collab` command that does not exist, is missing from the navigation, or lacks its title and one-line summary.
- Reference pages for CLI commands and MCP tools are generated from the code, as the command list is today.
- Rendering reuses `src/components/ui/markdown-renderer.tsx` and the Mermaid loader in `src/lib/mermaid-diagrams.ts`. No MDX, because the production build is capped at 3072 MB. One small new dependency for search (MiniSearch).
- `/docs` and `/docs/cli` are public in production today and existing links to them keep working.

### The designer's calls (not the workspace owner's words; he can overrule any)

- Seat = agent token plus project, role and owner; several developer seats per project are allowed, one per person.
- Messages in a switched project are issue comments; handoff objects become history only.
- Review and release are requests inside the project, the same mechanism as requests between projects.
- Routines are created lazily when the inbox is read.
- Status groups are a new column, editable per status, backfilled by name.
- No second harness is built in Collab: the interim runner is one command that starts an ordinary session.
- Search is a static index with MiniSearch, not the database.
- Approvals for risky tools: Collab only carries the question and the answer (`ask` on a run); the runner enforces.

### Where this differs from what the workspace owner chose, said plainly

- "Three roles, enforced by the server": Collab enforces which work each role gets. What a session may do on a machine (merge, deploy) can only be limited where it runs, by the runner's tool list.
- "Claude Code and Codex from the first version": kept. The interim command starts whichever program it is given, and the separate runner has launchers for both.
- Budgets and token counts per run (rule 10) are empty in the interim, because an ordinary session does not report them. They fill in when the separate runner takes over.
- "One daily summary": in Collab it is a page, "Agents today". A message pushed to Slack or email needs a sending tool, which lives on the runner side.
- "Fresh session per task, everywhere": on Collab's switch day the release seat is still driven by today's long-lived release setup. Moving it to a fresh session per release is a later step, because it needs the deploy tools on a runner.

## Order and size

1. Plan B tasks B1 to B5 start at once. They need no database change and do not depend on Plan A.
2. Plan A runs in order: A1 (a migration) → A2 → A3 → A4 → A5 → A6 → A7 → A8 (a CLI release) → A9 (the Collab project switches) → A10 (a second migration) → A11.
3. Docs pages about seats (B6) are written by each Plan A task as it ships.
4. Other projects switch after Collab, one at a time, when their owner is ready. Nothing forces them.

## What a runner must do

A runner is whatever starts sessions for seats. It is not part of this repository beyond the small interim command described above.

1. Speak the contract with a seat token: poll the inbox, check out, start a fresh session, renew, finish with an exit note and usage, or confirm the stop.
2. Hold each person's model and Git logins in that person's own environment.
3. Give each seat its tool list; secrets never leave the runner; a tool marked risky pauses the run and asks through `ask` on the run.
4. Enforce budgets per seat and per run, and report usage on finish.
5. Keep customers apart.
