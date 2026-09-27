# Collab security hardening

Status: local implementation; not deployed or release-approved.

## Session and workspace access

The session helper in `src/lib/session.ts` and the `getCurrentUser`,
`getUserProfile`, `updateUserProfile` and `updateUserAvatar` actions in
`src/actions/user.ts` resolve the authenticated viewer by session `user.id`,
never email. Once a session is accepted, these lookups use its ID even without
an email or with an email belonging to another account; email cannot substitute
for a missing or deleted subject. Gateway session acceptance has the additional
[identity requirements](#gateway-session-core-inactive-integration) below.
Both `getCurrentUser` implementations return `null` for a missing ID or deleted
user. The other three actions throw `Unauthorized` for a missing ID and
`User not found` when their current-user lookup finds no user; profile and avatar
input validation precede that lookup. `getUserProfile` retains `self_profile`
for the viewer's own profile.

The actions deliberately keep direct lookups: unlike the session helper, they
preserve Date-valued fields and propagate lookup errors. Profile validation is
unchanged; general credential omission is owned by the
[shared Prisma client contract](#shared-clients-and-build-repairs). Avatar input
validation, partial writes and response selection are owned by the
[avatar update contract](#avatar-updates-and-safe-responses).
See the [user-action subject regressions](../../tests/security/user-action-subject.test.cjs)
and the [profile visibility contract](#post-and-coclaw-disclosure-follow-up).

The nine formerly email-bound authenticated actions in `src/actions/workspace.ts`
resolve the actor by session subject ID. The member-add target still resolves
by the supplied email; owner, active workspace-admin and self-removal rules,
validation and return shapes are preserved. Workspace detail REST GET/PATCH/DELETE
use the shared session helper and return 401 for a missing or deleted subject.
PATCH permits the workspace owner, active `owner`/`admin` membership
(`status: true`), or a current database `SYSTEM_ADMIN`. DELETE permits only the
workspace owner or a current database `SYSTEM_ADMIN`. Stale session role
metadata does not grant either privilege. GET still requires ownership or active
membership; system-admin status alone does not bypass this check.
See the [workspace actor regressions](../../tests/security/workspace-actor.test.cjs).
The workspace read actions now list owned or actively joined workspaces only;
`getUserWorkspacesById` requires a live caller matching the supplied user ID.
Basic detail and member-list reads require ownership or active membership.
Detailed reads preserve the explicit current-database `SYSTEM_ADMIN` exception.
Slug-first metadata resolution selects only the ID, preserving missing versus
forbidden errors; the payload query independently scopes access, so revocation
between metadata and payload lookup denies without loading relations. Existing
member/invitation projections remain available to authorized viewers.
See the [workspace read regressions](../../tests/security/workspace-reads.test.cjs).
For invitation list authorization and remaining invitation work, see
[pending invitation list recipient binding](#pending-invitation-list-recipient-binding-27-september-2026).
Mutation revocation atomicity and actual stored workspace-role casing remain
follow-ups. These mocked checks do not prove
revocation after the payload query snapshot or final integrated staging.

`hasWorkspaceAccess` permits workspace owners without a membership row; other
users require an active membership (`status: true`). Revocation denies access
through this helper. See the [session and membership regression](../../tests/security/session-membership.test.cjs).

## Issue access and mutations

- Shared issue lookup accepts a stored ID or an exact issue key, including
  nonnumeric keys such as `A1B-T1`. It requires ownership or active membership in
  the issue workspace, its project's workspace and any linked status project's
  workspace. A caller-supplied workspace only narrows that authorized set.
  REST detail GET and shared updates return 404 when this lookup denies access.
- Shared updates recheck that access inside the existing serializable transaction,
  alongside issue identity and version. If this recheck denies access, the update
  returns 409 before writes, with no issue content in the response.
- REST detail GET and shared update responses filter parent/child issues, labels
  and child counts to the caller's current access. Ownership still grants access
  without active membership. Inaccessible related content is omitted; stored IDs,
  keys and links are preserved. See the
  [issue read-scope regressions](../../tests/security/issue-read-scope.test.cjs).
- Issue updates reject empty, unknown or invalid fields using `UpdateIssueSchema`
  in `src/lib/issue-mutation.ts`, shared by REST and AI updates. General edits require
  `EDIT_ANY_TASK` or reporter-based `EDIT_SELF_TASK`; `CHANGE_TASK_STATUS` only
  authorizes status fields and `ASSIGN_TASK` only authorizes assignment. Every
  field in a mixed payload must be authorized. Deletion uses the corresponding
  delete permissions.
- Priority updates validate case-insensitively against `UpdateIssueSchema` and
  preserve the submitted casing in storage and responses. Existing uppercase
  priorities therefore retain their Kanban grouping and filtering behavior;
  invalid values fail before writes. See the
  [priority regression](../../tests/security/issue-priority.test.cjs).
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
[`tests/security/`](../../tests/security/).
See [local check mechanics](../../CONTRIBUTING.md#local-checks). Prisma protocol
checks intercept engine requests before any database connection. Historical
commands below name the former monolithic file; current runs use
`node --test tests/security/*.test.cjs`.

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

## Approved product direction

The bounded read-only projection has its own
[Forge board contract](../forge-board.md). The
[project memory contract](../forge-project-memory.md) owns canonical storage,
approval, provenance, credential boundaries and existing Notes compatibility.
The broader integration below remains future work.

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
management requires active membership. For the AI issue suggestion/related
routes' access contract, see [AI issue recommendations](#ai-issue-recommendations).

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

Post REST handlers and server actions share the predicates in
`src/lib/post-access.ts`. Reads, counts, comments, reactions, follows and mutations
require current workspace ownership or active membership; authorship alone does
not retain access after membership is revoked. Workspace filters only narrow
access. Posts without a workspace are excluded. Profile post lists and post,
comment and reaction totals are scoped to the viewer's access, not the author's.
The unified timeline checks workspace access before content queries; timeline
creation checks the exact destination before writes or notifications. For the
dashboard, see [AI dashboard payload access](#ai-dashboard-payload-access).
Existing operation-specific author and permission checks remain.

Post/comment notification delivery rechecks each recipient's current access.
Stored notifications referencing inaccessible posts or comments are excluded
from reads and mark-read operations, including read-all; follower records do not
grant access. Post detail and reaction responses use safe user projections.

Comment and post deletion use `src/lib/delete-post-comment.ts` to lock and inspect
descendants within the deletion transaction. A legacy parent link into another
post rejects the deletion before writes, preventing database cascades from
deleting that post's comments or reactions. Each caller retains its own deletion
permission check.

For app-token access and post response restrictions, see the served
[authentication](../../public/docs/third-party-api.md#authentication) and
[posts](../../public/docs/third-party-api.md#posts) reference.

Comment read coverage also remains in `tests/security/comment-access.test.cjs`.
Coclaw memory requires active workspace access and applies the shared Notes
predicate to both its content query and total count, including filtered searches.

Two focused handler regressions passed with
`node --test --test-name-pattern='disclosure:' tests/security/access-boundaries.test.cjs`.
They execute the real post action and Notes policy with in-memory Prisma
adapters, covering anonymous, foreign and revoked denial; member/owner access;
and private, restricted, shared and expired Notes across filters and pagination.
No live database or broader validation gates were run in this review round.

## AI conversations and streaming

Conversation list, creation, detail and archival require current workspace
ownership or active membership; detail and archival also require conversation
ownership. Both chat stream branches (Anthropic/MCP and Coclaw) enforce workspace
access before credential resolution, provider calls or conversation/message
writes. When supplied, `conversationId` must identify the caller's conversation
in that workspace. Omitting it does not bypass workspace access.

Coclaw channel message reads and writes use app authentication and bind the URL
user and message workspace to the authenticated token context.

## User-bound app Notes and leave-policy follow-up

The served API reference owns the
[app Notes authorization contract](../../public/docs/third-party-api.md#notes-context-and-secrets).
Leave-policy reads use the shared active-workspace helper while preserving owner
access. Ordinary members receive basic policy details; management fields require
`MANAGE_LEAVE`.

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


## CI review-input repair

The security regressions are split by subject into ordinary executable
`tests/security/*.test.cjs` files, using the existing VM loader and fixtures in
`helpers.cjs`. The package entrypoint discovers every file and runs them serially to preserve
the original single-process resource bound. The integrated feature-page
regression lives in [`feature-navigation.test.cjs`](../../tests/security/feature-navigation.test.cjs)
and uses native Next navigation helpers for the 404 and redirect checks.
The opt-in native PostgreSQL cascade regression still covers both comment
deletion paths and all three post deletion paths.

Notes-comment notifications now use the existing Notes collection policy for
recipient delivery, notification reads and mark-read operations. A comment
attached to both a post and a Note must satisfy both policies. Revoked tenant
membership, expiration and restricted sharing rules remain enforced. App handlers use the actual token
user for authorization and authorship even when the installer differs; a
regression check exercises that distinction and subsequent revocation.

## Pending invitation list recipient binding (27 September 2026)

Both `getPendingInvitations(email)` server actions require the current database
user resolved by the session subject and an exact match with that user's current
email. Caller-supplied and stale session emails cannot select another recipient.
An outdated email argument fails with `Unauthorized` until the caller refreshes
it to match the current database email; the email parameter is deliberately kept.
The signatures, pending/unexpired filters, descending creation order and existing
inviter projections remain unchanged. Invitees may read their own invitations
before joining a workspace; no membership requirement is added.
For the recipient list API and workspace invitation management, see
[Workspace API identity and invitation recipients](#workspace-api-identity-and-invitation-recipients).

The [actual-action mocked regression](../../tests/security/invitation-lists.test.cjs)
covers both exports, missing/deleted subjects,
foreign recipients, stale session email, database email changes and valid unjoined
invitees. Four denial checks failed before the fix (two positive checks passed);
the focused invitation/workspace-read/session checks then passed 16/16 with no
skips. No email, database, provider or runtime operation was performed. For token
preview, acceptance and their remaining verification limits, see the
[token contract](#invitation-token-preview-and-acceptance-27-september-2026).
Concurrent changes after the list's user lookup remain separate work.
The redundant generic pipeline test stage is explicitly skipped;
review, documentation, scoped lint, CI and exact-head Octopus gates remain.

## Invitation token preview and acceptance (27 September 2026)

The server actions and exposed `/api/workspaces/invitations/[token]` adapters
share `src/lib/workspace-invitations.ts`. Preview requires a live session subject
and current database recipient email before loading workspace/inviter relations;
no workspace membership is required. Pending status and expiry are checked for
both preview entry points. Existing inviter/workspace projections are retained.

Acceptance re-reads the subject and recipient inside a serializable transaction,
then conditionally claims the same pending, unexpired token before creating one
active `MEMBER` membership. A lost claim grants nothing; membership failure rolls
back the claim. There is no retry, role escalation or inactive-member reactivation.
An active existing member retains the action's failure response with the invitation
pending; REST retains its successful already-member response and consumes the
invitation atomically. Responses retain the existing success fields and error
messages, with new authorization/conflict responses where previously unguarded.

Focused actual action/REST/shared-helper checks pass 20/20 (including the six list
and two session checks). The final baseline had 10 failing regressions and two
passing existing-member checks. The first draft of the test adapter eagerly ran
Prisma array operations; it was corrected to deferred operations and rollback
before that baseline. A later three-test loader failure was fixed by wiring the
new helper into the existing list fixture. Raw historical receipts are retained.
Exact helper/action/route bodies also pass a scoped strict TypeScript check with
real generated Prisma types and declared auth/response boundaries; this is not a
whole-application build. Mocked transactions establish assertions and rollback
model behavior, not native isolation or concurrent database scheduling. No database,
email, provider, browser or runtime operation was performed. Native concurrency,
post-snapshot identity changes, invitation creation/revocation policy and integrated
staging remain separate gates. Generic pipeline test stage: SKIPPED; all other
review/documentation/lint/CI/exact-head Octopus gates remain required.

## Project status reads (27 September 2026)

`getProjectStatuses(projectIds)` resolves the current database user by session
subject. It applies the existing workspace owner-or-active-member predicate through
the status's project in the payload query itself. A project is excluded unless the
viewer owns or actively belongs to its workspace; system-admin role alone grants
no access. The two status selectors and view toolbar retain their signatures and
selected project IDs.
Scalar status fields, inactive statuses, order/name sorting, empty results and
masked failure message remain unchanged. The earlier project-ID preflight is no
longer needed because access is checked with the status read.

Four focused regressions failed on the prior source (one positive passed); the
status/session/workspace-read selection then passed 15/15 with zero skips. The
[status regressions](../../tests/security/project-status-read.test.cjs)
execute the actual action and shared helpers against modeled Prisma, including
revocation before payload selection. They do not prove native isolation or changes
after the query snapshot. No database/runtime/browser/build/provider operation was
performed. Generic pipeline test stage is SKIPPED; review/docs/scoped lint/CI and
complete exact-head Octopus gates remain. For labels, see the
[label action access contract](#label-action-access-27-september-2026).

## Label action access (27 September 2026)

The four label actions resolve the session subject by ID while preserving their
`Unauthorized` and `User not found` errors. Workspace selection still uses the
existing cookie/fallback helper. Label payload reads and create/update/delete
access checks reuse the owner-or-active-member predicate, with no global-admin
exception. Create binds the workspace relation through a scoped `connect`;
update/delete bind both the label ID and the original workspace ID plus current
workspace access in the write predicate. Preliminary label lookups select only
ID/name/workspace ID, preserving missing-versus-forbidden errors without loading
unused workspace relations. Names, trimming, duplicate checks, colors/defaults,
scalar returns and delete result remain unchanged.

The final 11 [label regressions](../../tests/security/label-access.test.cjs)
produce 10 failures/one positive on prior source;
the label/session/status selection passes 18/18 with no skips. Checks execute the
actual actions, workspace-selection helper and access predicate with modeled
Prisma, including loss of membership before payload/write and a label moving
between accessible workspaces before update/delete. Exact action/predicate bodies
pass strict TypeScript against generated Prisma types. That check initially found
a spread-type error in nested connect; explicit ID plus an AND predicate fixed it.
These checks do not prove native nested-write execution, isolation or concurrent
post-snapshot revocation. No database/runtime/browser/build/provider operations
were performed. Generic native test stage is SKIPPED; review/docs/scoped lint/CI
and complete exact-head Octopus remain required. Native concurrency stays in final
integrated staging.

## Gateway page prerequisites (27 September 2026)

The workspace layout and Project Context landing page now resolve the live user
through the shared session-subject helper. Both apply the existing workspace
owner-or-active-member predicate, without a role-only system-admin exception.
Layout keeps its slug-first then ID fallback and `/login`/`/welcome` redirects.
The landing page keeps the existing slug/legacy-ID resolver, missing-workspace
and project redirects, heading, links and `ProjectNotesList` props. Owners need
no membership row. Its project payload query also rechecks workspace access after
the workspace lookup, and `currentUserId` comes from the live subject.

The six page regressions execute the actual TSX server functions and session,
access and slug helpers against modeled Prisma and JSX objects. Five fail on
prior source (one positive passes); the page/session/workspace-read selection
passes 16/16 with no skips. This proves the modeled authorization, redirect and
returned-prop contracts, not hydrated UI, database isolation or changes after the
query snapshot. No runtime/browser/build/database/provider operation occurred.
Generic native test stage is SKIPPED; other review/docs/lint/CI/exact-head Octopus
gates remain. These are gateway prerequisites only; see the
[inactive gateway core contract](#gateway-session-core-inactive-integration).
Real-identity, isolated-writer, schema/restore and Ready-fence acceptance remain
separate.

### Gateway session core (inactive integration)

For current adapter coverage, see [shared session consumers](#shared-session-consumers),
[direct action session consumers](#direct-action-session-consumers),
[workspace and project page session consumers](#workspace-and-project-page-session-consumers),
[app and developer page session consumers](#app-and-developer-page-session-consumers),
[app ecosystem API session consumers](#app-ecosystem-api-session-consumers),
[Notes collection session adapter](#notes-collection-session-adapter),
[Notes detail session adapter](#notes-detail-session-adapter),
[Notes history session adapter](#notes-history-session-adapter),
[Notes template session adapter](#notes-template-session-adapter),
[Notes secrets session adapter](#notes-secrets-session-adapter),
[Issue API session adapter](#issue-api-session-adapter),
[Timeline session adapter](#timeline-session-adapter) and
[Workspace API identity and invitation recipients](#workspace-api-identity-and-invitation-recipients).
For auth routes and client behavior, see [Gateway client session and logout](#gateway-client-session-and-logout).
For proxy enforcement, see [Gateway request and realtime authorization](#gateway-request-and-realtime-authorization).
Deployment activation remains pending. Gateway mode must remain
disabled until all reachable consumers and the edge/session/logout contract have
migrated and private-origin enforcement is accepted.

The adapter defaults to `nextauth`; explicit `nextauth` also preserves the original
arguments and session. It accepts explicit `gateway` and returns `null` for any
other `COLLAB_AUTH_MODE`. Gateway sessions require canonical, bounded UTF-8
base64url issuer/subject/email claims with leading BOM characters preserved,
`x-collab-email-verified: true`, an issuer exactly matching `COLLAB_GATEWAY_ISSUER`,
and the exact `weezboo.com` domain (case-insensitive). Missing or invalid claims
return `null`; a missing or empty configured issuer also denies access.
The existing Account table must contain the explicit `maestro` mapping keyed by
SHA-256 of issuer, NUL and subject. The live user must have exactly one `maestro`
account and a matching current email (case-insensitive); the adapter never
provisions users, links by email, or falls back to a cookie in gateway mode.
Mapping database errors propagate without legacy fallback. For request Origin
enforcement and trusted-ingress requirements, see
[Gateway request and realtime authorization](#gateway-request-and-realtime-authorization).

The [core parsing, origin and adapter checks](../../tests/security/gateway-session-core.test.cjs)
execute the actual identity and session modules with modeled headers/Prisma/NextAuth.
They qualify parsing, origin decisions and session
selection only, not live issuer trust, proxy stripping, database isolation,
consumer coverage, browser behavior, or deployment acceptance.
The two BOM regressions reproduce subject-key conflation and incorrect issuer
acceptance before the decoder fix; the original three checks continue to pass.

### Shared session consumers

`getAuthSession` in `src/lib/auth.ts` and `getCurrentUser` in `src/lib/session.ts`
import the shared request-session adapter. Their callers, including Forge Board
and project memory, inherit it; remaining direct NextAuth consumers are pending.
Their bodies, legacy auth options/callbacks and current-user ID lookup are
unchanged. Both inherit the [adapter contract](#gateway-session-core-inactive-integration).
Mapping database errors propagate from `getAuthSession`; `getCurrentUser` preserves
its existing catch-and-null behavior.
Serialized current-user dates and nullable email verification remain unchanged.

Two actual-helper regressions fail before migration and pass afterward alongside
the existing core, session/membership, workspace-read and page prerequisites.
Legacy tenant fixtures load the actual adapter with explicit `nextauth` mode;
the two integration cases load both helpers, adapter and identity parser in
gateway/invalid/default/legacy modes. Prisma, NextAuth and headers are modeled.
This proves modeled shared-helper behavior only; activation and acceptance remain
subject to the [gateway integration requirements](#gateway-session-core-inactive-integration).

### Direct action session consumers

The eleven action modules for app installation, comments, issue comments, labels,
leave, posts, post statistics, reactions, search, users and workspaces now import
`getServerSession` from the request-session adapter. Only the import source changes;
auth options, arguments, action bodies, projections, errors and tenant predicates
are preserved. Legacy mode remains the deployment mode. See
[workspace and project page session consumers](#workspace-and-project-page-session-consumers)
for page migration coverage and the remaining direct consumers.

The actual user-action integration case fails before migration and passes afterward
with mapped gateway identity, missing claims, revoked mapping, database failure,
invalid mode and default/explicit legacy behavior. Its Date-valued projection and
error propagation remain distinct from the serialized/catching session helper.
Existing affected user, workspace, label, comment, post and leave checks use the
actual adapter in explicit legacy fixtures. This is modeled source evidence, not
provider delivery, database isolation, all-route coverage or runtime acceptance.


### Workspace and project page session consumers

Fifteen direct NextAuth imports in workspace/project pages now use the shared
request-session adapter: project details/settings/features/changelog/GitHub,
workspace apps/views, workspace settings and the workspace list. Import reversal
restores the prior source byte-for-byte; page bodies, auth arguments, redirects,
props and existing predicates are unchanged. See
[app and developer page session consumers](#app-and-developer-page-session-consumers)
for the remaining page migration coverage and outstanding consumer census.

The Features and Changelog integration cases execute the actual pages, adapter
and identity parser with modeled dependencies. They fail before migration and
pass afterward for mapped gateway identity, missing claims, revoked mapping,
redirects, returned props and explicit legacy mode. Existing feature navigation
and page prerequisites remain in the focused check set. These checks do not
prove hydration, trusted ingress or every page/route behavior.

The project Features and Changelog pages still use email-based membership checks
without an active-membership condition and lack a current workspace-access
predicate on their project payload query. These are remaining tenant blockers,
not closed by this mechanical migration. Resolve the reachable access gaps and
complete the consumer/alias/wrapper census before any real gateway exposure;
deployment stays in legacy mode and all final runtime gates remain.


### App and developer page session consumers

The app store and four developer pages (dashboard, apps, management and webhooks)
now import the shared session adapter. Only the import source changes; existing
optional-session app discovery, user/role guards, data queries and returned props
are preserved. The developer dashboard integration case fails before migration
and passes afterward, checking the mapped ID delivered to its data readers,
login redirects before data reads on missing/revoked/invalid gateway identity,
returned cards/activity and default/explicit legacy behavior. The actual page
and adapter execute against modeled dependencies, not live providers or a browser.

The literal page-import inventory is now migrated. For API coverage and the
remaining consumer census, see [app ecosystem API session consumers](#app-ecosystem-api-session-consumers).

### App ecosystem API session consumers

The import migration moved sixteen app, developer, OAuth authorization and admin
API routes to the shared request-session adapter without changing handler behavior.
The credential and manifest routes subsequently adopted the live-user helper and
[owner-bound access contract](#app-credential-ownership-and-explicit-reveal).
For leave API and service migration status, see
[leave actor identity and active access](#leave-actor-identity-and-active-access).
Gateway mode remains disabled subject to the
[gateway integration requirements](#gateway-session-core-inactive-integration).

Four representative actual handlers (developer API-key read, admin statistics,
app API-key reveal marker, and OAuth consent) execute with the real adapter and
parser against modeled dependencies. They cover mapped identity, current role
and owner denial, missing claims, revoked mapping, invalid mode, database failure
and legacy/default sessions. The final fixture has four RED results before the
imports and four PASS after them; eight unchanged core passes are reused from
the initial run. That initial run also had four fixture failures because its
isolated parser lacked the process global; the fixture was corrected and only
the affected route checks were repeated. This is 12 applicable passes across
two runs, not a single combined green run or all-endpoint/provider/DB proof.

For credential and manifest ownership, publisher assignment and reveal limits,
see [the owner-bound access contract](#app-credential-ownership-and-explicit-reveal).
OAuth issuance now follows the
[workspace access contract](../oauth-endpoints.md#workspace-access-at-code-issuance).
Its [modeled regression evidence](#oauth-workspace-access-at-code-issuance) does
not replace the Features/Changelog blockers or the final alias/wrapper census.
No edge, auth endpoint, logout, credential custody, runtime or deployment behavior
is accepted by this import migration.

### App credential ownership and explicit reveal

The credential reveal, API-key rotation, manifest submission and draft creation
routes now resolve the live actor through `getCurrentUser`. Credential and
manifest reads require the actual `App.userId`; an absent owner, a publisher
label or an admin session does not grant access through these owner routes.
Draft creation accepts an omitted publisher or the actor's own ID and rejects
foreign publisher assignment.

Secret and API-key reveal claims condition their update on current app ownership,
the unrevealed flag and the exact credential read. A failed claim returns no
credential. Secret decryption happens inside the claim transaction so a failure
rolls back the claim. Rotation checks ownership again at its update, and manifest
submission first claims an owner-bound DRAFT app inside its transaction before
writing versions, scopes or OAuth settings.

The developer app detail page now requires a live owner on the server and sends
an explicit credentials-card DTO without the API key or encrypted secret. The
card does not fetch credentials on mount: reveal requires an explicit action,
successful responses populate local state, and hide/copy remain available.
Successful API-key rotation supersedes pending reveal responses; failed rotation
preserves a successfully revealed key.
Credential-bearing responses use `Cache-Control: no-store`.

Creation still returns credentials for API compatibility. A successful reveal
claim is one explicit reveal per stored credential state, not global once-only
issuance: the existing owner-bound developer-docs API-key reader and creation/
rotation responses remain separate. For public app reads, see
[App read access](../apps/README.md#app-read-access). Publisher-based deletion
and other app lifecycle routes still need their
separately scoped access review/fixes before gateway activation.

The [ownership regression suite](../../tests/security/app-credential-ownership.test.cjs)
executes actual handlers, the live-user helper, owner predicate, page and client
component with modeled dependencies; the [gateway adapter cases](../../tests/security/gateway-app-api.test.cjs)
cover session integration. Competing claims, ownership changes, decryption rollback
and deferred reveal/rotation ordering are modeled regression evidence, not real
database concurrency/isolation or browser/runtime acceptance.

### App list and detail visibility

The public read contract is documented in [App read access](../apps/README.md#app-read-access).
Five focused [actual-handler checks](../../tests/security/app-visibility.test.cjs)
cover these boundaries with modeled database dependencies. They do not establish
native authentication, database snapshot isolation, post-lookup revocation,
browser behavior or integrated gateway/runtime acceptance. The remaining
lifecycle access policies retain their separate gates.

### OAuth workspace access at code issuance

The regular and MCP authorization contract, including transaction limits and
error responses, is documented in
[workspace access at code issuance](../oauth-endpoints.md#workspace-access-at-code-issuance).

Focused [modeled tests](../../tests/security/oauth-workspace-access.test.cjs)
reproduce nine failures with three controls on prior
source. Twelve affected checks pass with a distinct transaction facade, alongside
four reused gateway cases. The earlier combined 16-pass run preceded that fixture
strengthening; the current 16 applicable passes span two runs. No native database,
provider, browser or gateway activation acceptance is implied.

### GitHub repository sync and debug access

Repository sync, release sync and branch GET/POST routes now resolve a live
database actor and scope the exact repository to workspace ownership or active
membership before credential decryption, provider calls, branch reads or writes.
Anonymous/deleted actors receive 401; inaccessible repositories receive 404.
The sync route retains its explicit current-user token fallback after this gate.

Debug project and repository queries use the same workspace access boundary.
Both repository response locations select safe metadata explicitly, omitting
access tokens and webhook secrets. Successful debug responses are `no-store`,
and errors no longer include raw exception details.

The [seventeen modeled actual-handler checks](../../tests/security/github-sync-access.test.cjs)
cover denial without effects, legitimate
owner/active-member behavior, foreign/inactive rows in the debug list, projection
and token fallback. The final fixture reproduces twelve failures and five
positive controls on prior source. A scoped exact-body Prisma typecheck passes.
Entry authorization does not cancel an in-flight sync after revocation; existing
nontransactional writes and globally keyed commit SHA upserts remain separate
limitations. For OAuth state, see [GitHub OAuth browser state](#github-oauth-browser-state).
For disconnect authorization and remaining lifecycle limits, see
[GitHub repository lifecycle access](#github-repository-lifecycle-access).
Other recorded access gaps remain activation prerequisites. For status reorder mutations,
see [Project status reorder access](#project-status-reorder-access).
No real provider calls, database isolation or integrated runtime acceptance is
established by these modeled checks.

## Project status reorder access

`PATCH /api/projects/{projectId}/statuses/reorder` resolves a live database actor
and requires ownership or active membership in the exact URL project's workspace.
An absent or deleted actor returns 401; an inaccessible project returns 404.
The transaction rechecks access and scopes each mutation to that project and
current workspace predicate. Failed transaction-entry access or foreign or
missing explicit status IDs return 409 and roll back earlier batch updates.

Name-based multi-project broadcasts retain missing-name no-ops, ID precedence,
sequential duplicate IDs, numeric order normalization and inactive-status support.
Nine [modeled actual-route checks](../../tests/security/project-status-reorder-access.test.cjs)
pass after six failures and three positive controls on prior source. A scoped
exact-body Prisma/Next typecheck passes. These checks model transaction rollback
and entry revocation; they do not establish database isolation or revocation
visibility after a database snapshot.

## GitHub OAuth browser state

The authorization URL issuer and callback resolve the live database user through
the shared session adapter. The issuer treats legacy `state=project:<id>` input
only as project metadata, authorizes that exact project for its workspace owner
or active member, and generates a random provider-facing nonce. Personal flows
remain supported. A purpose/version-tagged AES-GCM cookie binds the nonce, actor,
optional project and ten-minute expiry using the existing encryption service.
Production uses a host-only `__Host-` Secure, HttpOnly, SameSite=Lax cookie at `/`;
non-production environments use an unprefixed non-Secure cookie for local HTTP.
The issuer returns 401 without a live actor, 400 for duplicate or invalid project
state input, and 404 for an inaccessible project. Callback validation bounds the
cookie to 2,048 characters and the nonce to 64 lowercase hexadecimal characters.

The callback rejects missing, duplicate, mismatched, tampered, expired or malformed
state before provider exchange or credential writes. It trusts project metadata
only from the sealed cookie and rechecks project access before provider effects.
Missing/deleted actors redirect to login; other denials return a generic error to
`/projects`. Authorized project success retains its settings redirect and GitHub
tab; personal success remains on `/projects`. Callback responses clear the cookie
on the same path and are `no-store`; authorization URLs and state are not logged,
and raw provider/decryption errors are not returned in redirects. Shared
encryption/decryption and live-user session failures log only fixed messages.
Session resolution or user lookup failure returns no actor, so issuance denies
with 401 and the callback clears the cookie and redirects to login.

The historical sixteen-check route/helper run passed after fifteen failures and
one control on prior source, using actual encryption and mocked provider/database
boundaries. The R1 regression additionally captures encryption/decryption logs:
both shared catch sites emit fixed messages while preserving generic throws,
and tampered state still denies and clears the cookie before provider effects.
The [same regression fixture](../../tests/security/github-oauth-state.test.cjs)
also covers throwing session resolution and live-user lookup through the actual
shared helper, checking fixed logs and denial without provider or credential effects.
A scoped exact-body Prisma/Next/Node typecheck passes. A newer issuer request
replaces the browser's pending cookie. Clearing it prevents ordinary subsequent
browser replay, but does not provide atomic single use against concurrent requests
or a retained copy of the cookie; provider code redemption remains provider-owned.
No real provider, browser, database concurrency or runtime acceptance is claimed.
For repository connection access, metadata privacy and remaining lifecycle limits,
see [GitHub repository connection metadata](#github-repository-connection-metadata).

## GitHub repository connection metadata

`GET /api/github/oauth/repositories` resolves a live actor and joins connection
metadata only through the shared repository owner/active-member predicate. Provider repositories
remain in the list even when their Collab connection is inaccessible; those rows
have no connected project metadata and report `isConnected: false`. Authorized
connection names, provider pagination/search/sort and disconnected-account behavior
remain intact. Successful responses are `no-store`.

Both `POST /api/github/oauth/connect` and manual-token `POST /api/github/repositories`
require a live actor and exact project workspace owner or active-member access
before credential use or writes. Owners do not need a membership row. Missing or
deleted actors receive 401; inaccessible projects receive 404.
The OAuth route retains the global repository-ID availability check required by
schema uniqueness, selecting only an identifier and returning a generic duplicate
message. This still discloses availability, not another project's identity.
Authorized OAuth webhook creation, admin checks, localhost warning and initial
sync behavior remain. Manual setup deliberately retains its authorized webhook
secret response and initial version behavior; neither success response exposes
stored access tokens. Touched route errors use fixed logs and generic unexpected
error responses while preserving the existing known provider-error statuses.

Ten [modeled actual-route checks](../../tests/security/github-repository-metadata.test.cjs)
pass after five failures and five controls on prior source. A scoped exact-body
Prisma/Next/Node typecheck passes. These checks
mock provider/database operations and establish no live provider or concurrency
acceptance. Caller repository ID versus provider-returned ID binding, post-entry
revocation, shared provider-helper logging, nontransactional webhook/connection
lifecycle and globally keyed commit SHA writes remain separate recorded boundaries.
For repository details, disconnect and configuration access, see
[GitHub repository lifecycle access](#github-repository-lifecycle-access).

## GitHub repository lifecycle access

`POST /api/github/oauth/disconnect`, `GET /api/github/oauth/user-info`,
`GET`/`DELETE /api/github/repositories/[repositoryId]`, and
`PATCH /api/github/repositories/[repositoryId]/configuration` resolve the current
user through the shared session helper.
Missing or deleted users receive 401 before credential use or writes. Repository
reads require the exact repository and workspace owner or active membership
(`status: true`); owners need no membership row. Missing or inaccessible
repositories receive 404. Configuration update and repository deletion repeat that
predicate in their final database write selector. A failed final selector retains
the existing generic 500 response; it does not mutate the repository.

Repository details retain their existing relation payload and exclude stored
access tokens and webhook secrets. Configuration fields, validation, and partial
update behavior remain unchanged. Successful responses are `no-store`; touched
exception logs use fixed messages instead of provider/database error details.

Account disconnect clears only the current user's GitHub account fields. It does
not revoke provider credentials or erase repository-stored tokens. Repository
disconnect still attempts webhook deletion before local cascade deletion, tolerates
provider failures and 404, and may have already called the provider when the final
database selector rejects changed access. This is not an atomic provider/database
transaction or a proof of concurrent revocation safety.

Seventeen [actual-route checks](../../tests/security/github-lifecycle-access.test.cjs)
with mocked database/provider/encryption boundaries
pass after thirteen regression failures and four controls on prior source. The
four exact route bodies and shared access helpers pass a scoped Prisma/Next/Node
typecheck. These are source and modeled behavior checks, not native database,
provider or runtime acceptance. Existing configuration-UI strategy mismatches and
post-snapshot access changes remain separate.

## Project statuses API access

`GET` and `POST /api/projects/[projectId]/statuses` resolve a live user by ID and
require the exact project's workspace owner or active-member access. Owners need
no membership row; missing/deleted actors receive 401 and inaccessible or missing
projects receive 404. GET repeats project access in its status query and retains
active-status ordering and the existing status/template projection. Issue counts
require the requested project, its workspace and the shared issue-read predicate.
Successful responses are `no-store`; unexpected error logs use fixed messages.

POST rechecks project access at transaction entry and returns 409 if it changed.
Clearing prior defaults and creating the new status use the same transaction, so
creation or template-FK failures roll back default changes. Existing 201 response,
optional-field defaults, ordering and global StatusTemplate catalog behavior are
preserved, including nullable and inactive template references. No new template
ownership rule or database uniqueness constraint is introduced.

Twelve actual-route modeled checks pass after eleven failures and one control on
prior source. The exact route body and shared predicates pass a scoped
Prisma/Next/Node typecheck. These checks mock database operations; they do not prove
native isolation, access changes after the transaction's check, or concurrent
single-default uniqueness. For project summary payload scope, see the
[summary access contract](#project-summary-payload-access).

## Project summary payload access

`GET /api/projects/[projectId]/summary` resolves a live actor by ID and authorizes
the exact project through workspace owner or active membership. Owners need no
membership row; absent/deleted actors receive 401, and inaccessible or missing
projects receive 404. Issue groups, counts and widget lists require the requested
project/workspace and the shared issue-read predicate. Parent and BLOCKS-source
projections are independently filtered through the same read policy.

Status, repository and repository-activity queries repeat current project access.
Features retain project-only rows with a null workspace and matching-workspace
rows; explicit workspace mismatches are excluded. Notes keep the shared access,
restriction and expiry policy while requiring consistent workspace/project
bindings. Workspace Notes linked to another project in the same workspace remain
visible, as do project-only Notes; foreign workspace bindings do not become
visible through the project branch of the query.

Existing response projections, widget limits, date windows and ordering remain
unchanged. Successful responses are `no-store`; unexpected error logs use a fixed
message. Eleven actual-route modeled checks pass after ten failures and one
control on prior source; the exact route and shared predicates pass a scoped
Prisma/Next/Node typecheck. The database boundary is mocked, so native isolation,
a single consistent snapshot and revocation after a query are not established.
Feature actions and other endpoint policies remain separate.

## Post pin and manual follow access

Post pin and follow routes resolve the current database actor by session ID.
Absent or deleted actors receive 401; missing, unscoped or inaccessible posts
receive 404. Workspace ownership or active membership remains required, including
for system administrators. Pinning additionally preserves the existing author,
owner, current system administrator or configured `PIN_POST` role authority.

The final pin update repeats workspace access and pin authority. The configured
role branch requires both the captured role to remain on the active membership
and its permission to remain configured. A concurrent change to another role may
require a new request even if that new role also grants pinning. The pin fields
and audit action are one nested Prisma write; failure cannot commit one alone.
Initial permission denial remains 403; a failed final write retains the existing
generic 500 response.

The three manual follower service methods enforce post access at their database
boundary. Upsert filters the existing row and separately guards the post
connection used for creation. Reads and deletes filter through current post
access. Duplicate follows and repeated unfollows remain successful; access lost
after the route lookup yields a false follow result or a no-op delete. An add
that fails its final guard returns the existing generic 500. The read service's
database-error fallback remains false. Successful responses are `no-store`;
touched route and manual follower logs use fixed messages.

Twenty focused actual-route/service checks pass after nineteen failures and one
control on prior source. The nearest post regression file passes 164 subtests
(165 Node test entries including its enclosing test), with only its role fixture
extended to model the final permission predicate. Exact route and follower method
bodies pass a scoped Prisma/Next/Node typecheck. These checks model database
filtering and nested rollback; they do not establish native isolation or access
revocation after the database statement's snapshot. Automatic following,
asynchronous notification delivery, and the unchanged permission helper's error
logging remain separate. No provider or runtime operation was performed.

## Notes collection session adapter

The Notes collection, search, pinned, shared-with-me, tags and link-preview
modules now use the shared request-session adapter. This covers eight handlers,
including note and tag creation. They inherit the existing
[adapter contract](#gateway-session-core-inactive-integration), retaining the
same `authOptions` argument.
Only the session imports changed; handler policies, responses and side effects
remain unchanged. Nine actual-handler adapter checks and 21 existing Notes and
gateway checks pass with mocked database operations. The
[Notes adapter fixture](../../tests/security/gateway-notes-collections.test.cjs)
executes the selector and handlers but does not independently verify the mapping
query; that coverage belongs to the linked core checks.

This does not authorize gateway activation. Separate tenant-policy repairs remain
required: tag listing and creation accept a supplied workspace without checking
membership, tag listing includes unscoped note counts, note creation connects
supplied tag IDs without checking their ownership/workspace, and issue link previews lack active membership and the
shared issue-read scope (and exclude owners without membership rows). Existing
raw error logging and post-lookup access races also remain outside this import
change. No runtime, identity provisioning or provider operation was performed.

## Notes detail session adapter

The note detail (GET/PATCH/DELETE), pin (POST), share (GET/POST/DELETE) and
individual comment (GET/PATCH/DELETE) handlers now use the shared request-session
adapter with the same `authOptions`, inheriting the
[adapter contract](#gateway-session-core-inactive-integration).
Only four session imports changed; existing
note access, ownership, sharing and comment-author policies remain intact.

The [focused fixture](../../tests/security/gateway-notes-detail.test.cjs)
executes all ten handlers, the selector, identity parser and
actual personal-note access policy with mocked Prisma. It checks mapped actor
success, foreign-note denial, identity failure without legacy fallback, and
explicit/default legacy behavior. Mapping-query behavior remains covered by the
unchanged core fixture. This is not native database or concurrency acceptance.

Gateway activation remains disabled. The existing unchecked tag-ID connection
gap also applies to note PATCH (`tags.set`), alongside note creation; both need
the same eventual tag policy. Existing precheck/final-write races, raw error
logging and pin authorization for workspace owners without a matching member
role remain separate. No runtime, provider or identity provisioning occurred.

## Notes history session adapter

Version list, single-version read/restore, comparison and save-as-template now
use the shared request-session adapter with unchanged `authOptions`, inheriting
the [adapter contract](#gateway-session-core-inactive-integration). Only four
imports changed across five handlers. Existing read/edit, versioning-enabled,
protected-note and template workspace checks remain intact.

The [focused fixture](../../tests/security/gateway-notes-history.test.cjs)
executes the actual handlers, identity parser, selector and
access helpers with mocked Prisma and versioning operations. It checks mapped
owner success, restore EDIT-share success, exact actor attribution to restoration
and template creation, foreign-note denial, identity failure before downstream
operations and explicit/default legacy behavior. It does not prove native
version transactions, concurrency, encryption or runtime acceptance. Core
mapping-query evidence is reused unchanged.

Gateway and worker remain disabled. Existing permissive version parsing,
unbounded history pagination, precheck/final-write races, split restoration
metadata/content writes and raw error logging are unchanged. Workspace admins
can also fail the restore route's additional author/EDIT-share filter. These
remain separate from session-import convergence.

## Notes template session adapter

Template list/create, individual template read/update/delete and template use now
use the shared request-session adapter, inheriting the
[adapter contract](#gateway-session-core-inactive-integration).
Three imports cover six handlers; the
same `authOptions`, built-in guards, workspace/member policy, validation, DTOs
and side effects remain unchanged.

The [focused fixture](../../tests/security/gateway-notes-templates.test.cjs)
executes the actual handlers, identity parser, selector,
workspace access helper, Zod validation and placeholder replacement with mocked
Prisma and built-in data. It checks mapped creation authorship and template-use
user context, foreign-workspace denial, built-in read/edit/delete behavior,
identity failures before downstream operations and explicit/default legacy.
Existing template-use policy evidence and unchanged core mapping-query checks
remain separate. This does not prove all permission branches or native/runtime
concurrency.

Gateway and worker remain disabled. Null-workspace custom-template detail access,
member-level mutation policy, precheck/final-write races, usage-count timing and
workspace-wide count-based numbering remain existing limitations outside this
import change. No provider, credential or runtime operation was performed.

## Notes secrets session adapter

Audit-log GET, copy POST, export GET and reveal POST now inherit the
[shared adapter contract](#gateway-session-core-inactive-integration). Only four
session imports changed; `authOptions`, note access, owner/admin gates, audit
behavior, crypto boundaries, responses and headers remain unchanged.

The [focused fixture](../../tests/security/gateway-notes-secrets.test.cjs) executes
the actual handlers, identity selector and access/audit helpers with mocked
Prisma and dummy decryption. It checks mapped actor success, variables/JSON
responses, audit attribution, explicit/default legacy behavior and identity
failure before downstream reads or audits. Mapped users denied note access
still receive the existing ACCESS_DENIED audit for copy/export/reveal, without
decryption or a success audit; audit-log GET retains its initial 404 denial.

Gateway and worker remain disabled. This does not prove real encryption, raw/env
formats, every admin/filter/copy branch, native concurrency or runtime acceptance.
Existing cache behavior, input validation, owner/admin nuances, raw error logs
and precheck/use races remain separate. No keys or live secrets were accessed.

## Issue API session adapter

Issue list/create, issue search and stored GitHub metadata use the
[shared adapter contract](#gateway-session-core-inactive-integration). Only three
session imports changed; `authOptions`, queries, payloads, permissions and
transaction/event behavior remain unchanged.

The [focused fixture](../../tests/security/gateway-issues.test.cjs) executes all
four handlers with the actual identity selector and relation transformer,
mocked Prisma and intercepted activity/notification/realtime/webhook calls.
It checks mapped actor access, explicit-workspace and all-workspace recent
search, stored GitHub URL enrichment, default reporter, assignment approver,
activity/notification/webhook attribution, foreign denial before effects,
identity failure with no downstream reads or effects, and explicit/default
legacy forwarding. No provider call occurs in the GitHub metadata handler.

Gateway and worker remain disabled. Workspace-only membership checks without
active/project policy, unscoped nested issue payloads, explicit reporter and
assignee/parent/label inputs, counter/relation races, precheck/use gaps, raw logs
and activity/realtime failures after commit remain separate activation concerns.
The fixture does not prove native transactions, concurrent revocation, provider
or notification delivery, ranked search branches, nonempty relation policy,
every optional create input, or runtime acceptance. No runtime, database or
provider operation was performed.

## Timeline session adapter

Timeline post creation and unified feed reads use the
[shared adapter contract](#gateway-session-core-inactive-integration). Only two
session imports changed; POST still passes `authConfig`, GET `authOptions`.
POST resolves its session outside the catch block, so a mapping database failure
still rejects before effects; unified GET catches it and returns JSON 500.

The [focused fixture](../../tests/security/gateway-timeline.test.cjs) executes
both handlers with the real identity selector, workspace predicate, mention
parser and text sanitizer. Mocked Prisma and intercepted notification/follow
calls check mapped owner and active-member access, revoked/foreign denial,
post author and notification sender, `mine` filters, timeline transformation,
identity failures and exact legacy forwarding. The existing
[profile/timeline/notification fixture](../../tests/security/profile-notifications.test.cjs)
passes with the migrated routes; its 20 Node entries include one enclosing test.

Gateway and worker remain disabled. Bare issue-ID hydration, workspace-wide
stats, cursor/limit behavior, mention autofollow policy, precheck/use races and
raw logging remain separate. Fixtures do not prove all feed/parser branches,
framework handling of rejected POST promises, native concurrency, notification
delivery or runtime acceptance. Trusted ingress and mutation-Origin enforcement
remain activation requirements. No runtime, provider or database operation ran.

## View access and session subjects

Seven View API modules use one workspace-and-visibility predicate. Reads require
workspace ownership or active membership, plus view ownership, WORKSPACE
visibility or explicit SHARED recipient access. Active workspace members and
workspace owners retain edit access to WORKSPACE views; PERSONAL/SHARED edits
and deletion of any view remain view-owner-only, with workspace access required.
`/api/views/[viewId]` resolves a slug with a required `workspaceId` query parameter;
the workspace routes and favorite/follow/issue-position subroutes use view IDs.
The workspace DELETE route rejects default views; the global slug DELETE route
has no default-view guard. Five session-consuming modules use the shared adapter
and resolve the current database user by session ID rather than mutable email.

Supplied project/workspace references require current actor access; recipients
and replacement owners must actively belong to the view workspace or own it.
Accessible cross-workspace configuration remains supported. Favorite/follow and view
mutations repeat access predicates in their final selectors or checked connects.
Issue-position writes require view read access, not view edit access. Position
reads and writes independently require accessible issues in the view workspace;
single issue keys persist the resolved canonical ID.
Bulk cleanup can reference only issues validated in that batch. Existing
responses, rate-limit wrappers and WORKSPACE editing policy are retained.

The [focused fixture](../../tests/security/view-access.test.cjs) runs all 14
handlers with real session/identity and access helpers, modeled Prisma and
intercepted events. It covers stale-email identity, owner/active-member controls,
revoked/foreign denial, visibility/recipient boundaries, valid and invalid
references, issue-key resolution, malformed positions, cleanup bounds and
modeled revocation at final query evaluation. The baseline 20-case fixture
produced 17 failures and three positive controls; the expanded final fixture
passes 23 cases. A scoped typecheck checks the exact non-import bodies against
installed Prisma, Next and Zod declarations; it is not a full application build.

Gateway and worker remain disabled. Reference validation is a precheck, not an
atomic reference-revocation guarantee. Modeled transaction and connect checks
do not prove native database isolation, post-snapshot revocation or concurrency.
Existing follower-list projections, arbitrary filter configuration, rate-limit
behavior, raw error logging and event failure after commit remain separate.
Trusted ingress, mutation-Origin enforcement and integrated runtime acceptance
remain required. No database, browser, runtime or provider operation was run.

## Avatar updates and safe responses

Avatar PATCH and the `updateUserAvatar` server action bind updates to the current
session user ID. PATCH now uses the shared session adapter. Both entry points
validate supplied avatar values with one schema: nullable non-negative 32-bit
integers for numeric settings and a boolean for `useCustomAvatar`. Unknown
properties are stripped; Prisma operator objects and malformed values are
rejected. Omitted values are not written, preserving existing settings without
copying stale values from a prior read. Zero, null and false remain supported.

Both mutations select the existing public avatar fields plus created/updated
and email-verification dates. Credential fields and unrelated user properties
are excluded. PATCH retains its user envelope and ISO date serialization;
the action returns selected fields with Date values. The visible editor ignores
the mutation response and refreshes the existing current-user query. PATCH
retains 401/404 and generic 500 responses, returns 400 for invalid bodies, and
logs only a fixed error marker rather than database exception content.

The [focused fixture](../../tests/security/avatar-access.test.cjs) executes both
entry points with actual identity/session selection and schema/projection helpers,
modeled Prisma and synthetic credentials. Six baseline failures and three
positive controls become nine passing cases. Eight gateway-core cases are
freshly rerun because the action module and fixture loader changed, for 17
passing cases total. A scoped typecheck covers exact non-import route/helper
bodies and the exact avatar action function against Prisma/Next/Zod declarations.

This does not prove native database concurrency, framework serialization of
unexpected action exceptions, browser rendering, every external consumer or
runtime acceptance. Gateway and worker remain disabled; trusted ingress and
mutation-Origin requirements remain. No provider, database, browser, runtime or
deployment operation was performed.

## AI dashboard payload access

The dashboard uses the shared session adapter and repeats current workspace
owner/active-member access on payload queries. Recent views use the existing
view visibility/recipient predicate, protecting both recently-viewed results
and interaction shortcuts. Root issues, comment issue previews, team assignments,
project issue lists and counts use `issueReadAccessWhere`. Blocking relations
require both endpoints to be readable. Existing status, date and reporter/assignee
filters remain conjunctive with access; ordering, limits, classifier and response
transformations are unchanged. These are local database heuristics, not model
provider calls.

The [focused fixture](../../tests/security/ai-dashboard-access.test.cjs) runs
the actual handler, session/identity/access helpers and status classifier with
modeled Prisma. Five baseline failures and one control become six passing cases,
including private/shared views in both response paths, inconsistent issue
project/status/workspace references, nested counts, hidden blocking endpoints,
owner access without membership, gateway denial and modeled query-time revocation.
The neighboring profile/timeline/notification fixture also passes: 26 Node entries
in total include one enclosing test, representing 25 distinct applicable cases.
A scoped Prisma/Next typecheck covers five exact non-import module bodies.

This does not establish native isolation, post-snapshot revocation, every time
window or ranking branch, provider/runtime acceptance or browser rendering.
View project-ID configuration, name-based mention matching, raw error logging
and cross-query snapshot consistency remain separate. Gateway and worker remain
disabled; trusted ingress and mutation-Origin enforcement remain required.
No database, provider, browser, runtime or deployment operation was run.


## AI issue recommendations

Related-issue and suggestion handlers use the shared session adapter and the
existing current workspace owner/active-member gate. Root issues additionally
require `issueReadAccessWhere`, covering their project and optional status project.
An inaccessible root issue returns 404 before dependent queries; denied workspace
access returns 403, and a missing authenticated session returns 401.
Candidate lists and counts retain their title/label/project criteria while
requiring the requested issue workspace and current issue-read access. Both
endpoints of explicit issue links must be readable in the requested workspace.
Root/candidate labels and available workspace labels use the existing access
predicate. Ranking, limits, suggestions and response transformations are unchanged.
These handlers perform local database heuristics, not AI provider calls.

The [focused fixture](../../tests/security/ai-issue-access.test.cjs) runs both
actual handlers and session/identity/access helpers with modeled Prisma. Seven
baseline failures and two controls become nine passing cases. Coverage includes
root project/status denial before dependent queries, owner access with inactive
membership, inactive non-owner denial, denied gateway mapping without fallback, inaccessible
candidates/labels/link endpoints, and visible-link suppression of link suggestions.
A scoped Prisma/Next typecheck covers three exact non-import module bodies.

This is not native database isolation, post-lookup revocation, cross-query snapshot
consistency or runtime/browser acceptance. Issue activity remains a scalar item
and workspace lookup after root authorization. Existing heuristic limitations and
raw error logging remain separate. Gateway and worker stay disabled; trusted
ingress and mutation-Origin requirements remain. No provider, database, browser,
runtime or deployment operation was run. Generic test stage is SKIPPED; source
review, documentation, scoped lint, CI and exact-head Octopus gates remain.


## Leave actor identity and active access

The six leave API modules and shared approval service now use the shared session
adapter. All twelve route handlers, nine existing leave server actions and both
approval/rejection wrappers resolve actors by session user ID. A reassigned or
stale session email cannot select a different database user. Existing ownership,
policy projections, manager permissions, response transforms, dates and notification
calls remain intact. Membership-based access requires an active row, while workspace
owners retain access. Request cancellation now also checks current workspace access.

The public `processLeaveRequestAction` rejects a supplied actor that differs from
the authenticated subject before starting a transaction. It validates a non-empty
string request ID and the exact APPROVED/REJECTED action values, rejecting Prisma
operation objects. It checks the authenticated actor through the existing
`MANAGE_LEAVE` permission helper, preserving current system-admin and owner rules.

The [focused fixture](../../tests/security/leave-access.test.cjs) runs the actual
routes, actions, service, session/identity and permission helpers with modeled
Prisma, mocked date arithmetic and intercepted notification/event effects. Twenty-four baseline failures
and three controls become 27 passing checks. Table-driven checks cover all route
and action entry points, stale-email binding, gateway denial without fallback,
inactive membership with zero writes/effects, owner/admin controls, actor spoofing,
malformed service inputs and existing edit/cancel ownership, pending-state and date
restrictions. Gateway fixture emails match the real allowlist. A scoped strict
typecheck covers ten exact non-import module bodies against Prisma/Next/Zod/date-fns
declarations with typed session and external-service boundaries.

These checks do not prove native isolation, post-lookup revocation or concurrency.
Existing balance writes use the global Prisma client inside the request transaction;
permission reads also remain outside that transaction client. Atomic balance updates,
concurrent approval, date/accounting semantics, action input validation beyond this
service boundary, raw logging and notification/provider delivery remain separate.
Gateway and worker stay disabled; trusted ingress, integrated staging and restore
gates remain. For mutation-Origin enforcement, see
[Gateway request and realtime authorization](#gateway-request-and-realtime-authorization). Generic test stage is SKIPPED; source
review, documentation, scoped lint, CI and exact-head Octopus checks remain required.
No database, browser, provider, runtime, build or deployment operation was run.


## Workspace API identity and invitation recipients

Workspace collection and invitation API handlers now use the shared session
adapter and require a session user ID before queries or writes. The recipient
invitation list resolves that ID to the current database email; missing users or
emails return 401 before invitation queries. Its pending/expiry filters, selected
workspace/inviter fields and descending-created query order are unchanged.

Workspace listing retains owner/active-member filtering. Creation retains its
slug generation, current actor ownership and existing free-plan limit. Workspace
invitation management retains `INVITE_MEMBERS`, including current owner/system-admin
behavior, duplicate/existing-member checks and foreign-workspace invitation denial.
Email delivery behavior and payloads are unchanged.

The [focused fixture](../../tests/security/workspace-api-access.test.cjs) executes
all six handlers with actual session/identity, permission and slug helpers,
modeled Prisma and an intercepted email sender. Seven baseline failures and three
controls become ten passing checks. It covers missing IDs, mapped/denied gateway
identity without fallback, legacy controls, stale-email recipient isolation,
missing current users/emails, permission denial with zero writes/email effects,
owner/admin success, foreign invitation IDs and workspace limits. The fixture
checks the preserved ordering query, not native database ordering. A scoped
Prisma/Next typecheck covers five exact non-import module bodies.

This does not prove native concurrency, post-lookup revocation, quota/slug/invitation
uniqueness under races, email delivery or runtime acceptance. Existing creation/input
validation, role-string conventions, invitation token projections and raw logging
remain separate. Gateway and worker remain disabled. Generic test is SKIPPED;
review, documentation, scoped lint, CI, exact-head Octopus and integrated runtime
acceptance gates remain. No provider, database, browser, build or runtime operation
was performed.


## Scoped permission reads and resets

The workspace permissions endpoint now uses the shared session adapter. A request
for another user's permissions requires the caller's current
`MANAGE_WORKSPACE_PERMISSIONS` permission before target-user lookups. Self queries
retain the active-role/owner check and 404 when no workspace role exists. Existing
management responses and no-store headers remain.

Permission toggles require scalar non-empty role names, a known permission value
and a boolean enabled flag. This prevents Prisma operator objects from bypassing
the existing own-management-access check. Reset accepts only own keys from the
application's existing built-in defaults and preserves the same self-management
protection when a configured role's defaults would remove that permission.
Owner/system-admin authority remains governed by the existing permission helper.

Reset no longer imports the operational seed script, whose import executes an
all-workspace reseed. It replaces permissions only for the requested workspace
and role in one transaction, using `defaultRolePermissions` unchanged. This map
intentionally follows current application defaults: compared with the older seed
map, OWNER includes MANAGE_LEAVE and ADMIN omits EDIT_ANY_NOTE/DELETE_ANY_NOTE.
Other workspace/role rows are preserved. The operational script is unchanged and
was neither imported nor executed during this work.

The [focused fixture](../../tests/security/workspace-permissions-access.test.cjs)
runs all three handlers with real session/identity/permission/default helpers,
modeled Prisma and a seed-function spy. Nine baseline failures and two controls
become eleven passing checks: foreign-target denial before reads, self-role denial,
selected-role defaults and unaffected rows, modeled rollback after insert failure,
prototype/unknown/object role rejection, malformed permission input, self-lockout
prevention, owner/admin controls and gateway/revoked-member denial. A scoped strict
Prisma/Next typecheck covers three exact non-import module bodies, preserving the
dynamic permissions import through a typecheck path mapping.

This is not native isolation, concurrent reset/permission changes or post-lookup
revocation proof. Custom-role naming follows the
[custom-role contract](#custom-role-and-member-role-boundaries); raw logging and
original casts remain separate. Gateway/worker stay off, generic test is SKIPPED,
and review/docs/scoped lint/CI/exact-head Octopus and integrated acceptance gates
remain. No operational seed, database, provider, browser, build or runtime action
was executed.

## Custom-role and member-role boundaries

The custom-role collection/detail and member-role routes use the shared session
adapter with the existing active-member and current management-permission checks.
Custom-role names must be nonblank strings and cannot collide with built-in role
names (including case/outer-whitespace aliases) or Object prototype keys.
Permissions must be arrays of generated Prisma permission values. A legacy custom
role with a reserved name returns 409 on update/delete instead of changing shared
built-in grants; repairing stored collisions remains a separate data task.

Custom-role creation and its grants share a transaction. Renaming without a
permissions payload moves existing grants and member assignments in that same
transaction; supplying permissions replaces the selected role's grants. Foreign
workspace rows remain outside those mutations. Member assignments reject object
filters and retain the existing active target, permission and self-downgrade rules.

The [focused actual-handler tests](../../tests/security/workspace-custom-role-access.test.cjs)
model Prisma reads and rollback: 13 failures and four
controls on the base, then 17 passing cases. Five exact non-import source bodies
pass a scoped strict Prisma/Next typecheck. This is not native isolation or
concurrent revocation/rename/delete proof. Case-insensitive duplicate checks remain
pre-transaction, and member assignment still calls the existing default-permission
helper through the global Prisma client from inside its transaction. These checks
do not establish atomicity of that helper, repair historical data, change role
hierarchy, or authorize gateway activation. Generic pipeline tests remain SKIPPED;
the remaining delivery and runtime gates remain separate.

## Action-filter issue visibility

The workspace action-filter endpoint resolves the caller through the shared
session adapter and authorizes by user ID against workspace ownership or active
membership. It validates the filter array, scalar action names, supported
subcondition kinds and string values before workspace, status, activity or issue
queries. Session identity resolution precedes this validation and may read the
account mapping. Status-name lookup is scoped to the requested workspace and
current project-workspace access.

The existing activity intersection, status name/display-name matching and ID
fallback remain. Before returning IDs, the route applies the shared current issue,
project and status access predicate and requested workspace, removing missing or
unreadable issues while preserving the original intersection order. Empty or
unsupported-condition results remain empty.

Eight [actual-handler checks](../../tests/security/action-filter-access.test.cjs)
pass after five failures and three controls on the base. They use the real
session/identity and access helpers with modeled Prisma. Their query log excludes
account mapping lookups: zero logged payload queries does not mean zero identity
database reads. Two exact non-import bodies plus the actual ActionFilter interface
pass a scoped strict Prisma/Next typecheck. No native concurrency or post-query revocation proof
is claimed. Generic tests remain SKIPPED, other delivery gates remain required,
and gateway/worker activation and runtime/provider/browser/DB operations are not
part of this slice.

## Issue-relation endpoint visibility

The three issue-relation routes use the shared session adapter and require a
stable user ID. Workspace resolution requires ownership or active membership;
DELETE now follows that same owner-or-active-member policy. The existing issue
finder still authorizes the source issue. Both source and target endpoints are
independently filtered by current issue/project/status access for relation reads,
and nested child counts use the same predicate. Child progress is computed from
the filtered relation children.

Single creation writes the resolved target database ID even when given an issue
key, including reversed CHILD-to-PARENT relations. Bulk target-ID lookup applies
the same readable-issue predicate as key lookup, with active target membership.
Both mutation inputs reject object-valued IDs/types, and bulk types must match the
generated relation enum. DELETE requires both endpoints to remain readable in its
lookup and deletion predicates. Readable cross-workspace links, existing relation
normalization and response grouping remain supported.

Thirteen actual-handler checks pass after eleven failures and two controls on the
corrected base fixture; four exact non-import bodies pass scoped strict Prisma/Next
checking. The initial fixture omitted its returned environment handle; those four
fixture failures are historical, not vulnerability reproductions. The corrected
baseline used nine retained source/helper files captured before production edits.
The bulk handler captures the guarded user ID before callbacks, addressing the
strict typecheck's optional-session errors without weakening types.

Prisma is modeled, including Promise.all for the bulk transaction; this does not
prove rollback, native atomicity, concurrent endpoint edits or post-snapshot
revocation safety. Existing duplicate/alias cardinality behavior, generic error
mapping, relation-cycle policy and transaction isolation are separate. Generic
tests remain SKIPPED; other delivery gates and gateway/worker activation remain
separate. No native DB/provider/browser/runtime operations were performed.


### Project collection, settings and Gantt routes

The three workspace project routes (five handlers) use the shared session adapter and a stable user ID. Workspace and project reads require current ownership or active membership; project creation binds the default view owner to that ID rather than the session email. List/detail/update counts and Gantt issues, dates, progress and health use the same `issueReadAccessWhere` subset. The detail repository projection retains metadata but excludes `webhookSecret` and `accessToken`; the hook no longer promises a webhook secret.

Settings saves update existing status IDs in place, preserving internal names and default/final flags and therefore existing issue links. New client IDs are only creation hints. Omitted used/default statuses conflict before writes; the dedicated move/delete flow remains separate. Scalar/array validation and duplicate ID/internal-name rejection precede mutation. This preserves the existing owner/active-member mutation policy, without adding an administrator requirement.

Focused actual-handler tests use modeled Prisma: corrected baseline 19 assertion failures and two controls, followed by 21 passes. Five exact non-import source bodies passed scoped strict checking against the retained generated Prisma/Next types. The initial gateway fixture used an email outside the existing allowlist; those initial 16-failure/one-control and 12-pass/five-failure receipts remain historical. No database isolation, rollback or concurrent new status-link/revocation proof is claimed. Default view creation remains outside the project/status transaction; prefix/slug races remain separate work. For the settings-page webhook projection, see [GitHub settings page access and webhook display](#github-settings-page-access-and-webhook-display). For status count/delete routes, see [Project status count and deletion](#project-status-count-and-deletion). Generic pipeline tests are explicitly SKIPPED, not PASS; review, docs, scoped lint, CI and full exact-head Octopus gates remain. Gateway and worker remain OFF.

### Project status count and deletion

The status count and delete routes use the shared stable-ID session and current owner/active-member workspace, project and status predicates. Counts include only issues readable in the requested workspace/project. Delete validates a scalar target, preserves default-status protection and rereads source/target at transaction entry. A used status requires an explicit valid target. The guard compares **all** issues attached by `statusId` against the fixed workspace/project readable set; hidden or malformed cross-project links cause 409 before mutation. Only the eligible set moves, the response uses `updateMany.count`, and conditional deletion requires a still-accessible nondefault status with no attached issues.

Focused actual-handler modeled evidence: 12 assertion failures plus two controls before, 14 passes after; three exact non-import bodies pass strict generated-Prisma/Next checking. The count test's title was narrowed to its actual workspace-denial assertion without changing its body or rerunning. Transaction-entry revocation/default/source-move cases and a global cross-project attached-row case are covered. The mock callback does not prove rollback, isolation, concurrent FK changes, target movement after the snapshot or native database behavior; error behavior for a failed conditional mutation remains the existing 500 fallback. No broader admin policy, schema migration, framework, runtime or provider operation is introduced. Generic tests remain SKIPPED, not PASS; other delivery gates remain and gateway/worker stay OFF.


### Qdrant maintenance auth boundary

The optional workspace Qdrant bulk-migration GET/POST routes use the shared session adapter, but are available only in legacy `nextauth` mode (including the existing unset-mode default). Both gateway and invalid modes return 403 before inspecting the internal key, resolving a session, querying application data or calling the provider. An internal key cannot bypass this denial. Existing legacy owner/admin/member checks and internal-key compatibility are retained unchanged.

This deliberately does not authorize private-note export in gateway mode. The legacy bulk selector, plaintext note payloads, global collection metadata and AI-context eligibility policy need a separate data-access decision before enabling this endpoint there. Disabling optional bulk maintenance does not substitute for required Forge issues, Notes memory, Slack or Ready integration and does not itself block an otherwise qualified gateway activation.

The actual route, adapter and auth-mode helper are exercised with modeled database/provider boundaries: four failing cases and seven controls before, 11 passes afterward, including zero session/header/database/provider calls on denied modes. An exact inverse of the import and two guards reproduces the captured original route bytes; legacy bulk payload logic is unchanged. No live provider, database, embedding, runtime or gateway activation is proved or performed. Generic tests remain SKIPPED, not PASS; remaining delivery and activation gates remain.


### GitHub settings page access and webhook display

The project GitHub settings page requires a stable session user ID and current owner/active-member access in both workspace and project queries. Its client repository DTO sends `webhookConfigured: boolean`, never the raw webhook secret. GitHubSettingsClient forwards that boolean to WebhookStatus, preserving configured, unconfigured and disconnected displays. Existing metadata, branches, counts and status transformations remain. The separate older GitHubRepositorySettings component has no caller in the bounded literal inventory and is unchanged; this is not a whole-program reachability proof.

Focused actual-page and component execution with modeled Prisma/JSX records ten baseline failures (seven assertions and three unexpected authorization redirects) plus one control, followed by 11 passes. Two exact non-import bodies (page/finder) and five exact client interfaces passed scoped strict generated-Prisma/React checking; this is not a full client typecheck or browser/hydration acceptance. Effects and provider actions were not executed. Current identity, active access, public metadata, secret-free serialized props, boolean forwarding and display cases are covered. Generic tests remain SKIPPED, not PASS; all other source delivery and runtime/admission gates remain, with gateway and worker OFF.

### Gateway client session and logout

The auth catchall reports the configured mode and serves gateway sessions through the existing strict issuer/subject/account mapping, with uncached 401 for absent or revoked mappings. Gateway and invalid modes do not dispatch legacy auth POSTs. In those modes, direct local registration returns 403 before parsing, password hashing or database access; legacy registration remains available and the register page still redirects to login. Unmapped gateway login and MCP sign-in show an unavailable message without invoking legacy sign-in. Legacy auth handlers and successful login routing remain unchanged.

Both logout consumers use a mode-aware helper. Gateway mode navigates to the same-origin local gateway logout endpoint without claiming logout succeeded. Legacy mode verifies the sign-out result and an empty session response before its existing success navigation; malformed responses, surviving sessions and fetch failures show an error. The provider defaults to 60-second polling with its existing focus/offline behavior and explicit overrides. This is not a maximum revocation interval or IdP logout proof.

Focused actual route, adapter, component and helper execution uses modeled dependencies: 15 baseline failures (14 assertions and one missing session-user error from legacy response) plus seven controls, followed by 22 passes. Three exact non-import bodies passed scoped strict checking against retained NextAuth/Next/React types. Hooks/effects, browser hydration, provider logout and native database behavior were not executed. For the request proxy origin/identity gate and realtime coverage, see [Gateway request and realtime authorization](#gateway-request-and-realtime-authorization). Gateway and worker remain OFF. Generic tests are explicitly SKIPPED, not PASS; review, docs, scoped lint, CI and full exact-head Octopus gates remain.

### Gateway request and realtime authorization

The request proxy now applies the existing strict gateway identity, exact HTTPS unsafe-request Origin and current account-mapping checks before forwarding matched requests. Invalid configuration fails closed. Only exact GET `/api/health` and `/api/auth/mode` bypass gateway identity and mapping; the mode endpoint remains reachable after mapping revocation so local gateway logout can still be requested. The health exemption does not establish a health handler or service-health proof. Realtime paths now enter the matcher. Existing CSP and security-header construction remains unchanged, and forwarded gateway responses are private/no-store. Legacy mode preserves forwarding. Trusted-header stripping and a private origin remain deployment requirements.

Workspace SSE requires owner/active membership at admission and binds the request context for a fresh subject/workspace check before each message. Per-stream authorization and delivery follow Redis callback arrival order, so a slower authorization lookup cannot let a later event overtake an earlier one. Closure suppresses pending delivery and skips authorization for queued messages; the [stream regression fixture](../../tests/security/realtime-stream-access.test.cjs) covers overlapping callbacks with a delayed first view lookup and cancellation. Issue-bearing events require every referenced issue to satisfy the current read policy and retain accessible project/status references. View-bearing events also require the current view read policy in the stream workspace, including private/shared visibility. Invalid JSON closes the stream; malformed payloads and inaccessible references are not forwarded. Subscribers acquired or subscribed after cancellation are released. The separate view-stream endpoint remains disabled (410).

Focused evidence executes actual proxy/session/logout code with Next request/response and matcher utilities, and actual stream/access helpers with Node AsyncLocalStorage/ReadableStream and modeled Prisma/Redis. The original corrected fixture recorded 19 baseline assertion failures plus one control, then 20 passes, before the ordering and queued-cancellation regressions were added. An initial view-query mock incorrectly passed an undefined OR into its predicate evaluator; its 17-pass/three-failure candidate receipt remains historical, with the exact correction and reconstructed initial fixture disclosed. Five exact non-import bodies pass scoped strict Prisma/Next/Redis checking. Current four producer payload shapes are represented as inputs; producers themselves are not re-executed by this fixture. No native Redis/database isolation, browser, IdP, post-lookup race, proxy deployment or installed-stream revocation guarantee is claimed. Gateway and worker remain OFF. Generic pipeline tests are SKIPPED, not PASS; review, docs, scoped lint, CI and full exact-head Octopus remain required.
### Notes tag access and issue previews

Tag lists retain their author/requested-workspace selection, intersected with current owner/active-member workspace access or the caller's own personal tags. Counts include only currently readable notes. Tag creation checks the destination and uses a scoped workspace connection. Historical unauthorized tag links are filtered from Notes collections, detail/pin responses, universal search, project summaries and Coclaw memory; tag-based note search uses the same predicate.

Note creation and editing validate tag IDs before encryption or version writes. Attachments accept the caller's personal tags or tags in the note's effective destination: direct workspace first, otherwise the final project's workspace. Scoped connect/set selectors retain that boundary at the write. Empty selections, personal tags, project-only notes and legitimate project changes remain supported. Issue link previews now use the shared issue/project/status read predicate while retaining workspace slug/ID matching, metadata shapes and external previews without fetching.

Focused actual-handler execution uses modeled Prisma: the final fixture records 20 baseline assertion failures and one control, followed by 24 passes including three existing Notes regressions. Earlier fixture failures (POST 201 expectation, missing project lookup mock and invalid project-only scope) remain historical. Five exact non-import bodies pass scoped strict Prisma/Next checking with the actual session augmentation; this is not full-application typing. Native transaction isolation, post-lookup project/membership changes and atomic versioning remain unproved. Gateway/worker remain OFF. Generic pipeline tests are SKIPPED; source review, documentation, scoped lint, CI and exact-head Octopus remain required.
