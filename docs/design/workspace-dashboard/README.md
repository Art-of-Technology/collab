# Workspace dashboard: what needs a person, first

The design the owner approved on 21 November 2026 for Home (`/[workspace]/dashboard`). It replaces the page that [`docs/workspace-dashboard.md`](../../workspace-dashboard.md) describes; that file is rewritten when the last issue of this work merges.

The clickable mockup the choices were made in is a project note in Collab, named in the epic. It uses sample data.

## Why

The page counts issues and due dates. In a workspace where most work is done by seats, that misses what a person opens the page for:

- A seat's question, or a run that was lost, never reaches the page. The person looks in the Seats page, the Floor and the issue.
- "Needs attention" is ordered by due date, so issues of projects nobody has touched for a year fill it.
- The repository list dates each item and labels its last refresh or refresh attempt. It does not count repositories without a confirmed refresh in the last 24 hours.

## The page

```
+----------------------------------------------------------------------+
| Workspace overview                           [ All work | My work ]  |
| 6 things need you. Oldest question: <seat>, 3 h ago. 1 failed run.   |
| 9 changes shipped today.            Updated 2 min ago · Refresh      |
+------------------------------------------+---------------------------+
| NEEDS YOU  6                             | AGENTS NOW    Open Floor  |
| [All] [Questions] [Reviews] [Failed] [Due]| 7 working · 2 waiting ... |
| Question  <title>            [Answer]    | (seat) (seat) (seat) ...  |
| Review    <title>   [Open pull request]  +---------------------------+
| Failed    <title>                        | SHIPPED TODAY  9          |
|           [Session has stopped: clear run]| <key> <title>             |
| Due       <title>        [Open issue]    | Merged 2 h ago            |
|                                          +---------------------------+
|                                          | DUE IN THE NEXT 7 DAYS  3 |
+------------------------------------------+---------------------------+
| ACTIVE PROJECTS  8        [Cards | Table]  [ Find a project ]        |
| (card) (card) (card) (card)                                          |
| 58 dormant projects · 84 overdue issues · no change in 30 days [Show]|
+----------------------------------------------------------------------+
```

On a phone it is one column in this order: Needs you, Agents now, Shipped today, Due, Projects. Nothing is hidden.

## Decided

| # | Decision |
| --- | --- |
| 1 | The page is built for the workspace owner first. Everyone else gets the same page; "My work" narrows it. |
| 2 | "Needs you" is the first and widest panel. The four counters and "Recently updated issues" go. |
| 3 | Agents appear as one summary panel that links to the Floor. It is not a second Floor. |
| 4 | A project with no issue change for 30 days is dormant. Dormant projects are not counted and collapse into one line. |
| 5 | One fixed layout. No widgets, no per-person arrangement. |
| 6 | A seat is answered in the row: a suggested answer or typed text, sent as a comment on the issue. |
| 7 | Projects show as cards with a trend line. A Cards / Table switch sits above them; the choice is kept in the browser (`localStorage`), cards first. |
| 8 | The sentence under the title is assembled from the panels' counts. No model is called. |
| 9 | Times are relative ("3 h ago", "due tomorrow") with the exact UTC time in `title` and `dateTime`. |
| 10 | The page reloads its data when the tab becomes visible again and when Refresh is pressed. No timer. |
| 11 | Merging stays on the Git provider: a review row links to the pull request. |
| 12 | "Shipped today" uses saved merge and publication times, and says how many connected repositories have no confirmed refresh in the last 24 hours, including those with no known success. Fixing the refresh is other work. |
| 13 | The single-project view (`?project=<id>`) is not changed. |
| 14 | `SimplifiedDashboard` and the `/api/ai/dashboard` route are deleted: no screen uses them. |

## Panels

The server starts the panel reads in parallel with the current session. Each panel shows its own `denied` or `unavailable` state. Agents now also needs the waiting-seat IDs from Needs you to classify seats. A loader never returns a row the viewer could not open.

### Needs you

A row is one issue that cannot go on until a person acts. In both scopes, start with readable issues in active projects (see Projects below). Use the matching rows for the kind counts, project totals and sentence before taking the first 20 for display. Sort by kind in the order below, then by `since`, oldest first.

