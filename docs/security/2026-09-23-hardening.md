# Collab security hardening

Status: local implementation; not deployed or release-approved.

## Issue access and mutations

- Issue ID and key resolution always requires workspace ownership or active
  membership. A caller-supplied workspace only narrows that authorized set.
- Issue updates reject empty, unknown or invalid fields using `UpdateIssueSchema`
  in `src/app/api/issues/[issueId]/route.ts`. General edits require
  `EDIT_ANY_TASK` or reporter-based `EDIT_SELF_TASK`; `CHANGE_TASK_STATUS` only
  authorizes status fields and `ASSIGN_TASK` only authorizes assignment. Every
  field in a mixed payload must be authorized. Deletion uses the corresponding
  delete permissions.
- Same-workspace project moves require edit rights, an accessible destination,
  a valid destination status and compatible retained parent/child, label and
  repository relations. Invalid moves fail atomically without clearing relations;
  cross-workspace moves are rejected. Conflicts return 409 for reload and retry.
- Shared workspace permission queries ignore inactive memberships.

## Notes access

- Notes detail, edit, delete, history, comparison and restoration enforce the
  shared access check before content is read or decrypted. Tenant notes require
  active workspace access, including former authors. Restricted notes require
  authorship or an explicit share; administrator role alone does not bypass it.

