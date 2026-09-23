# Collab security hardening

Status: local implementation; not deployed or release-approved.

## First slice

- Issue ID and key resolution always requires workspace ownership or active
  membership. A caller-supplied workspace only narrows that authorized set.
- Notes detail, edit, delete, history, comparison and restoration enforce the
  shared access check before content is read or decrypted. Tenant notes require
  active workspace access, including former authors. Restricted notes require
  authorship or an explicit share; administrator role alone does not bypass it.
- Prisma omits user password hashes and GitHub credentials by default, including
  nested users. Authentication explicitly requests the password hash; existing
  server GitHub integrations already explicitly select their token.
- `/api/slack/my-tasks` and `/api/slack/create-issue` return explicit 503
  unavailable responses. Both relied on user-editable, unverified `slackId`.
  No configuration, profile IDs or existing issues are deleted. The replacement
  will use Forge authority and verified workspace/channel/project binding.
  Check current consumers before deploying this local retirement.
- Shared workspace permission queries ignore inactive memberships.

Validation: `npm run test:security`; tests run without a database or credentials.
The first three access-control checks reproduce failures against the original
commit. Prisma protocol checks use the installed client to validate its generated
selection, with the engine request intercepted before any database connection.
Global omission uses the supported Prisma 6 API:
https://docs.prisma.io/docs/orm/v6/prisma-client/queries/excluding-fields

## Second slice

- Note-history previews sanitize stored HTML with the installed DOMPurify.
- Authentication redirects compare parsed origins, rejecting lookalike hosts,
  protocol-relative external URLs, alternate schemes and malformed URLs.
- Docker context excludes `.env` and `.env.*`, retaining `.env.example` only.

Eight behavior checks now pass. The two new output/redirect regressions fail
against the preceding commit. Dependency security updates remain outstanding.

Initial full typecheck has 160 pre-existing diagnostics. The security tests are
not a claim that build, lint, CI, all authorization surfaces or deployment pass.
Remaining audit work includes mutation validation, verified Slack identity,
HTML sanitization, outgoing webhooks, dependency updates and build repair.

## Third slice

- Issue writes use a strict field allowlist and existing role permissions;
  assignments, labels, parent and status cannot cross the authorized tenant.
- All application Prisma entry points reuse the shared credential-safe client.
  Request handlers no longer disconnect a shared connection after each request.
- Optional AI client construction is deferred until use. Missing AI credentials
  no longer prevent route imports; the existing fallback behavior is preserved.
- Project/view list items use the existing exported component; theme types use
  the package's public export. Invitations and client IDs use native randomUUID.

Eleven behavior checks pass. Full typecheck is down to 155 existing diagnostics
without new error categories. The upgraded build compiles but route collection
exposed the missing bcrypt binary from the script-disabled install; native
password dependency validation and the subsequent build remain in progress.

## Dependency and build verification

Next 16.3.6, React 19.3.0, NextAuth 4.24.15, DOMPurify 3.4.16,
isomorphic-dompurify 2.36.0, bcrypt 6.0.0 and Nodemailer 10.0.10 are installed.
Compatible transitive updates are locked. Native hashing/comparison and
stream-only email rendering pass; no email was sent. The production build
completed with a dummy localhost database URL and without AI credentials.

The build still ignores TypeScript errors under the inherited configuration;
this is not a release gate pass. Generated Next route types exposed 36 legacy
parameter-signature failures in addition to remaining application diagnostics.
Lint now runs through the flat Next config and its code findings are being fixed.
The latest full dependency audit reports 0 critical, 4 high and 38 moderate
entries; remaining high entries are in Prisma's CLI/config dependency chain.

## Outbound webhook boundary

Delivery requires `COLLAB_WEBHOOK_ALLOWED_ORIGINS`, a comma-separated list of
exact HTTPS origins (scheme, canonical hostname and port). Unset or invalid
configuration denies delivery. Credentials, paths, queries and fragments are
not accepted in configured origins; delivery URLs reject userinfo/fragments.
Redirect responses are not followed or retried. Existing webhook records stay
intact. Tests cover absent configuration, lookalike domains, alternate ports,
invalid origins and redirect attempts.

