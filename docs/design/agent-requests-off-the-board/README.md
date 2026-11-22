# Agent requests off the board

Design note for epic CLB-1015. The repository's owner asked for it on 22 November 2026 and is the person waiting for it.

## The problem

When a seat asks another seat for a review, a security review, a release or developer work, Collab creates an ordinary Task for it (`fileRequest` in `src/lib/agent-requests.ts`), and a seat files a new one for every new commit. A person who opens a board or reads a count now reads mostly these. On 22 November 2026 one project had 258 issues, and 170 of them were review or security requests; one pull request had 15.

## The three lines

- **Who is waiting:** the repository's owner.
- **First day:** he opens that project's board and its counts and sees about a third of what they show today, with each issue's requests in one line on the issue.
- **Smallest version:** requests stay what they are and are filed as today. Lists, boards and counts for people leave them out unless a person switches them on, and the issue a request was filed for shows where its requests stand.

## What exists today

Checked against commit `3e0e289` of `main`.

- A request is a Task whose `agentRequestRole` is `review`, `release`, `security` or `developer`. It is linked to the issue it was filed for: it blocks it, or relates to it.
- The project overview and the burn chart already keep requests apart from work (`src/lib/project-burn.ts` counts them as requests handled).
- The issue page already shows an issue's security reviews above its timeline (`SecurityReviews` in `src/components/issue/sections/activity/components/OpenRun.tsx`, fed by `openRun` in `src/lib/agent-runs.ts`).
- A view loads its issues in two ways: a server query in `src/app/(main)/[workspaceId]/views/[viewId]/page.tsx` and in `views/dynamic/page.tsx`, and `GET /api/issues` for live data (`useIssuesByWorkspace`).
- The project summary (`src/app/api/projects/[projectId]/summary/route.ts`) and the workspace dashboard (`src/lib/dashboard/workspace-overview.ts`) count every issue, requests included.

## Decisions

1. **Routes for people leave requests out by default.** These are `GET /api/issues`, the two view pages, the project summary and the workspace dashboard. A request is an issue whose `agentRequestRole` is not null.
2. **Routes for agents do not change.** That is everything under `/api/apps/auth/**`, the seat inbox, the run context, the requests page under Agents, search, and the count that guards deleting a status. A seat must never lose a request.
3. **One switch.** The Display menu of a view gets "Agent requests", off by default and kept like the other display choices of that view. Switched on, the view asks for requests too.
4. **The line on the issue.** The issue page shows one line per request role above the timeline, in place of the security-only line: the latest request of that role, its key as a link, and where it stands. A security request shows its verdict and what was reviewed, as today.
5. **No schema change.** Nothing is migrated, merged or deleted.

## Hand-overs

| From | To | What crosses | Pinned by |
| --- | --- | --- | --- |
| `issues` | `projects-and-views` | `withoutRequests(where, include)` exported from `src/lib/issue-requests.ts`. `GET /api/issues?requests=1` returns requests too, and every row carries `agentRequestRole`. `useIssuesByWorkspace(workspaceId, projectIds, { requests })`. | `tests/security/issues-requests.test.cjs` |
| `agent-seats` | `issues` | `GET /api/issues/[issueId]/runs` answers `requests` beside `run` and `security`: a list of `{ role, requestKey, state, reviewed?, by? }`, the latest request of each role, with `state` one of `open`, `done`, `passed`, `failed`, `closed`. | `tests/agents/issue-requests.test.cjs` |

`security` stays in the answer until the issue page no longer reads it.

## The cut

| Wave | Story | Context | Needs |
| --- | --- | --- | --- |
| 0 | Lists for people leave requests out | `issues` | nothing |
| 0 | The runs answer lists an issue's requests | `agent-seats` | nothing |
| 1 | Views leave requests out, with the switch | `projects-and-views` | the first story |
| 1 | One line of requests on the issue page | `issues` | the second story |
| 2 | Counts for people leave requests out | `projects-and-views` | the first story |

At most two developer seats work at the same time.

## Not in this slice

- Reopening one request for a new commit instead of filing a new one, and counting the rounds. That starts only after this slice has been used.
- Any change to `collab seat request`, to seat texts or to how a verdict is recorded.
- Reports about rework, use or cost.
