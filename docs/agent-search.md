# Agent search API

`GET /api/apps/auth/search?query=release+blockers` searches the installation's
current workspace. The API uses the existing app bearer token. Issue and activity
search require `issues:read`; Note search requires `context:read`. Searching all
types requires both. Existing workspace membership and record policies are checked
before retrieval and again before returning content.

## Modes

| `mode` | Behavior |
| --- | --- |
| `hybrid` (default) | Fuse keyword and verified semantic rankings using reciprocal rank fusion; exact IDs and issue keys come first. |
| `exact` | Case-insensitive ID/key lookup and literal phrase matching in titles and content. |
| `keyword` | PostgreSQL full-text search with the `simple` dictionary. Supports quoted phrases, `OR` and excluded terms. Titles have more weight than body text. |
| `semantic` | Rank verified vectors by cosine similarity; prioritize exact IDs/keys. Returns `503 semantic_unavailable` if query embeddings or verified index entries are unavailable. |
| `fuzzy` | Rank by overlapping word trigrams, accepting at least half of the query's trigrams. Useful for misspellings. |

Hybrid returns `mode: "keyword"` and an explicit `metadata.fallback` reason when
semantic retrieval is unavailable. It never labels lexical or zero-vector results
as semantic. Exact, keyword and fuzzy modes make no embedding or Qdrant requests.

## Filters and limits

`type` is `all`, `issue`, `note` or `activity`. Optional filters are `projectId`,
`status` (status ID, current name or legacy value), `assigneeId`, `after` and
`before` (inclusive ISO timestamps). Dates refer to issue/Note `updatedAt` and
activity `createdAt`. Status and assignee filter issues and their activity;
with either filter, an `all` search excludes Notes. Combining these filters with
`type=note` is rejected.

`limit` defaults to 20 and permits 1–50. `offset` defaults to zero. Follow
`pagination.nextOffset`; do not add `limit` yourself, because the budget can shorten
a page. Each request uses current records, so updates between requests can change
ranking. Pagination is not a saved snapshot.

`maxTokens` defaults to 8000 and permits 1024–64000. The entire serialized response
is capped using UTF-8 bytes as a conservative token upper bound for byte-based
model tokenizers. `metadata.budget` reports this estimator and truncation. An
insufficient budget returns `422 budget_too_small` instead of silently losing the
first result. Titles and excerpts are capped at 300 and 1200 characters; fetch the
source record for full content. Scopes over 50,000 candidate records return
`422 scope_too_large`; narrow by project, type or date.

Results contain source `id`, `type`, `projectId`, workspace-relative `url`,
`updatedAt`, `title`, `excerpt`, `matchType` and `score`. Issues also include their
key, status and assignee; activity includes the parent issue ID. Scores are
mode-specific, not calibrated confidence probabilities.

Encrypted Notes, credential/environment/API-key Note types and personal/shared
scope Notes are excluded from this collection endpoint. Project-only Notes use
their project's workspace. Deleted, inaccessible and mismatched activity parents
are excluded, even though activity records have no Issue foreign key.

## Semantic readiness

Both `QDRANT_URL` and `EMBEDDING_API_URL` must be configured. The existing optional
API keys, collection, model and dimensions settings apply. A source default is
not proof of a configured or usable provider. Search does not create collections,
reindex content or mutate any provider configuration.

For the authorized candidate scope, search verifies the collection's cosine vector
dimensions, point identity/type, finite nonzero vectors, matching embedding model
and source timestamps. Issues and Notes use `updatedAt`; activity uses its event
`createdAt`, which does not detect edits to an existing event. Index producers
record `embeddingModel` only when an embedding service produced the vector.
Legacy points without model provenance need an owner-managed reindex before they
can count as verified.

`metadata.vectorCoverage` reports ready/partial/unavailable, the canonical scope
size (`total`), records checked and observed missing/stale/invalid/model-unverified
counts. Uninspected index counts are `null`, not zero. A partial audit searches only
the verified subset and explicitly reports incomplete coverage. Provider calls
have two-second timeouts; coverage scanning has a six-second budget between
batches. The query embedding call can add up to two seconds. Changed source
records lose their stale semantic match before output.

The accepted application's read-only qualification on 8 October 2026 found no
configured Qdrant or embedding endpoint. Production semantic quality, coverage and
freshness are therefore unqualified. Local HTTP fixtures verify the retrieval
contract and ranking mechanics; they do not prove a deployed model's relevance.

## Verification

Run `npm run test:search` with PostgreSQL binaries (`pg_config`, `initdb`, `pg_ctl`)
installed. The tests create and close their own temporary socket-only database;
they do not use `DATABASE_URL`. They execute real PostgreSQL queries, real HTTP
clients against local fixtures, and the authenticated API with executable record
permission predicates. `npm run test:security` includes the search authorization
and vector tests alongside existing security regressions.
