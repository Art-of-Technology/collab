# Project context

One read that tells an agent where a project stands: what is open, who owns it, what blocks what, what changed and which Notes matter.

## Read it

```sh
collab context get --project-id PROJECT_ID
```

- MCP: the tool [`context_get`](/docs/reference/mcp-tools#context_get) with `projectId`.
- HTTP: `GET /api/apps/auth/ai-context?projectId=PROJECT_ID&includePipeline=true`.

The token needs the scopes `prompts:read`, `issues:read` and `context:read`.

## What the reply contains

1. `project`: id, name, description, whether it is archived, when it was last updated and a link.
2. `summary`: how many issues are visible, done, open, unassigned and overdue.
3. `statuses` and `owners`: the count of issues per status and per assignee.
4. `blockers` and `dependencies`: which issue blocks which. Blockers leave out a pair when one of the two issues is done.
5. `parents`: which issue is a child of which, also across projects of the same workspace, one level deep.
6. `recentChanges`: issues and activity updated lately, newest first.
7. `folders`: the workspace’s and project’s folders with id, name, type, link and `updatedAt`, inside the same response budget.
8. `notes`: the project's and the workspace's Notes, those marked as AI context first.

Every issue and Note comes with its id, a link and `updatedAt`. A Note is an excerpt: read the Note itself when you need all of it.

Personal, shared-scope and encrypted Notes and Notes of type `CREDENTIALS`, `API_KEYS` or `ENV_VARS` are never included, even when the token can read them.

## Read folders and files

Use `collab folders list --project-id PROJECT_ID` to discover folders, `collab folders get FOLDER_ID` for their child folders, Notes and files, and `collab files get FILE_ID` for file metadata and text. MCP offers `folders_list`, `folders_get` and `files_get`. These reads need `context:read`. Read a Note in full with `collab notes get NOTE_ID` or `notes_get`.

Folder lists return at most 500 folders; a folder read returns at most 200 items of each type. `hasMore` reports omitted items; pass `nextOffset` as `--offset` (0 to 50,000) to read the next page. Paging ends at offset 50,000: a page past it is never offered, and `limitReached` says that items were left there unread. Folder cards carry `parentId` to reconstruct the tree across pages. File reads return the first 256 KiB of text or CSV. PDFs up to 8 MiB return embedded text from up to 100 pages, capped at 256 KiB; no OCR is performed. `truncated` reports omitted text. Unsupported files, oversized PDFs, scans and unreadable PDFs return name, MIME type, size and a reason instead. File replies state these limits.

All reads use the account behind the token and its workspace. Deleted items and personal, encrypted and secret-type Notes remain excluded.

## Limits

| Flag | Default | Accepted |
| --- | --- | --- |
| `--limit` | 10 | 1 to 50 items in each section |
| `--offset` | 0 | 0 to 50,000 |
| `--max-tokens` | 8000 | 2048 to 64000 |
| `--since` | 7 days ago | A timestamp in ISO 8601 with a time zone; applies to recent changes |

- Each section has its own `pagination` with `nextOffset` and `hasMore`. Follow each section's own `nextOffset`: a budget can shorten sections differently.
- `--max-tokens` caps the whole reply. When it is too small to keep one item of every section, the reply is `422 budget_too_small`: raise it.
- A project with more than 50,000 visible issues gets `422 scope_too_large`.

The reply is read from the database when you ask. It does not depend on a search index.

## Without a project

`collab context get` without `--project-id` returns the workspace's prompts instead: the instructions a workspace keeps for its agents. That read needs only `prompts:read`.

With a project, `--include-pipeline false` asks for the same prompt format instead of the overview.

## Next

To find one thing instead of reading the overview, use [Search](/docs/reference/search).