For both questions and reviews, the unfinished issue must still be assigned to the user of the seat that ran it, in that seat's project. Its latest run must have finished `in_review` or `blocked` and named a person (`askedUser`). Match the finish facts to that run ID. As in `inboxOf`, the run must have ended on or after the current assignment time (the assignee's helper record's `approvedAt`, then `assignedAt`, then issue creation as fallback). A later comment by anyone other than the seat's user answers the question.

| Kind | Is in the list when | Leaves the list when | Button |
| --- | --- | --- | --- |
| `question` | The seat's current question is unanswered and its run gave no pull request | It is answered, the assignment changes, a newer run starts or the issue is done | Answer |
| `review` | The same current, unanswered question, with a pull request from that run | The same | Open pull request |
| `failed` | As in `readSeats`, the run is open (`endedAt` is null) and either its state is `lost` or its non-null `leaseUntil` is earlier than now | The run ends or no longer meets the lost predicate | Session has stopped: clear run |
| `due` | The issue is assigned to the viewer, not done, and due before now plus 7 days | It is done or its date moves | Open issue |

- **All work** shows all eligible rows. **My work** keeps those where the viewer is the named person, owns the row's seat, or is the issue's assignee. Both scopes apply the current-assignment check before matching a question or review. `due` rows are the viewer's own in both.
- A `question` row opens in place with the seat's next step and a text field. Sending posts a comment through the existing issue comment route with its own checks. Empty text is refused in the row. After a successful send, refresh the rows and counts. Name the seat that can pick up the reply only if it still holds that assignment.
- Only viewers with permission to assign issues see “Session has stopped: clear run”. Pressing it confirms that the person has checked the old session stopped and calls `POST /api/issues/:issueId/runs/:runId/clear`. A missed lease alone cannot establish that the process stopped. The route checks permission and run state again before releasing the checkout. On success, refresh the row and counts. The action test checks that the request requires confirmation and that clearing releases the checkout.
- Filter chips (All, Questions, Reviews, Failed runs, Due) filter the sent rows in the browser and show each kind's exact count.
- The mockup shows two suggested answers per question. Seats do not record suggestions today, so the first version has the text field only. Suggested answers are not part of this work.

### Agents now

