# Issue GitHub projection access

`GET /api/issues/[issueId]/github` uses the shared session actor and issue-read predicate: issue workspace, project workspace and linked status project must remain accessible to the owner or an active member. Missing authentication returns 401; inaccessible issues return 404 before related content queries.

Related branch, pull request and commit queries repeat issue and repository scope. Versions additionally use the shared sticky invalidation and every-linked-issue predicate. Repository projection selects display fields only. Successful responses are private `no-store`; errors do not log provider or database exception payloads.

Focused verification: `NODE_PATH=<existing dependencies> node --test tests/security/issue-github-access.test.cjs` runs the actual route and access helpers against controlled database responses, including revoked membership, mismatched issue/status workspaces and the no-repository result. This is modeled authorization evidence, not native database, provider, or browser acceptance. Separate generated-Prisma strict checks cover the route and reused helper bodies.