This is a trust boundary, not general protection for arbitrary destinations:
operators must control the allowed services, DNS and destination addresses.
DNS rebinding and internal-target risks remain if an untrusted origin is
allowed. Do not populate production origins or deploy until current consumers
have been inventoried with Network Doctor. No production allowlist was set.

## Approved product direction

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
  generated Next route validators. Application type/lint errors remain.
- Pinning, template creation, audit logs, comment detail/edit/delete and sharing
  also call the shared Notes access check. Existing operation-specific author
  checks remain. Protected notes cannot publish their content as workspace
  templates; template creation also requires active destination membership.
- Workspace profile edits cannot create membership in an inaccessible workspace.
- Removed unused legacy board/task helpers against deleted Prisma models and
  duplicate notification methods. Global notification preferences use their
  nullable workspace scope. Existing agent stream/config references are repaired.

Seventeen local behavior checks pass, including denied Notes sibling handlers,
profile membership escalation, protected template publication, webhook origin
and redirect enforcement, validation wrappers and retained follow operations.
Notes collection/search/template-use authorization and other remaining audit
surfaces still require review. No push, PR, deployment or live configuration change.

Notes list, pinned, search and shared collections now compose a shared database
read predicate before fetching content or computing counts. A policy parity
check covers scopes, active/revoked membership, ownership, restriction,
encryption, shares, expiration and project workspace fallback. Handler checks
verify both ordinary and shared list paths and search counts use the predicate.
Nineteen security checks pass. Latest full typecheck has 113 diagnostics, with
none in the updated Notes access/collection code; lint is still unpassed.

Template use now requires active workspace access and resolves custom templates
and optional projects within that workspace. Twenty security checks pass.
Remaining security review includes Notes creation/reassignment and template
management siblings, plus other HTML output surfaces. Do not treat these local
slices as a completed repository security review or release authorization.

## Resumed implementation

Notes creation and project reassignment now validate the destination workspace
and project, including active membership and consistent tenant IDs. Template
management requires active membership. The two AI issue suggestion/related
routes now scope their source issue to the authorized workspace while using
current schema relationships. Twenty-three local security checks pass.

Type repair removed an unreferenced legacy assistant widget, repaired editor
command declarations and stale schema references, and preserved compiler checks.
The latest completed typecheck is down to 72 diagnostics; subsequent repairs
are pending the next complete typecheck. Lint and strict build remain blockers.
Claude Tag's real Forge issue creation is user-confirmed PASS; do not recreate
acceptance issues or change existing records or the live dashboard.

Full `npm run typecheck` now passes with zero diagnostics, without exclusions
or error suppression. The inherited `ignoreBuildErrors` option is removed.
Twenty-five local behavior checks pass, including global push subscription
scope/clearing and planning activity/child-relation conversion. Strict build
is running. Fresh lint has 92 errors: 24 server JSX try/catch, 25 render-time
component identity, and remaining hook/effect/ref/immutability/CommonJS findings.
These remain release blockers; the replacement and release are not complete.

## Quality gate progress

Full lint now exits successfully (zero errors), and full typecheck remains
clean. Twenty-six behavior checks pass. Server pages catch data-fetch failures
before rendering; hooks run in a consistent order; nested stateless renderers
and icon selection preserve stable component identity; redundant effect state
is derived directly. Undo/redo buttons subscribe to editor transactions, and
issue modal selection is URL-derived with back navigation and stale-parent
cleanup checked. The earlier strict production build passed; final-head build
and dependency review still precede release review/CI and product acceptance.

Prisma/client are updated together to 6.19.3; generation and all 26 behavior
checks passed. The earlier incremental typecheck result was stale: the final-head
strict production build failed with six Prisma Bytes assignment errors
(`Buffer<ArrayBufferLike>` versus `Uint8Array<ArrayBuffer>`). The earlier build
pass does not establish a passing final dependency head. A fresh full audit reports 41 affected package entries:
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
Notes read predicate. Favorite-only edits leave scope unchanged. Issue edits
preserve operation-specific status and assignment grants, while mixed payloads
require permission for every field. Same-workspace project moves validate the
destination, status and retained relations before writing in one transaction;
incompatible relations fail without clearing data. Encryption helpers retain
the concrete ArrayBuffer allocation type, including the approval consumer.

The outer executor still owns Prisma generation, fresh nonincremental typecheck,
lint, security test and strict production build gates. These fixes do not claim
those gates passed or authorize deployment.

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