Offline regression coverage lives in
[`tests/security/access-boundaries.test.cjs`](../../tests/security/access-boundaries.test.cjs).
See [local check mechanics](../../CONTRIBUTING.md#local-checks). Prisma protocol
checks intercept engine requests before any database connection.

## Preview, redirect and packaging boundaries

- Note-history previews sanitize stored HTML with the installed DOMPurify.
- Authentication redirects compare parsed origins, rejecting lookalike hosts,
  protocol-relative external URLs, alternate schemes and malformed URLs.
- Docker context excludes `.env` and `.env.*`, retaining `.env.example` only.

## Shared clients and build repairs

- Prisma omits user password hashes and GitHub credentials by default, including
  nested users. Authentication explicitly requests the password hash; existing
  server GitHub integrations already explicitly select their token.
- All application Prisma entry points reuse the shared credential-safe client.
  Request handlers no longer disconnect a shared connection after each request.
- Optional AI client construction is deferred until use. Missing AI credentials
  no longer prevent route imports; the existing fallback behavior is preserved.
- Project/view list items use the existing exported component; theme types use
  the package's public export. Invitations and client IDs use native randomUUID.

Dependency versions are owned by `package.json` and `package-lock.json`.
The inherited `ignoreBuildErrors` option is removed: production builds enforce
TypeScript errors. See [validation evidence](#validation-evidence-and-limitations)
for the distinction between earlier passes and the failed dependency-head build.

## Outbound webhook boundary

The [app webhook documentation](../apps/README.md#webhooks) owns outbound
configuration, redirect behavior and operator trust requirements. The origin
and redirect regressions are in the security behavior suite.

Legacy Slack availability and rollout constraints are documented in the
[README](../../README.md#integration-availability).

## Approved product direction (future slices, not implemented here)

Forge owns project issues and durable context. Collab projects this state and
reuses Notes as the memory UI. Markdown in the bound repository is canonical;
there must not be two independently editable copies. Memory types are Rules,
Strategy, Decisions and Handoffs, with project, owner and revision and a
Draft -> Approved -> Superseded lifecycle. Approved Rules always load; other
approved context is retrieved as relevant. Discussion summaries retain Slack
source links. Notes contain references to credentials, never credential values.
Existing notes, data and rights must survive the eventual integration.

Each Slack workspace/channel binds immutably to a project/repository. Agent work
requires explicit Ready eligibility, atomic claims, idempotency, scoped
permissions and status receipts. Ready does not imply merge or deployment.
Inspect existing task-manager/MCP/orchestration before adding execution code.
Search indexes are derived; no separate knowledge app or large RAG system is
needed. Domain choice is unresolved; no domains, migrations or cutover are
performed in this security slice. The current Team Space dashboard stays live.


## Follow-up local repairs

- All 36 reported asynchronous route parameter signatures now satisfy the
  generated Next route validators.
- Pinning, template creation, audit logs, comment detail/edit/delete and sharing
  also call the shared Notes access check. Existing operation-specific author
  checks remain. Protected notes cannot publish their content as workspace
  templates; template creation also requires active destination membership.
- Workspace profile edits cannot create membership in an inaccessible workspace.
- Removed unused legacy board/task helpers against deleted Prisma models and
  duplicate notification methods. Global notification preferences use their
  nullable workspace scope. Existing agent stream/config references are repaired.

Notes list, pinned, search and shared collections now compose a shared database
read predicate before fetching content or computing counts. A policy parity
check covers scopes, active/revoked membership, ownership, restriction,
encryption, shares, expiration and project workspace fallback. Handler checks
verify both ordinary and shared list paths and search counts use the predicate.

Template use requires active workspace access and resolves custom templates
and optional projects within that workspace.

## Resumed implementation

Notes creation and project reassignment now validate the destination workspace
and project, including active membership and consistent tenant IDs. Template
management requires active membership. The two AI issue suggestion/related
routes now scope their source issue to the authorized workspace while using
current schema relationships.

Type repair removed an unreferenced legacy assistant widget, repaired editor
command declarations and stale schema references, and preserved compiler checks.
Claude Tag's real Forge issue creation is user-confirmed PASS; do not recreate
acceptance issues or change existing records or the live dashboard.

## Validation evidence and limitations

Earlier implementation checkpoints reported 26 passing behavior checks, lint
with zero errors but remaining warnings, and a strict production build pass.
Those results precede the final dependency head and are not current release proof. Native
hashing/comparison and stream-only email rendering also passed locally; no email
was sent. The build used a dummy localhost database URL without AI credentials.

After Prisma/client were updated together to 6.19.3, generation and the
then-current 26 behavior checks passed. The earlier incremental typecheck result
was stale: the dependency-head strict production build failed with six Prisma
Bytes assignment errors
(`Buffer<ArrayBufferLike>` versus `Uint8Array<ArrayBuffer>`). The earlier build
pass does not establish a passing final dependency head. The recorded dependency
audit reported 41 affected package entries:
0 critical, 3 high and 38 moderate. The three high entries represent one
DeepmergeTS recursive-object stack-exhaustion advisory propagated through
Prisma's config/CLI dependency chain. Its trigger requires recursive in-memory
objects; plain JSON cannot create that condition. This is not a demonstrated
request path in this application, and no incompatible major dependency override
was applied. Source: https://github.com/advisories/GHSA-ggr8-5vv4-36mx
Tiptap-related moderate findings remain; an editor-major migration is separate
work and must not be represented as fixed by these patches.


## Review corrections

Universal search, project summaries and note link previews now apply the shared
Notes read predicate. Favorite-only edits leave scope unchanged.
Issue mutation behavior is documented [above](#issue-access-and-mutations).
Encryption helpers retain the concrete ArrayBuffer allocation type, including
the approval consumer.

The outer executor owns Prisma generation, fresh nonincremental typecheck,
security tests and strict production build gates; this documentation phase owns
its scoped lint pass. These fixes do not claim those gates passed or authorize
deployment.

Review-phase verification: Prisma 6.19.3 regenerated locally, then six focused
checks passed using `node --test --test-name-pattern='review:|issue mutations|collection predicates' tests/security/access-boundaries.test.cjs`.
These execute the repaired handlers, reproduce the visibility race, exercise
operation-specific rights and project-move failures, and run real encryption
roundtrip/tamper checks plus a fresh TypeScript/Prisma Bytes contract compilation.
The issue tests use an in-memory transaction adapter, not a live database;
this does not establish PostgreSQL concurrency behavior. Full validation remains
with the outer executor. Dependency setup used the existing lockfile with
`npm ci --ignore-scripts --legacy-peer-deps` because api-scanner's Next peer
range excludes the locked Next major; no dependency versions were changed.

## Post and Coclaw disclosure follow-up

Post GET now reuses `getPostById`; the shared action excludes inactive workspace
members, preserving owner access and authorized post/comment responses. Coclaw
memory requires active workspace access and applies the shared Notes predicate
to both its content query and total count, including filtered searches.

Two focused handler regressions passed with
`node --test --test-name-pattern='disclosure:' tests/security/access-boundaries.test.cjs`.
They execute the real post action and Notes policy with in-memory Prisma
adapters, covering anonymous, foreign and revoked denial; member/owner access;
and private, restricted, shared and expired Notes across filters and pagination.
No live database or broader validation gates were run in this review round.

## User-bound app Notes and leave-policy follow-up

The served API reference owns the
[app Notes authorization contract](../../public/docs/third-party-api.md#notes-context-and-secrets).
Leave-policy reads use the shared active-workspace helper while preserving owner
access.

Four focused regressions passed with
`node --test --test-name-pattern='app-notes:' tests/security/access-boundaries.test.cjs`.
They execute the token middleware and shared Notes policy against in-memory
Prisma adapters, including author/shared reader/shared editor permissions,
restricted and expired denial, collection/count parity, revoked membership,
and real secret decryption with a dummy key. No live credentials, database,
integration, migration or deployment was used. Broader validation remains with
the outer executor.

## Deferred UX/editor lint checklist

The documentation-phase full lint pass exited 0 with zero errors and 58 warnings.
The following changed-file warnings are accepted follow-ups, retained without
suppression or callback/collaboration behavior changes in this security slice:

- [ ] `src/app/(main)/[workspaceId]/notes/page.tsx:493`: review the missing
  `fetchNotes`/`fetchTags` effect dependencies; verify workspace switches and
  refresh behavior without introducing a fetch loop.
- [ ] `src/components/RichEditor/RichEditor.tsx:434` (callbacks at 608 and 614):
  review unstable mention-trigger dependencies; verify selection and mention
  handling before changing callback identity.
- [ ] `src/components/ai/ChatBar/ChatInput.tsx:71,311`: review unoptimized image
  loading and its LCP/bandwidth cost while preserving attachment previews.
- [ ] `src/components/ui/markdown-editor.tsx:1234,1260`: review initial-content
  effect dependencies and the imperative handle's extra `collabDocumentId`
  dependency; verify collaborative initialization and document switching before
  changing effects that could overwrite synchronized content.

Other warnings occur in unchanged files; this result is not a zero-warning claim.
