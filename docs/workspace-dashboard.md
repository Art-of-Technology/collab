# Workspace Home

Home (`/[workspace]/dashboard`) opens the workspace overview without selecting a
project. Existing `?project=<id>` links still open that project's issues and memory.

- **All work / My work:** My work limits native Collab issues to the signed-in
  assignee. Repository activity remains workspace-wide and is labelled accordingly.
- **Summary and attention:** counts cover accessible, active projects and exclude
  Trash. Overdue means an unfinished issue before now; upcoming means now through
  seven days ahead. Project status `isFinal` is authoritative. Without a linked
  status, legacy done/complete/completed/closed/resolved/cancelled/canceled values
  are final. Counts are independent of the eight-row attention preview.
- **Project overview:** ten projects per page, ordered by overdue work, upcoming
  work, then latest issue change. Search filters this table, not the summary.
  `scope=mine`, `q=<project name or slug>`, and `page=<number>` use GET navigation.
- **Recent repository activity:** six deduplicated cached PRs, merge requests and
  published releases from connected Git providers and the existing GitHub store.
  This is not a complete open-PR count. Provider updates, local recorded times,
  refresh attempts and successful refreshes are labelled separately. Dates use UTC.

All data is loaded on the server with the current session, exact workspace access
and `VIEW_TASKS`. Independent sections distinguish missing permission from a load
failure. Loading Home does not contact providers or refresh their caches. Issue
totals describe Collab records; externally authoritative Forge board totals are
not inferred from these records.

The first slice is tracked by CLB-437 and CLB-438 under CLB-436. CI outcome/revision
correctness (CLB-439) and actual deployment events from existing release workflows
or Buildwake (CLB-440) are separate followups. A merge or release tag does not prove
a deployment, and a deployment result does not prove ongoing service health.

Focused verification:

```sh
node --test --test-concurrency=1 tests/security/selected-project-dashboard.test.cjs tests/security/workspace-dashboard-data.test.cjs tests/security/workspace-repository-overview.test.cjs tests/render/workspace-dashboard.test.cjs
```
