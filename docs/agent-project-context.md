# Project context for agents

`GET /api/apps/auth/ai-context?projectId=PROJECT_ID&includePipeline=true` returns a project overview in one response. It requires the existing `prompts:read`, `issues:read` and `context:read` scopes and active workspace access. Existing callers that omit `includePipeline` keep the prompt-only response.

The response contains:

- `project`: ID, name, description, archive state, updated timestamp and link.
- `summary`: visible issue counts, completed/open/unknown status counts, unassigned and overdue counts.
- `statuses` and `owners`: status counts and assigned users with issue counts. Owners here are issue assignees, not an invented project-owner field.
- `blockers` and `dependencies`: directed `BLOCKS` edges, including reversed stored `BLOCKED_BY` relations, with readable source and target issue cards. Blockers exclude edges with a completed endpoint. Legacy statuses without a current status definition have unknown completion.
- `parents`: child-to-parent edges from both `parentId` and `PARENT` relations, deduplicated. Readable cross-project neighbors in the same workspace are included, one level deep.
- `recentChanges`: recently updated issues and activity, newest first. Activity without a currently readable parent is excluded.
- `notes`: readable project and workspace Notes, prioritizing AI context, its configured priority, pins, then recent updates. Personal, encrypted, credential, API-key and environment Notes are excluded, even for their author.

Issue and Note cards include source IDs, links and `updatedAt`. Activity uses its `createdAt` as the returned event timestamp. Notes contain excerpts rather than complete instructions; use the existing Note read command when the full authorized text is needed.

## Bounds and pagination

| Parameter | Default | Accepted values |
| --- | --- | --- |
| `limit` | 10 | 1–50 items per section |
| `offset` | 0 | 0–50,000 |
| `maxTokens` | 8,000 | 2,048–64,000 |
| `since` | Seven days before the request | ISO timestamp with timezone; applies to recent changes |

Each section has `items` and `pagination` with `offset`, `nextOffset`, `hasMore` and `total`. Totals count the readable records retrieved for each section. Follow each section's own `nextOffset`; a budget may shorten sections differently. Pages reflect current database state and can shift between requests.

The budget uses UTF-8 bytes of the **whole JSON response** as a conservative token upper bound, not a model-specific tokenizer. Text fields are excerpts with fixed length limits. If necessary, tail items are removed while preserving at least one item from every nonempty section. `metadata.budget` reports the bound, truncation and affected sections. A budget too small for that minimum returns HTTP 422, `budget_too_small`; increase it rather than retrying an unchanged offset.

Project context supports up to 50,000 visible project issues and 50,000 relation/neighbor records per relation query, activity records, readable Notes, and records in each final pageable section (including merged changes and parent edges). Larger scopes return HTTP 422, `scope_too_large`. ID queries are batched below Prisma's bind limit and activity is ordered globally before pagination.

## Freshness and compatibility

Context reads the canonical database; it does not depend on embeddings or an index. `metadata.snapshotStartedAt` and `generatedAt` bound the retrieval window, not an atomic database snapshot. Workspace membership is checked again before output. Notes obey current sharing and expiry rules, with the existing author expiry exception.

For prompt-only callers, `maxTokens` opts into bounded output while retaining `systemPrompts` and `mergedContext`. Metadata reports the original counts and truncation. Omit it for the previous response behavior. `includePipeline=false` explicitly selects that legacy format.

Focused verification includes real middleware/permission tests, output-budget tests and a disposable PostgreSQL test using the full application schema with 40,000 issues. The latter measures local service timing only; it is not production or CLI latency evidence.
