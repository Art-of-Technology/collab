# Workspace dashboard: what needs a person, first

The design the owner approved on 21 November 2026 for Home (`/[workspace]/dashboard`). It replaces the page that [`docs/workspace-dashboard.md`](../../workspace-dashboard.md) describes; that file is rewritten when the last issue of this work merges.

The clickable mockup the choices were made in is a project note in Collab, named in the epic. It uses sample data.

## Why

The page counts issues and due dates. In a workspace where most work is done by seats, that misses what a person opens the page for:

- A seat's question, or a run that was lost, never reaches the page. The person looks in the Seats page, the Floor and the issue.
- "Needs attention" is ordered by due date, so issues of projects nobody has touched for a year fill it.
- The repository list shows saved activity with no sign of how old it is.

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
| Failed    <title>         [Retry run]    | SHIPPED TODAY  9          |
| Due       <title>        [Open issue]    | <key> <title>  Merged 2 h |
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
| 12 | "Shipped today" shows only what Collab has saved, and says how many connected repositories were not refreshed in the last 24 hours. Fixing the refresh is other work. |
| 13 | The single-project view (`?project=<id>`) is not changed. |
| 14 | `SimplifiedDashboard` and the `/api/ai/dashboard` route are deleted: no screen uses them. |

## Panels

Every panel is loaded on the server with the current session, in parallel, and fails alone: `denied` and `unavailable` are shown inside the panel, as today. A loader never returns a row the viewer could not open.

### Needs you

A row is one issue that cannot go on until a person acts. Four kinds, in this order; inside a kind the oldest is first. At most 20 rows are sent; the counts are exact.

