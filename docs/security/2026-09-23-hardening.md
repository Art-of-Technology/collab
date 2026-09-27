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
`User not found` when their current-user lookup finds no user; profile input
validation still precedes that lookup. `getUserProfile` retains `self_profile`
for the viewer's own profile.

The actions deliberately keep direct lookups: unlike the session helper, they
preserve Date-valued fields and propagate lookup errors. Their selected fields,
profile validation and avatar defaults are unchanged; credential omission is
owned by the [shared Prisma client contract](#shared-clients-and-build-repairs).
See the [user-action subject regressions](../../tests/security/user-action-subject.test.cjs)
and the [profile visibility contract](#post-and-coclaw-disclosure-follow-up).

The nine formerly email-bound authenticated actions in `src/actions/workspace.ts`
resolve the actor by session subject ID. The member-add target still resolves
by the supplied email; owner, active workspace-admin and self-removal rules,
validation and return shapes are preserved. Workspace REST GET/PATCH/DELETE
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

Post REST handlers and server actions share the predicates in
`src/lib/post-access.ts`. Reads, counts, comments, reactions, follows and mutations
require current workspace ownership or active membership; authorship alone does
not retain access after membership is revoked. Workspace filters only narrow
access. Posts without a workspace are excluded. Profile post lists and post,
comment and reaction totals are scoped to the viewer's access, not the author's.
The unified timeline and AI dashboard check workspace access before content
queries; timeline creation checks the exact destination before writes or
notifications. Existing operation-specific author and permission checks remain.

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
[app and developer page session consumers](#app-and-developer-page-session-consumers) and
[app ecosystem API session consumers](#app-ecosystem-api-session-consumers).
No proxy, auth route, or deployment mode changes here. Gateway mode must remain
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
Mapping database errors propagate without legacy fallback. Unsafe requests require
the exact configured HTTPS Origin when the later edge integration invokes the
mutation guard; the helper alone does not enforce origin or trusted headers.

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
Gateway mode remains disabled pending the remaining API imports, the leave-service library,
aliases/wrappers, edge/session/logout integration and final acceptance.

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
OAuth membership gaps remain activation blockers: both authorization routes omit
active membership status and exclude an owner without a membership; the regular
authorization fallback has the same status gap.
The next bounded OAuth fixes must reuse the existing owner/active-member
workspace predicate with independently scoped code issuance. These findings do
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
rotation responses remain separate. Public app-detail visibility, OAuth active
membership, publisher-based deletion and other app lifecycle routes still need
their separately scoped access review/fixes before gateway activation.

The [ownership regression suite](../../tests/security/app-credential-ownership.test.cjs)
executes actual handlers, the live-user helper, owner predicate, page and client
component with modeled dependencies; the [gateway adapter cases](../../tests/security/gateway-app-api.test.cjs)
cover session integration. Competing claims, ownership changes, decryption rollback
and deferred reveal/rotation ordering are modeled regression evidence, not real
database concurrency/isolation or browser/runtime acceptance.
