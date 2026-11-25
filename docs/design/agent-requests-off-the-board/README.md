# Agent requests off the board

Design note for epic CLB-1015. The repository's owner asked for it on 22 November 2026 and is the person waiting for it.

## The problem

When a seat asks another seat for a review, a security review, a release or developer work, Collab creates an ordinary Task for it (`fileRequest` in `src/lib/agent-requests.ts`), and a seat files a new one for every new commit. A person who opens a board or reads a count now reads mostly these. On 22 November 2026 one project had 258 issues, and 170 of them were review or security requests; one pull request had 15.

## The three lines

- **Who is waiting:** the repository's owner.
- **First day:** he opens that project's board and its counts and sees about a third of what they show today.
- **Smallest version:** requests stay what they are and are filed as today. Lists, boards and counts for people leave them out unless a person switches them on. The issue page keeps the security line it has today.

## What exists today

Checked against commit `3e0e289` of `main`.

- A request is a Task whose `agentRequestRole` is `review`, `release`, `security` or `developer`. It is linked to the issue it was filed for: it blocks it, or relates to it.
- The burn chart keeps requests apart from work (`src/lib/project-burn.ts` counts them as requests handled). The project Overview does not: its Work list and its completion totals count requests (`src/lib/project-overview.ts`).
- The issue page already shows an issue's security reviews above its timeline (`SecurityReviews` in `src/components/issue/sections/activity/components/OpenRun.tsx`, fed by `openRun` in `src/lib/agent-runs.ts`).
- A view loads its issues in two ways: a server query in `src/app/(main)/[workspaceId]/views/[viewId]/page.tsx` and in `views/dynamic/page.tsx`, and `GET /api/issues` for live data (`useIssuesByWorkspace`).
- The project summary (`src/app/api/projects/[projectId]/summary/route.ts`) and the workspace dashboard (`src/lib/dashboard/workspace-overview.ts`) count every issue, requests included.

## Decisions

1. **Routes for people leave requests out by default.** These are `GET /api/issues`, the two view pages, the project summary, the project Overview and the workspace dashboard. A request is an issue whose `agentRequestRole` is not null.
2. **Routes for agents do not change.** That is everything under `/api/apps/auth/**`, the seat inbox, the run context, the requests page under Agents, search, and the count that guards deleting a status. A seat must never lose a request.
3. **One switch.** The Display menu of a view gets "Agent requests", off by default and kept like the other display choices of that view. Switched on, the view asks for requests too.
4. **The issue page does not change in this slice.** It keeps the security line it has today. A line for the other request roles needs a record of the issue a request was filed for that cannot be edited afterwards. A relation does not do: anyone who reads both issues can add or delete one, so an issue could show a request that was filed for another (the security review of pull request #787). That record, and the line, belong to the next slice.
5. **No schema change.** Nothing is migrated, merged or deleted.

## Hand-overs

| From | To | What crosses | Pinned by |
| --- | --- | --- | --- |
| `issues` | `projects-and-views` | `withoutRequests(where, include)` exported from `src/lib/issue-requests.ts`. `GET /api/issues?requests=1` returns requests too, and every row carries `agentRequestRole`. `useIssuesByWorkspace(workspaceId, projectIds, { requests })`. | `tests/security/issues-requests.test.cjs` |

## The cut

| Wave | Story | Context | Needs |
| --- | --- | --- | --- |
| 0 | Lists for people leave requests out (CLB-1023) | `issues` | nothing |
| 1 | Views leave requests out, with the switch (CLB-1025) | `projects-and-views` | the first story |
| 2 | Counts for people leave requests out: the project summary and the project Overview (CLB-1027) | `projects-and-views` | the first story |
| 3 | Home page counts leave requests out (CLB-1068) | `projects-and-views` | the first story, and CLB-942, which changes the same files |

At most two developer seats work at the same time.

## Not in this slice

- A line on the issue page for review, release and developer requests, and the record of filing it needs (decision 4).
- Reopening one request for a new commit instead of filing a new one, and counting the rounds. That starts only after this slice has been used.
- Any change to `collab seat request`, to seat texts or to how a verdict is recorded.
- Reports about rework, use or cost.

## Changed on 23 November 2026

Two things in the first version of this note were wrong, and the owner decided both on CLB-1015.

- It took a relation as proof of the issue a request was filed for. The security review of pull request #787 showed that a relation can be moved. The request line left this slice, with the two stories cut for it (CLB-1024 and CLB-1026).
- It said the project Overview already kept requests apart from work. Only Burn does. The Overview joined the counts story, and the Home page counts became their own story because CLB-942 changes the same files.