| Kind | Is in the list when | Leaves the list when | Button |
| --- | --- | --- | --- |
| `question` | The issue is not done, its last run finished `in_review` or `blocked` and named a person (`askedUser`), and gave no pull request | Someone other than the seat comments on the issue after that run ended (the same event that puts the issue back in the seat's inbox as `reply`), or a newer run starts | Answer |
| `review` | As `question`, and the run gave a pull request | The same | Open pull request |
| `failed` | The issue has an open run in state `lost` | The run is cleared or a new run starts | Retry run |
| `due` | The issue is assigned to the viewer, not done, and due before now plus 7 days | It is done or its date moves | Open issue |

- **All work** shows every `question`, `review` and `failed` row of the workspace that the viewer may read. **My work** keeps those where the viewer is the named person, owns the seat, or is the issue's assignee. `due` rows are the viewer's own in both.
- A `question` row opens in place: what the seat wrote as its next step, and a text field. Sending posts a comment on the issue through the existing comment route, with that route's own checks. Empty text is refused in the row. After a successful send the row is removed and the panel says who continues.
- "Retry run" calls the existing route that clears a lost run (`POST /api/issues/:issueId/runs/:runId/clear`), which needs the permission to assign issues. Without it the button is not shown. If clearing does not put the issue back in the seat's inbox, the button is labelled "Clear lost run" instead; the story checks this with a test before it chooses the label.
- Filter chips (All, Questions, Reviews, Failed runs, Due) filter the sent rows in the browser and show each kind's exact count.
- The mockup shows two suggested answers per question. Seats do not record suggestions today, so the first version has the text field only. Suggested answers are not part of this work.

### Agents now

From `readSeats` in `src/lib/agents-page.ts`, read only, with its rules unchanged (a seat's room stays hidden from people who may not see it).

- One chip per seat with a state: `working` (an open run that is not lost), `failed` (an open run that is lost), `waiting_on_person` (no open run, and an issue of the seat has a `question` or `review` row), `idle` (the rest). The counts line sums them.
- Pressing a chip shows the seat's line: name, state, issue key.
- "Open Floor" links to `/[workspace]/agent-inbox/floor`.
- The runner line shows each runner's name and reported state as `readSeats` returns them. No new read of runners.

### Shipped today

Replaces "Recent repository activity", with the same sources, access rules and deduplication as `src/lib/dashboard/repository-overview.ts` has today.

- Rows: pull requests merged and releases published in the last 24 hours, newest first. Five rows are sent with the exact total.
- One line under the list when it applies: "N connected repositories were not refreshed in the last 24 hours", with never-refreshed ones included.
- A row is labelled "Merged" or "Released". A release is still not a deployment and the panel does not say "deployed".

### Due in the next 7 days

Unfinished issues of active projects due from now through 7 days ahead, earliest first, five rows and the exact count. In "My work", the viewer's own. Overdue issues of active projects are counted on their project; they are not listed here.

### Projects

- **Active** means the project's latest issue change is 30 days old or less. Search and the cards cover active projects only. The page size stays 10.
- A card shows: name and colour, how many "Needs you" rows the project has, open issues, overdue issues, seats working, the latest issue change, and a 14-day line of issues finished per day.
- "Finished per day" counts issue status changes into a final status (`IssueActivity` with a `newStatus` whose `isFinal` is true), by UTC day, for issues the viewer may read. In "My work", for issues assigned to the viewer.
- The table shows the same fields as columns.
- The dormant line gives the number of dormant projects and their overdue issues. "Show" is a link (`?dormant=1`) that lists them, paged, with open, overdue and latest change. Dormant projects never count in the sentence or on a card.

### The sentence

Built in the shell from the panels that loaded: `N things need you. Oldest question: <seat>, <age> ago. N failed runs. N changes shipped today.` A clause whose panel did not load, or whose number is zero, is left out. With nothing to say it reads "Nothing needs you."

## Contexts

A finer cut of the dashboard paths, for this work. Each issue holds one of them.

| Context | Paths | Tests |
| --- | --- | --- |
| `dashboard-shell` | `src/app/(main)/[workspaceId]/dashboard/page.tsx`, `.../dashboard/components/WorkspaceOverview.tsx`, `.../dashboard/components/DashboardRefresh.tsx`, `.../dashboard/components/RelativeTime.tsx`, `src/types/workspace-dashboard.ts`, `docs/workspace-dashboard.md` | `tests/render/workspace-dashboard.test.cjs` |
| `dashboard-needs-you` | `src/lib/dashboard/needs-you.ts`, `.../dashboard/components/NeedsYouPanel.tsx` | `tests/security/dashboard-needs-you.test.cjs`, `tests/render/dashboard-needs-you.test.cjs` |
| `dashboard-agents` | `src/lib/dashboard/agents-now.ts`, `.../dashboard/components/AgentsNowPanel.tsx` | `tests/security/dashboard-agents-now.test.cjs`, `tests/render/dashboard-agents-now.test.cjs` |
| `dashboard-shipped` | `src/lib/dashboard/repository-overview.ts`, `.../dashboard/components/ShippedPanel.tsx` | `tests/security/workspace-repository-overview.test.cjs`, `tests/render/dashboard-shipped.test.cjs` |
| `dashboard-projects` | `src/lib/dashboard/workspace-overview.ts`, `.../dashboard/components/ProjectsPanel.tsx`, `.../dashboard/components/DueSoonPanel.tsx` | `tests/security/workspace-dashboard-data.test.cjs`, `tests/render/dashboard-projects.test.cjs` |
| `dashboard-legacy` | `src/components/dashboard/**`, `src/app/api/ai/dashboard/**` | `tests/security/ai-dashboard-access.test.cjs` |

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
  seat: { id: string; name: string } | null;   // null for `due`
  since: string;              // ISO: run end, or the due date for `due`
  text: string | null;        // the run's next step, for `question` and `review`
  pullRequest: string | null; // OWNER/REPO#NUMBER, for `review`
  runId: string | null;       // for `failed`
  canAct: boolean;            // may comment (question, review) or may clear the run (failed)
};
type NeedsYouOverview = Panel<{
  generatedAt: string; items: NeedsYouItem[];
  counts: Record<NeedsYouKind, number>;        // exact, before the 20-row cut
  byProject: Record<string, number>;           // project id -> rows, exact
}>;

type SeatState = 'working' | 'waiting_on_person' | 'failed' | 'idle';
type AgentsNowOverview = Panel<{
  seats: Array<{ id: string; name: string; project: DashboardProject; state: SeatState; issueKey: string | null }>;
  counts: Record<SeatState, number>;
  runners: Array<{ name: string; state: string | null }>;
}>;

type ShippedOverview = Panel<{
  items: Array<{ id: string; kind: 'merged' | 'released'; title: string; project: DashboardProject;
    repository: string; url: string | null; at: string }>;
  total: number; connectionCount: number; staleRepositories: number;
}>;
```

`WorkspaceIssueOverview` (ready) changes as follows: `summary` counts active projects only; `attention` and `recent` are removed; added are `dueSoon: DashboardIssue[]`, `dueSoonTotal: number`, `dormant: { projects: number; overdueIssues: number }`, `showingDormant: boolean`, and on each project `seatsWorking: number` and `finishedPerDay: number[]` (14 numbers, oldest first).

| Hand-over | What crosses | Pinned by |
| --- | --- | --- |
| loader to shell | Each loader exports one function that returns its `Panel` type, or `null` while it is not built. The shell skips a `null` panel and shows what it showed before for that slot. | `tests/render/workspace-dashboard.test.cjs` › "a panel whose loader returns null is skipped" |
| needs-you to projects | `NeedsYouOverview.byProject`, passed by the shell to the projects panel as `needsByProject` | `tests/render/dashboard-projects.test.cjs` › "a card shows how many rows need a person" |
| needs-you to agents | The set of seat ids that have a `question` or `review` row, passed by the shell to the agents loader | `tests/security/dashboard-agents-now.test.cjs` › "a seat with a question and no open run waits on a person" |
| needs-you to comment route | `POST /api/issues/:issueId/comments`, unchanged | `tests/render/dashboard-needs-you.test.cjs` › "sending an answer posts one comment and removes the row" |

## Order of work

| Wave | Issue | Context | Needs |
| --- | --- | --- | --- |
| 0 | Shell: layout, panel slots, types, relative times, refresh on return | `dashboard-shell` | nothing |
| 0 | Delete the unused dashboard code | `dashboard-legacy` | nothing |
| 1 | Needs you: the list | `dashboard-needs-you` | the shell |
| 1 | Projects: active and dormant, and what is due | `dashboard-projects` | the shell |
| 1 | Agents now | `dashboard-agents` | the shell |
| 1 | Shipped today | `dashboard-shipped` | the shell |
| 2 | Needs you: answer a seat and retry a run in the row | `dashboard-needs-you` | the list |
| 2 | Projects: cards, the table switch and the trend line | `dashboard-projects` | active and dormant |
| 3 | Finish: remove the fallbacks and rewrite `docs/workspace-dashboard.md` | `dashboard-shell` | everything above |

In wave 1, the list and the projects issue are handed out first. Each issue is released when it merges, the way this project already releases.

## Not in this work

- Suggested answers for a seat's question.
- A merge button, or anything else that writes to a Git provider.
- Refreshing repository data, and deployment events.
- Charts beyond the one line per project.
- The single-project view, widgets, a live socket, keyboard shortcuts.

## Risks

- **Load on the database.** The page adds reads of runs, seats and status changes. Each new loader is bounded (20, 5 and 10 rows; 14 days) and uses existing indexes; the status-change count is one grouped query for the ten projects on the page, never one per project.
- **"Shipped today" under-reports** for repositories whose saved data is old. The stale line is what makes that visible.
- **A `question` row can outlive its answer** when the answer is given outside the issue (in chat, in a pull request). It leaves when the next run starts.