From `readSeats` in `src/lib/agents-page.ts`, read only, with its rules unchanged (a seat's room stays hidden from people who may not see it).

- One chip per seat with a state: `working` (an open run with `working[].lost` false), `failed` (an open run with that flag true, the same lost predicate used by Needs you), `waiting_on_person` (no open run and the seat is in the complete waiting-seat set), `idle` (the rest). The counts line sums the chips. If the waiting-seat set is missing, show Agents now as unavailable.
- Pressing a chip shows the seat's line: name, state, issue key.
- "Open Floor" links to `/[workspace]/agent-inbox/floor`.
- The runner line shows each runner's name and reported state as `readSeats` returns them. No new read of runners.

### Shipped today

Replaces "Recent repository activity". Keep the project, repository and release access checks and the canonical identities used by `src/lib/dashboard/repository-overview.ts`.

- Use `PullRequest.mergedAt` for a merged pull request and `Release.publishedAt` for a published, non-draft release. A provider update (`GitConnectionActivity.date` or `PullRequest.githubUpdatedAt`) cannot date a merge. Exclude records without the event time or outside the last 24 hours before deduplicating. Count the distinct events, then send the newest five. Use the same event time for the row's age.
- For each distinct connected repository in a project, use the latest successful `GitConnection.syncedAt` across its authorized connections. Legacy `Repository.syncedAt` records an attempt. Count the repository once if its last success is older than 24 hours or unknown, even if a recent attempt is recorded. When the count is positive, show “N connected repositories have no confirmed refresh in the last 24 hours”.
- A row is labelled "Merged" or "Released". A release is still not a deployment and the panel does not say "deployed".

### Due in the next 7 days

Unfinished issues of active projects due from now through 7 days ahead, earliest first, five rows and the exact count. In "My work", the viewer's own. Overdue issues of active projects are counted on their project; they are not listed here.

### Projects

- **Active** means the project's latest visible issue change is 30 days old or less. Determine this before narrowing issues to My work, searching projects or paging. Needs you, Due, cards, the table and the dormant line all use this classification. The page size stays 10.
- A card shows: name and colour, how many "Needs you" rows the project has, open issues, overdue issues, seats working, the latest issue change, and a 14-day line of issues finished per day.
- "Finished per day" counts issue status changes into a final status (`IssueActivity` with a `newStatus` whose `isFinal` is true), by UTC day, for issues the viewer may read. In "My work", for issues assigned to the viewer.
- The table shows the same fields as columns.
- The dormant line gives the number of dormant projects and their overdue issues. "Show" is a link (`?dormant=1`) that lists them, paged, with open, overdue and latest change. Dormant projects never count in the sentence or on a card.

### The sentence

Build the sentence from ready panels: `N things need you. Oldest question: <seat>, <age> ago. N failed runs. N changes shipped today.` Use the exact Needs you counts for the current scope and the deduplicated Shipped today total. Omit zero or unknown clauses. When no clause remains, show “Nothing needs you” only if Needs you is ready with zero matches. Otherwise omit the sentence.

## Contexts

A finer cut of the dashboard paths, for this work. Each feature issue holds one context. The final cleanup removes the fallback from the shell and its loader together.

| Context | Paths | Tests |
| --- | --- | --- |
| `dashboard-shell` | `src/app/(main)/[workspaceId]/dashboard/page.tsx`, `.../dashboard/components/WorkspaceOverview.tsx`, `.../dashboard/components/DashboardRefresh.tsx`, `.../dashboard/components/RelativeTime.tsx`, `src/types/workspace-dashboard.ts`, `docs/workspace-dashboard.md` | `tests/render/workspace-dashboard.test.cjs` |
| `dashboard-needs-you` | `src/lib/dashboard/needs-you.ts`, `.../dashboard/components/NeedsYouPanel.tsx` | `tests/security/dashboard-needs-you.test.cjs`, `tests/render/dashboard-needs-you.test.cjs` |
| `dashboard-agents` | `src/lib/dashboard/agents-now.ts`, `.../dashboard/components/AgentsNowPanel.tsx` | `tests/security/dashboard-agents-now.test.cjs`, `tests/render/dashboard-agents-now.test.cjs` |
| `dashboard-shipped` | `src/lib/dashboard/repository-overview.ts`, `.../dashboard/components/ShippedPanel.tsx` | `tests/security/workspace-repository-overview.test.cjs`, `tests/render/dashboard-shipped.test.cjs` |
| `dashboard-projects` | `src/lib/dashboard/workspace-overview.ts`, `.../dashboard/components/ProjectsPanel.tsx`, `.../dashboard/components/DueSoonPanel.tsx` | `tests/security/workspace-dashboard-data.test.cjs`, `tests/render/dashboard-projects.test.cjs` |
| `dashboard-legacy` | `src/components/dashboard/**`, `src/app/api/ai/dashboard/**` | `tests/security/ai-dashboard-access.test.cjs`, dashboard route load and case in `tests/security/profile-notifications.test.cjs` |

Not in any of them, and not changed: `.../dashboard/components/DashboardClient.tsx` (the single-project view), `src/lib/agents-page.ts`, `src/lib/agent-runs.ts`, the comment and run routes.

## Contracts

All types are in `src/types/workspace-dashboard.ts`. The shell task writes them; a later issue that needs a field changed says so on its card and changes it first, in its own commit.

```ts
type Panel<T> = { kind: 'denied' | 'unavailable' } | ({ kind: 'ready' } & T);

type NeedsYouKind = 'question' | 'review' | 'failed' | 'due';
type NeedsYouItem = {
  id: string;                 // `${kind}:${issueId}`
  kind: NeedsYouKind;
  issue: { id: string; issueKey: string | null; title: string; project: DashboardProject };
  seat: { id: string; name: string } | null;   // current assigned seat for questions/reviews, run seat if any for failed, null for due
  since: string;              // ISO: run end for questions/reviews, leaseUntil (or startedAt if absent) for failed, due date for due
  text: string | null;        // the run's next step, for `question` and `review`
  pullRequest: string | null; // OWNER/REPO#NUMBER, for `review`
  runId: string | null;       // for `failed`
  canAct: boolean;            // may comment (question, review) or may clear the run (failed)
};
type NeedsYouOverview = Panel<{
  generatedAt: string; items: NeedsYouItem[];
  counts: Record<NeedsYouKind, number>;        // scoped active-project rows, before the preview
  byProject: Record<string, number>;           // same rows grouped by project ID
  waitingSeatIds: string[];                    // distinct seats of all matching questions/reviews, before the preview
}>;

type SeatState = 'working' | 'waiting_on_person' | 'failed' | 'idle';
type AgentsNowOverview = Panel<{
  seats: Array<{ id: string; name: string; project: DashboardProject; state: SeatState; issueKey: string | null }>;
  counts: Record<SeatState, number>;
  runners: Array<{ name: string; state: string | null }>;
}>;

type ShippedOverview = Panel<{
  items: Array<{ id: string; kind: 'merged' | 'released'; title: string; project: DashboardProject;
    repository: string; url: string | null; at: string }>; // ISO merge or publication time
  total: number;                // distinct events in the window, before the five-row preview
  connectionCount: number;      // distinct connected repositories within their projects
  staleRepositories: number;    // no recorded successful refresh in the window
}>;
```

`WorkspaceIssueOverview` (ready) keeps returning the populated `attention` and `recent` arrays for the existing shell fallbacks through waves 1 and 2. Its `summary` counts active projects only. Add `dueSoon: DashboardIssue[]`, `dueSoonTotal: number`, `dormant: { projects: number; overdueIssues: number }`, `showingDormant: boolean`, and on each project `seatsWorking: number` and `finishedPerDay: number[]` (14 numbers, oldest first).

| Hand-over | What crosses | Pinned by |
| --- | --- | --- |
| loader to shell | A loader returns `null` while it is not built. The shell keeps the existing content for that slot. Ready panel data includes exact totals independently of its preview. | `tests/render/workspace-dashboard.test.cjs` › "a panel whose loader returns null is skipped" |
| needs-you to projects | `NeedsYouOverview.byProject`, passed by the shell to the projects panel as `needsByProject` | `tests/render/dashboard-projects.test.cjs` › "a card shows how many rows need a person" |
| needs-you to agents | Start the seat read alongside Needs you. After both resolve, the shell passes the authorized seat data and `NeedsYouOverview.waitingSeatIds` to the seat classifier. Preserve a denied or unavailable seat read. With ready seats but no ready Needs you result, return `unavailable` for Agents now. | `tests/security/dashboard-agents-now.test.cjs` › "a seat with a question outside the preview waits on a person" |
| needs-you to comment route | `POST /api/issues/:issueId/comments`, unchanged | `tests/render/dashboard-needs-you.test.cjs` › "sending an answer posts one comment and removes the row" |

## Order of work

| Wave | Issue | Context | Needs |
| --- | --- | --- | --- |
| 0 | Shell: layout, panel slots, types, relative times, refresh on return | `dashboard-shell` | nothing |
| 0 | Delete the unused dashboard code and route-specific test. Remove only the retired route load and case from the shared profile, timeline and notification suite. | `dashboard-legacy` | nothing |
| 1 | Needs you: the list | `dashboard-needs-you` | the shell |
| 1 | Projects: active and dormant, and what is due | `dashboard-projects` | the shell |
| 1 | Agents now | `dashboard-agents` | the shell |
| 1 | Shipped today | `dashboard-shipped` | the shell |
| 2 | Needs you: answer a seat and clear a lost run after the person confirms the session stopped | `dashboard-needs-you` | the list |
| 2 | Projects: cards, the table switch and the trend line | `dashboard-projects` | active and dormant |
| 3 | Finish: remove the fallback consumers together with the `attention` and `recent` fields and reads, and rewrite `docs/workspace-dashboard.md` | `dashboard-shell` with `dashboard-projects` for the loader | everything above |

In wave 1, the list and the projects issue are handed out first. Each issue is released when it merges, the way this project already releases.

## Not in this work

- Suggested answers for a seat's question.
- A merge button, or anything else that writes to a Git provider.
- Refreshing repository data, and deployment events.
- Charts beyond the one line per project.
- The single-project view, widgets, a live socket, keyboard shortcuts.

## Risks

- **Load on the database.** Bound the row previews (20 Needs you, five shipped or due, ten projects) while computing exact counts and distinct waiting-seat IDs over all matches. Use existing indexes and one grouped query for the 14 days of status changes for the ten projects on the page.
- **"Shipped today" can undercount.** Merges without a saved merge time are omitted. The stale line counts repositories whose last successful refresh is old or unknown.
- **A `question` row can outlive its answer** when the answer is given outside the issue (in chat, in a pull request). It leaves when the next run starts.
