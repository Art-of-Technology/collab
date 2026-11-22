# Workspace dashboard: what needs a person, first

The design the owner approved on 21 November 2026 for Home (`/[workspace]/dashboard`). It replaces the page that [`docs/workspace-dashboard.md`](../../workspace-dashboard.md) describes; that file is rewritten when the last issue of this work merges.

The clickable mockup the choices were made in is a project note in Collab, named in the epic. It uses sample data.

## Why

The page counts issues and due dates. In a workspace where most work is done by seats, that misses what a person opens the page for:

- A seat's question, or a run that was lost, never reaches the page. The person looks in the Seats page, the Floor and the issue.
- "Needs attention" is ordered by due date, so issues of projects nobody has touched for a year fill it.
- The repository list dates each item and labels its last refresh or refresh attempt. It does not say how many repositories have no confirmed refresh in the last 24 hours.

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
| 6 | A seat is answered in the row: typed text, sent as a comment on the issue. |
| 7 | Projects show as cards with a trend line. A Cards / Table switch sits above them; the choice is kept in the browser (`localStorage`), cards first. |
| 8 | The sentence under the title is assembled from the panels' counts. No model is called. |
| 9 | Times are relative ("3 h ago", "due tomorrow") with the exact UTC time in `title` and `dateTime`. |
| 10 | The page reloads its data when the tab becomes visible again and when Refresh is pressed. No timer. |
| 11 | Merging stays on the Git provider. “Open pull request” uses the provider URL supplied by the Needs you loader. |
| 12 | "Shipped today" uses saved merge and publication times, and says how many connected repositories have no confirmed refresh in the last 24 hours, including those with no known success. Fixing the refresh is other work. |
| 13 | The single-project view (`?project=<id>`) is not changed. |
| 14 | `SimplifiedDashboard` and the `/api/ai/dashboard` route are deleted: no screen uses them. |

## Panels

The server starts the panel reads in parallel with the current session. Each panel shows its own `denied` or `unavailable` state. No loader waits for another: where one panel needs another's result, the shell passes it on as a prop after both have resolved. A loader never returns a row the viewer could not open.

Home's filters, project search and pagination preserve the current `scope`, `kind`, search (`q`), `dormant` and `page` values except for the setting the person changes. Changing scope, submitting or clearing a search, or switching between active and dormant projects also drops `page` to start on page one.

### Needs you

A row is one issue that cannot go on until a person acts. From all rows the viewer can open in the current scope, compute the counts and project totals and take the seat name and `since` from the oldest `question` (`null` if none). Then apply the chip, sort by kind in the order below and by `since` oldest first, and send at most 20 rows.

For both questions and reviews, the unfinished issue must still be assigned to the user of the seat that ran it, in that seat's project. Its latest run must be a seat's run, must have finished `in_review` or `blocked`, and must have named a person (`askedUser`). Match the finish facts to that run's id. As in `inboxOf`, the run must have ended on or after the current assignment time (the assignee's helper record's `approvedAt`, then `assignedAt`, then the issue's creation). A later comment by anyone other than the seat's user answers the question.

| Kind | Is in the list when | Leaves the list when | Button |
| --- | --- | --- | --- |
| `question` | The seat's current question is unanswered and its run gave no pull request | It is answered, the assignment changes, a newer run starts or the issue is done | Answer |
| `review` | The same current, unanswered question, with a pull request from that run | The same | Open pull request when `pullRequestUrl` is present |
| `failed` | As in `readSeats`, the run is open (`endedAt` is null) and either its state is `lost` or its non-null `leaseUntil` is earlier than now | The run ends or no longer meets that test | Session has stopped: clear run |
| `due` | The issue is assigned to the viewer, not done, due before now plus 7 days, and in an active project (see Projects) | It is done or its date moves | Open issue |

- For a review, the Needs you loader resolves the run's `OWNER/REPO#NUMBER` against repositories the viewer can access in the issue's project, using the matched repository's host and provider. If it cannot identify one authorized destination, the review stays in the list with no link.
- **All work** shows all eligible rows. **My work** keeps those where the viewer is the named person, owns the row's seat, or is the issue's assignee. `due` rows are the viewer's own in both.
- `waitingSeats` is the one value that ignores the scope: it covers every question and review the viewer may read, also in My work. A seat that waits for somebody else is still waiting, and must not be shown as idle.
- Only `due` rows are held to the active-project rule. A seat that asks, or a run that is lost, is itself the sign that the project is being worked on.
- The shell takes the selected chip from the request. The All link omits `kind`; Questions, Reviews, Failed runs and Due set it to `question`, `review`, `failed` or `due`. Each link keeps `scope` and shows its exact count. Under the rows: "Showing 20 of N" when there are more.
- A `question` row opens in place with the seat's next step and a text field. Sending posts a comment through the existing issue comment route, with that route's own checks. Empty text is refused in the row. After a successful send the page reloads its rows and counts, and the panel names the seat that will pick the reply up, if it still holds the issue.
- Only viewers with the permission to assign issues see "Session has stopped: clear run", the label the issue page already uses. A missed lease alone does not prove that the old process stopped, and clearing lets another session take the issue. So pressing the button first asks, in the row, for the person's confirmation that they checked the session is gone; only then is `POST /api/issues/:issueId/runs/:runId/clear` called. The route checks the permission and the run's state again. On success the page reloads its rows and counts.
- The mockup shows two suggested answers per question and a one-press "Retry run". Seats do not record suggestions, and a lost run needs the confirmation above, so neither is built.

