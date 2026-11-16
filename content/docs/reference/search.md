# Search issues, Notes and activity

One search over a workspace's issues, Notes and issue activity, from the CLI, an MCP client or HTTP.

This is the search of your workspace's content. To search these documentation pages, use the search box at the top of the page or the MCP tool `docs_search`.

## Search from the CLI

```sh
collab search --query "release blockers"
collab search --query "CLB-123" --mode exact
collab search --query "login timeout" --type issue --project-id PROJECT_ID --limit 10
```

Every flag is listed under [`collab search`](/docs/reference/cli-commands#collab-search).

## Pick a mode

| Mode | What it does |
| --- | --- |
| `hybrid` (default) | Combines keyword and semantic ranking. Exact ids and issue keys come first. |
| `exact` | Finds an id, an issue key or a literal phrase, ignoring case. |
| `keyword` | Full-text search. Supports quoted phrases, `OR` and excluded terms. Titles weigh more than body text. |
| `semantic` | Ranks by meaning. Answers `503 semantic_unavailable` when the server has no embedding service set up. |
| `fuzzy` | Forgives misspellings: at least half of the query's letter groups must match. |

When semantic ranking is not available, `hybrid` answers with keyword results, says `"mode": "keyword"` and gives the reason in `metadata.fallback`. It never presents keyword results as semantic.

## Narrow the search

- `--type`: `all`, `issue`, `note` or `activity`.
- `--project-id`: one project.
- `--status`: a status of the project, by id or by name.
- `--assignee-id`: one assignee.
- `--after` and `--before`: timestamps in ISO 8601, inclusive. They compare with the time an issue or Note was last updated, and with the time an activity happened.

`--status` and `--assignee-id` filter issues and their activity. With either one, a search of `all` leaves Notes out, and `--type note` is refused.

## Read the next page

1. Ask for at most 50 results with `--limit` (default 20).
2. Read `pagination.nextOffset` in the reply and pass it as `--offset`. Do not add the limit yourself: a reply can be shorter than the limit.
3. Stop when `pagination.hasMore` is `false`.

Each request reads the records as they are now, so results can shift between pages.

## Size limits

- `--max-tokens` caps the whole reply (default 8000, from 1024 to 64000). A budget too small for the first result gets `422 budget_too_small`: raise it.
- A title is cut at 300 characters and an excerpt at 1200. Fetch the issue or Note for the full text.
- A search over more than 50,000 records gets `422 scope_too_large`: narrow it by project, type or date.

## What a result contains

Each result has `id`, `type`, `projectId`, `url`, `updatedAt`, `title`, `excerpt`, `matchType` and `score`. An issue also has its key, status and assignee. An activity has the id of its issue.

A score ranks results within one mode. It is not a confidence value.

## What is never returned

- Encrypted Notes, and Notes that hold credentials, API keys or environment variables.
- Personal Notes.
- Anything in a workspace or project the token cannot read. Access is checked before the search and again before the reply.

## From MCP and HTTP

- MCP: the tool [`search`](/docs/reference/mcp-tools#search), with the same arguments.
- HTTP: `GET /api/apps/auth/search?query=...` with the token as a bearer token. Searching issues and activity needs the scope `issues:read`, searching Notes needs `context:read`, and searching all types needs both.

## Next

For one overview of a whole project instead of a search, read [Project context](/docs/reference/project-context).
