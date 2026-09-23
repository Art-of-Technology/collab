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