### Agents now

From `readSeats` in `src/lib/agents-page.ts`, read only, with its rules unchanged (a seat's room stays hidden from people who may not see it). `readSeats` does not return a seat's project id, so the loader reads the project id of the seats it got back in one further query by seat id.

- One chip per seat with one state. `failed`: the seat has an open run that `readSeats` marks lost. `working`: it has an open run and none is lost. `waiting_on_person`: no open run, and the seat is in the waiting set from Needs you. `idle`: the rest. A seat with a lost run and a working run is `failed`, because that is the one a person must act on, and its issue key is the lost run's.
- The loader returns `failed`, `working` or `idle`. The panel turns `idle` into `waiting_on_person` for the seats in its `waitingSeats` prop, and takes that seat's issue key from the same prop.
- While the waiting set is unknown (Needs you is not built yet, or did not load), a seat with no open run is labelled "not running", and the counts line has no waiting part.
- The chip and the counts line say "waiting on a person", not "waiting on you": in All work, and for a seat in My work, the person asked may be somebody else.
- The counts line sums the chips. Pressing a chip shows the seat's line: name, state, issue key.
- "Open Floor" links to `/[workspace]/agent-inbox/floor`.
- There is no runner line. `readSeats` gives a runner's name but not its state, and showing another person's runner state would need its own access decision.

### Shipped today

Replaces "Recent repository activity". It is a new loader, `src/lib/dashboard/shipped.ts`, that keeps the project, repository and release access checks and the canonical identities of `src/lib/dashboard/repository-overview.ts` by importing them. The old loader stays until the last issue removes it.

- Use `PullRequest.mergedAt` for a merged pull request and `Release.publishedAt` for a published, non-draft release. A provider update time (`GitConnectionActivity.date` or `PullRequest.githubUpdatedAt`) cannot date a merge. Leave out records without the event time or outside the last 24 hours before deduplicating. Count the distinct events, then send the newest five. The row's age is the same event time.
- For each distinct connected repository in a project, use the latest successful `GitConnection.syncedAt` across its authorized connections. The older `Repository.syncedAt` records an attempt, not a success. Count the repository once if its last success is older than 24 hours or unknown. When the count is above zero, show "N connected repositories have no confirmed refresh in the last 24 hours".
- `connectionCount` stays in the contract for one reason: with zero connected repositories the panel says so, instead of "nothing shipped".
- A row is labelled "Merged" or "Released". A release is still not a deployment and the panel does not say "deployed".
- A release or merge counts whatever the state of its project's issues: the 30-day rule is about issues, and something that shipped today did ship.

### Due in the next 7 days

Unfinished issues of active projects due from now through 7 days ahead, earliest first, five rows and the exact count. In "My work", the viewer's own. Overdue issues of active projects are counted on their project; they are not listed here.

### Projects

- **Active** means: the project has at least one issue the viewer may read that changed in the last 30 days. It is decided before issues are narrowed to My work, before the search and before paging. Due rows, cards, the table and the dormant line all use it. The page size stays 10.
- A card shows: name and colour, how many "Needs you" rows the project has, open issues, overdue issues, seats working, the latest issue change, and a 14-day line of issues finished per day. The "Needs you" number and the seats number are shown only when they are known: while their panel is not built or did not load, the card leaves them out instead of showing zero.
- "Finished per day" counts an issue once when it moves from a status that is not final to one that is, by UTC day, for issues the viewer may read. Use the transition rule that `loadProjectHome` in `src/lib/project-overview.ts` already applies, with its handling of older activity rows that carry status names instead of status ids. A move from one final status to another is not counted. In "My work", for issues assigned to the viewer.
- The table shows the same fields as columns.
- The dormant line gives the number of dormant projects and their overdue issues. "Show" sets `dormant=1` in the current query and lists those projects with open, overdue and latest change. Returning to active projects removes `dormant`. Both links reset the project page. Dormant projects never count in Due, on a card or in the "Needs you" due rows.

### The sentence

Build the sentence from the panels that are ready: `N things need you. Oldest question: <seat>, <age> ago. N failed runs. N changes shipped today.` Use the exact Needs you counts for the current scope and the Shipped today total. For the oldest question, show `oldestQuestion.seatName` and the age of `oldestQuestion.since` on every chip. Omit that clause when `oldestQuestion` is null. Leave out a count whose value is zero or unknown. When no clause remains, show "Nothing needs you." only if Needs you is ready and its counts sum to zero.

## Contexts

The `dashboard-*` rows of [`CONTEXT-MAP.md`](../../../CONTEXT-MAP.md), cut for this work. The map is where they are kept; this table also shows the test files each issue adds. Each issue holds one context. The last issue removes the fallbacks from the shell together with the old loaders they read.

| Context | Paths | Tests |
| --- | --- | --- |
| `dashboard-shell` | `src/app/(main)/[workspaceId]/dashboard/page.tsx`, `.../dashboard/components/WorkspaceOverview.tsx`, `.../dashboard/components/DashboardRefresh.tsx`, `.../dashboard/components/RelativeTime.tsx`, `src/types/workspace-dashboard.ts`, `docs/workspace-dashboard.md` | `tests/render/workspace-dashboard.test.cjs`, `tests/security/selected-project-dashboard.test.cjs` (Home routing and panel reads) |
| `dashboard-needs-you` | `src/lib/dashboard/needs-you.ts`, `.../dashboard/components/NeedsYouPanel.tsx` | `tests/security/dashboard-needs-you.test.cjs`, `tests/render/dashboard-needs-you.test.cjs` |
| `dashboard-agents` | `src/lib/dashboard/agents-now.ts`, `.../dashboard/components/AgentsNowPanel.tsx` | `tests/security/dashboard-agents-now.test.cjs`, `tests/render/dashboard-agents-now.test.cjs` |
| `dashboard-shipped` | `src/lib/dashboard/shipped.ts`, `src/lib/dashboard/repository-overview.ts` (only to export what the new loader imports), `.../dashboard/components/ShippedPanel.tsx` | `tests/security/dashboard-shipped.test.cjs`, `tests/render/dashboard-shipped.test.cjs`, `tests/security/workspace-repository-overview.test.cjs` (old feed through wave 2) |
| `dashboard-projects` | `src/lib/dashboard/workspace-overview.ts`, `.../dashboard/components/ProjectsPanel.tsx`, `.../dashboard/components/DueSoonPanel.tsx` | `tests/security/workspace-dashboard-data.test.cjs` (including `attention` and `recent` through wave 2), `tests/render/dashboard-projects.test.cjs` |
| `dashboard-legacy` | `src/components/dashboard/**`, `src/app/api/ai/dashboard/**` | `tests/security/ai-dashboard-access.test.cjs`, and the load of that route with its one case in `tests/security/profile-notifications.test.cjs` |

Not in any of them, and not changed: `.../dashboard/components/DashboardClient.tsx` (the single-project view), `src/lib/agents-page.ts`, `src/lib/agent-runs.ts`, `src/lib/project-overview.ts`, the comment and run routes.

## Contracts

All types are in `src/types/workspace-dashboard.ts`. The shell task writes them; a later issue that needs a field changed says so on its card and changes it first, in its own commit.

```ts
type Panel<T> = { kind: 'denied' | 'unavailable' } | ({ kind: 'ready' } & T);

type NeedsYouKind = 'question' | 'review' | 'failed' | 'due';
type NeedsYouItem = {
  id: string;                 // `${kind}:${issueId}`
  kind: NeedsYouKind;
  issue: { id: string; issueKey: string | null; title: string; project: DashboardProject };
  seat: { id: string; name: string } | null;   // the assigned seat for questions and reviews, the run's seat for failed, null for due
  since: string;              // ISO: run end for questions and reviews, leaseUntil (or startedAt) for failed, the due date for due
  text: string | null;        // the run's next step, for `question` and `review`
  pullRequestUrl: string | null;
  runId: string | null;       // for `failed`
  canAct: boolean;            // may answer (question) or may clear the run (failed); false for review and due
};
type NeedsYouOverview = Panel<{
  generatedAt: string;
  oldestQuestion: { seatName: string; since: string } | null;
  items: NeedsYouItem[];                       // at most 20, of the chosen kind
  counts: Record<NeedsYouKind, number>;        // every matching row of the scope, whatever chip is chosen
  byProject: Record<string, number>;           // the same rows by project id
  waitingSeats: Array<{ seatId: string; issueKey: string | null }>; // every seat with a readable question or review, one issue each, in both scopes
}>;

type SeatState = 'working' | 'waiting_on_person' | 'failed' | 'idle';
type AgentsNowOverview = Panel<{
  // `id` is the seat's id, the same value as `NeedsYouItem.seat.id`. The loader never returns `waiting_on_person`.
  seats: Array<{ id: string; name: string; projectId: string; state: Exclude<SeatState, 'waiting_on_person'>; issueKey: string | null }>;
}>;

type ShippedOverview = Panel<{
  items: Array<{ id: string; kind: 'merged' | 'released'; title: string; project: DashboardProject;
    repository: string; url: string | null; at: string }>; // `at` is the merge or publication time
  total: number;                // distinct events in the window, before the five-row cut
  connectionCount: number;      // distinct connected repositories; zero changes the empty text
  staleRepositories: number;    // no confirmed refresh in the window
}>;
```

`WorkspaceIssueOverview` (ready) keeps returning `attention` and `recent` through waves 1 and 2, because the shell shows them while "Needs you" is not built; the last issue removes them. Its `summary` counts active projects only. Added are `dueSoon: DashboardIssue[]` (the Due panel's exact count is the existing `summary.dueSoonIssues`), `dormant: { projects: number; overdueIssues: number }`, `showingDormant: boolean`, and on each project `finishedPerDay: number[]` (14 numbers, oldest first).

| Hand-over | What crosses | Pinned by |
| --- | --- | --- |
| loader to shell | Each loader exports one function that returns its `Panel` type, or `null` while it is not built. For a `null` panel the shell shows what the page showed before in that slot (the old attention list, the old repository list) or nothing (agents, due). The panels' props are fixed by the shell task and do not change afterwards. | `tests/render/workspace-dashboard.test.cjs` › "a panel whose loader returns null is skipped" |
| needs-you to projects | `NeedsYouOverview.byProject`, passed by the shell to the projects panel as `needsByProject`; `null` while Needs you is not ready | `tests/render/dashboard-projects.test.cjs` › "a card shows how many rows need a person, and nothing while that is unknown" |
| needs-you to agents | `NeedsYouOverview.waitingSeats`, passed by the shell to the agents panel as `waitingSeats`; `null` while Needs you is not ready | `tests/render/dashboard-agents-now.test.cjs` › "an idle seat with a question waits on a person" |
| agents to projects | Seats in state `working` counted by `projectId`, passed by the shell to the projects panel as `seatsWorkingByProject`; `null` while Agents now is not ready | `tests/render/dashboard-projects.test.cjs` › "a card shows how many seats are working, and nothing while that is unknown" |
| needs-you to comment route | `POST /api/issues/:issueId/comments`, unchanged | `tests/render/dashboard-needs-you.test.cjs` › "sending an answer posts one comment and reloads the rows" |

## Order of work

| Wave | Issue | Context | Needs |
| --- | --- | --- | --- |
| 0 | Shell: layout, panel slots, types, relative times, refresh on return | `dashboard-shell` | nothing |
| 0 | Delete the unused dashboard code and its route's test file; in the shared profile, timeline and notification suite remove only that route's load and case | `dashboard-legacy` | nothing |
| 1 | Needs you: the list | `dashboard-needs-you` | the shell |
| 1 | Projects: active and dormant, and what is due | `dashboard-projects` | the shell |
| 1 | Agents now | `dashboard-agents` | the shell |
| 1 | Shipped today | `dashboard-shipped` | the shell |
| 2 | Needs you: answer a seat, and clear a lost run after the person confirms its session stopped | `dashboard-needs-you` | the list |
| 2 | Projects: cards, the table switch and the trend line | `dashboard-projects` | active and dormant |
| 3 | Remove the shell fallbacks, `attention`, `recent` and the old repository loader. Migrate their tests in the same change and rewrite `docs/workspace-dashboard.md`. | `dashboard-shell`. It may also change the two old loaders and the three existing test files named in the table above, because nothing else is open by then | everything above |

In wave 3, carry the old repository suite's applicable access, release visibility and deduplication cases over to Shipped. Move the issue visibility and My work checks on `attention` and `recent` to the replacement issue lists. Update the shell's render fixtures and Home loader stubs and expectations for the new panels, keeping the routing checks for default Home, an empty project selector and a selected project.

In wave 1, the list and the projects issue are handed out first. Each issue is released when it merges, the way this project already releases.

## Not in this work

- Suggested answers for a seat's question, and a one-press retry of a lost run.
- A merge button, or anything else that writes to a Git provider.
- Refreshing repository data, deployment events, and the state of runners.
- Charts beyond the one line per project.
- The single-project view, widgets, a live socket, keyboard shortcuts.

## Risks

- **Load on the database.** Bound the rows that are sent (20 Needs you, five shipped or due, ten projects) while the counts and the waiting seats cover all matches. Use existing indexes, and one grouped read for the 14 days of status changes of the ten projects on the page, never one per project.
- **"Shipped today" can undercount.** A merge without a saved merge time is left out. The stale line counts repositories whose last successful refresh is old or unknown.
- **A `question` row can outlive its answer** when the answer is given outside the issue (in chat, in a pull request). It leaves when the next run starts.
