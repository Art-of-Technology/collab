# Notification Settings and Slack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each person chooses, per workspace, which issue events they want to hear about, and Collab posts one line per event to that person's own Slack incoming webhook, also for changes made by agent seats.

**Architecture:** One new table holds a person's choices and encrypted Slack address per workspace. Three libraries in the notifications context do the work: `notification-slack.ts` (validate, post, retry, cap), `notification-settings.ts` (the store behind the settings API) and `notification-issue-events.ts` (an event → the people it concerns → their choices → one message each). Every code path that changes a status, assigns an issue, adds a comment, likes or acks a comment calls `tellIssueEvent(...)` after its write is committed; the call returns at once and never throws. The in-app bell is not touched.

**Tech Stack:** Next.js App Router, Prisma (PostgreSQL), React with the components in `src/components/ui`, `node --test` with the repository's loader in `tests/security/helpers.cjs`.

**Spec:** `docs/design/notification-settings/README.md` (with the four approved screens beside it)

## Global Constraints

- The in-app bell, browser push and every existing `Notification` row stay exactly as they are. No task changes who gets an in-app notification, except Task 9, which only changes which preferences record is read.
- No answer of an existing API call gains, loses or renames a field, and none gains a new way to fail. `tellIssueEvent` is never awaited by a caller and never throws.
- The Slack address is a secret: it is stored only encrypted (`encrypt` from `@/lib/apps/crypto`), is never returned by any API call, and never appears in a log line or an error message. Only its masked form leaves the server.
- An address is accepted only if `isSlackWebhookUrl` (Task 2) says so. The same check runs again before every send.
- Only people are told: `PERSON` from `src/lib/agent-stop-boundary.ts` (`email` not null and no `agentSeat`). Never the actor. Only for an issue the person can read: `issueReadAccessWhere(userId)` from `src/lib/issue-finder.ts`.
- Every default is off: a person without a settings row, or with `slackOn = false`, is sent nothing.
- User-visible copy and Slack message texts are exactly the strings given in Tasks 2, 4 and 8.
- Model name `IssueNotificationSetting`; Prisma client name `issueNotificationSetting`. Field names are those of Task 1 everywhere.
- Tests are written first and seen failing for the expected reason. Fake-based tests use `load` from `tests/security/helpers.cjs`. Database-backed tests live in `tests/agents/` (they run in the "Agent handoffs" workflow) and are run locally with:
  `podman run --rm --userns=keep-id -e HOME=/tmp -v "$PWD":/repo:z -w /repo localhost/collab-pgtest:1 node --test --test-concurrency=1 <files>`
  That container has PostgreSQL 18 and no `git`; three `check-changed` tests and `workspace-dashboard-data` test 8 fail in it for that reason and pass elsewhere.
- Before each commit: `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit -p .` and `npx eslint` on the files changed. Before the last commit of a task that adds a test file: `npm test` shows no new failure outside `tests/known-failures.txt` other than the `pg_config ENOENT` ones of this machine.
- A new test file is added to the Tests cell of its context's row in `CONTEXT-MAP.md` when that row lists files by name.
- Commit after each task, as `Erdem Şekerci <herdemsekerci@gmail.com>`, message a plain sentence in the style of `git log --oneline -8`, ending with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. The Slack address leaks: in an API answer, a thrown error, a `console` line, or the masked form showing too much. Tests in Tasks 2 and 3.
2. Notifying breaks or hangs (database error, Slack not answering for 30 seconds) while a seat finishes a run or a person saves an issue: the caller's answer is unchanged and on time. Tests in Tasks 4, 5 and 7.
3. A person who has a settings row but has lost access to the project or workspace, or whose account is a seat: nothing is sent. Tests in Task 4.
4. A flood: 40 events for one person in a minute give 30 messages and one line; a "gone" answer stops the retries and switches Slack off once. Tests in Tasks 2 and 4.
5. An address that is not Slack's (`https://hooks.slack.com.evil.example/…`, `http://`, a port, a query string, a redirect answer from Slack's host): refused at save and never followed. Tests in Task 2.

---

### Task 1: The settings table

**Files:**
- Modify: `prisma/schema.prisma` (new model; back-relations on `User` and `Workspace`)
- Create: `prisma/migrations/20261127000100_issue_notification_settings/migration.sql`
- Modify: `prisma/bootstrap-contract.json`, `tests/security/bootstrap-recipe.test.cjs` (`expectedMigrations`), `CONTEXT-MAP.md` (the migration and model counts in prose)
- Test: `tests/security/issue-notification-setting-schema.test.cjs`

**Interfaces:**
- Produces:

```prisma
model IssueNotificationSetting {
  id            String    @id @default(cuid())
  userId        String
  workspaceId   String
  slackUrlEnc   Bytes?
  slackOn       Boolean   @default(false)
  slackEverOn   Boolean   @default(false)
  slackOffAt    DateTime? // set when Collab switched Slack off because Slack no longer knows the address
  slackFailedAt DateTime? // the last message that could not be delivered
  mineAssigned  Boolean   @default(false)
  mineReported  Boolean   @default(false)
  mineFollowed  Boolean   @default(false)
  onStatus      Boolean   @default(false)
  onAssigned    Boolean   @default(false)
  onReactions   Boolean   @default(false)
  comments      String    @default("off") // off | mentions | all
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  user          User      @relation("IssueNotificationSettings", fields: [userId], references: [id], onDelete: Cascade)
  workspace     Workspace @relation("IssueNotificationSettings", fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
  @@index([workspaceId])
}
```

- [ ] **Step 1: Write the failing test** `tests/security/issue-notification-setting-schema.test.cjs`, reading the files as text:
  - "every choice is off by default": the model block has `@default(false)` on `slackOn`, `slackEverOn`, `mineAssigned`, `mineReported`, `mineFollowed`, `onStatus`, `onAssigned`, `onReactions`, and `@default("off")` on `comments`.
  - "one row per person per workspace": the block has `@@unique([userId, workspaceId])` and both relations with `onDelete: Cascade`.
  - "the migration only adds": `migration.sql` contains `CREATE TABLE "IssueNotificationSetting"`, and every other statement is `CREATE INDEX`, `CREATE UNIQUE INDEX` or `ALTER TABLE "IssueNotificationSetting" ADD CONSTRAINT`; it has no `DROP` and names no other table except in `REFERENCES "User"` and `REFERENCES "Workspace"`.
- [ ] **Step 2: Run it**: `node --test tests/security/issue-notification-setting-schema.test.cjs`. Expected: FAIL, the model is not in the schema.
- [ ] **Step 3: Add the model and the back-relations** (`issueNotificationSettings IssueNotificationSetting[] @relation("IssueNotificationSettings")` on `User` and on `Workspace`), then `npx prisma format` and `npx prisma generate`.
- [ ] **Step 4: Write the migration** from the difference between the old and new schema: `git show HEAD:prisma/schema.prisma > /tmp/old.prisma && npx prisma migrate diff --from-schema-datamodel /tmp/old.prisma --to-schema-datamodel prisma/schema.prisma --script`. Keep only what the test allows.
- [ ] **Step 5: Update the bootstrap contract**: the new `schemaSha256`, and one `{ name, sha256 }` entry for the migration, in `prisma/bootstrap-contract.json`; append the migration name to `expectedMigrations` in `tests/security/bootstrap-recipe.test.cjs`. Read `scripts/bootstrap-empty-database.mjs` and `docs/database-bootstrap.md` first and follow what they say about requalifying.
- [ ] **Step 6: Run** the new test and, in the container, `tests/security/bootstrap-recipe.test.cjs tests/security/bootstrap-empty-database.test.cjs tests/agents/seats-schema.test.cjs`. Expected: PASS.
- [ ] **Step 7: Commit.**

---

### Task 2: The Slack sender

**Files:**
- Create: `src/lib/notification-slack.ts`
- Test: `tests/security/notification-slack.test.cjs`

**Interfaces:**
- Consumes: the global `fetch`, `AbortController`, `setTimeout`.
- Produces:

```ts
export const SLACK_RETRY_DELAYS_MS = [0, 5_000, 30_000] as const;
export const SLACK_TIMEOUT_MS = 5_000;
export const SLACK_CAP_PER_MINUTE = 30;
export const SLACK_TEST_TEXT = 'This is a test from Collab. Your notifications will arrive in this channel.';
export type SlackResult = 'ok' | 'gone' | 'failed';
export function isSlackWebhookUrl(value: unknown): value is string;
export function maskSlackWebhookUrl(url: string): string;
export function slackEscape(text: string): string;                 // & < > become &amp; &lt; &gt;
export function postToSlack(url: string, text: string): Promise<SlackResult>;  // one try; never throws
export function sendToSlack(url: string, text: string, sleep?: (ms: number) => Promise<void>): Promise<SlackResult>;
export type CapClock = { now(): number; later(run: () => void, ms: number): void };
export function sendCapped(key: string, url: string, text: string, clock?: CapClock, sleep?: (ms: number) => Promise<void>): Promise<SlackResult | 'capped'>;
export function forgetSlackCaps(): void;                           // for tests
```

Rules the signatures do not fix:
- `isSlackWebhookUrl`: a string of at most 512 characters that `new URL` parses with `protocol === 'https:'`, `hostname === 'hooks.slack.com'`, empty `port`, `username`, `password`, `search` and `hash`, and `pathname` matching `/^\/services\/[A-Za-z0-9_\/-]+$/`.
- `maskSlackWebhookUrl`: `https://hooks.slack.com/services/` then, for each path part after `services` except the last, its first 3 characters and `•••`, and for the last part `••••••` and its last 4 characters, joined by `/`. Example: `…/services/T024ABCDE/B07ABCDEF/x9y8z7w6v5u4h3Qz` gives `https://hooks.slack.com/services/T02•••/B07•••/••••••h3Qz`.
- `postToSlack`: answers `failed` without calling `fetch` when the URL does not pass `isSlackWebhookUrl`. Otherwise `fetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal })` with an abort after `SLACK_TIMEOUT_MS`. Status 200 is `ok`; 404 and 410 are `gone`; every other status, a thrown error and an abort are `failed`. It logs nothing that contains the URL.
- `sendToSlack`: one `postToSlack` per entry of `SLACK_RETRY_DELAYS_MS`, sleeping that long before each; it stops at the first `ok` or `gone`. The default `sleep` uses a timer that is `unref`ed.
- `sendCapped`: per `key`, a window of 60 000 ms that starts with the first message. The first `SLACK_CAP_PER_MINUTE` messages of a window go to `sendToSlack`. Each later one resolves `capped` and is counted; when the window ends, one message is sent with `sendToSlack`: `1 more notification was not sent in the last minute` or `{n} more notifications were not sent in the last minute`. The default clock uses `Date.now` and an `unref`ed timer.

- [ ] **Step 1: Write the failing tests** (the `fetch` fake is handed through `load(file, deps, globals)`):
  - "only Slack's own webhook host is accepted": true for `https://hooks.slack.com/services/T0/B0/abc`; false for `http://hooks.slack.com/services/T0/B0/abc`, `https://hooks.slack.com.evil.example/services/T0/B0/abc`, `https://hooks.slack.com:8443/services/T0/B0/abc`, `https://user@hooks.slack.com/services/T0/B0/abc`, `https://hooks.slack.com/services/T0/B0/abc?x=1`, `https://hooks.slack.com/services/T0/B0/abc#x`, `https://hooks.slack.com/other/T0`, `https://example.com/services/T0/B0/abc`, a 600-character URL, `null`, `42`.
  - "the mask shows three characters of each part and the last four": the example above, exactly.
  - "escape": `slackEscape('a < b & c > d')` is `'a &lt; b &amp; c &gt; d'`.
  - "one try maps the answer": 200 → `ok`; 404 → `gone`; 410 → `gone`; 500 → `failed`; 302 → `failed` (and `fetch` was called with `redirect: 'manual'`); a throwing `fetch` → `failed`; a bad URL → `failed` with `fetch` not called.
  - "the body is the text as JSON": `JSON.parse(call.body)` deep-equals `{ text: 'hello' }`.
  - "three tries, then failed": with an always-500 fake and a recording `sleep`, `sendToSlack` resolves `failed`, `fetch` was called 3 times, the sleeps were `[0, 5000, 30000]`.
  - "gone stops at once": 404 on the first try → `gone`, 1 call.
  - "the second try can succeed": 500 then 200 → `ok`, 2 calls.
  - "30 a minute, then one line": 40 `sendCapped` calls with a fake clock → 30 `ok`, 10 `capped`; running the clock's pending callback sends exactly one more message whose text is `10 more notifications were not sent in the last minute`; with 31 calls the line is `1 more notification was not sent in the last minute`; a call after the window starts a new window.
  - "caps are per key": 30 calls for key `a` do not cap key `b`.
  - "nothing logs the address": a `console` fake records every call during the failing cases; no recorded argument contains `hooks.slack.com`.
- [ ] **Step 2: Run** `node --test tests/security/notification-slack.test.cjs`. Expected: FAIL, the file does not exist.
- [ ] **Step 3: Implement** `src/lib/notification-slack.ts` to the signatures and rules above.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 3: The settings store and its API

**Files:**
- Create: `src/lib/notification-settings.ts`
- Create: `src/app/api/user/notification-preferences/issues/route.ts` (GET, PATCH)
- Create: `src/app/api/user/notification-preferences/issues/slack/route.ts` (PUT, DELETE, POST)
- Test: `tests/security/notification-settings.test.cjs`, `tests/security/notification-settings-routes.test.cjs`

**Interfaces:**
- Consumes: Task 1's model; from Task 2 `isSlackWebhookUrl`, `maskSlackWebhookUrl`, `postToSlack`, `SLACK_TEST_TEXT`, `SlackResult`; `encrypt`, `decrypt` from `@/lib/apps/crypto` (`encrypt(data: string): Promise<Buffer>`, `decrypt(data: Buffer): Promise<string>`; read a stored value as `decrypt(Buffer.from(row.slackUrlEnc))`); `getCurrentUser` from `@/lib/session`; `issueAccessWhere` from `@/lib/issue-finder`.
- Produces:

```ts
export type CommentsChoice = 'off' | 'mentions' | 'all';
export type IssueNotificationChoices = { mineAssigned: boolean; mineReported: boolean; mineFollowed: boolean;
  onStatus: boolean; onAssigned: boolean; onReactions: boolean; comments: CommentsChoice };
export type IssueNotificationView = IssueNotificationChoices & {
  slack: { address: string | null; on: boolean; offAt: string | null; failedAt: string | null } }; // address is the masked form
export const NO_CHOICES: IssueNotificationChoices;    // all false, comments 'off'
export const STARTING_SET: IssueNotificationChoices;  // all true, comments 'mentions'
export function readSettings(userId: string, workspaceId: string): Promise<IssueNotificationView>;          // no row: NO_CHOICES, slack all null/false; writes nothing
export function updateChoices(userId: string, workspaceId: string, patch: unknown): Promise<IssueNotificationView | { error: 'invalid' }>;
export function saveSlackAddress(userId: string, workspaceId: string, url: unknown): Promise<IssueNotificationView | { error: 'not_slack' | 'not_configured' }>;
export function setSlackOn(userId: string, workspaceId: string, on: boolean): Promise<IssueNotificationView | { error: 'no_address' }>;
export function removeSlackAddress(userId: string, workspaceId: string): Promise<IssueNotificationView>;
export function sendSlackTest(userId: string, workspaceId: string): Promise<{ result: SlackResult | 'no_address'; settings: IssueNotificationView }>;
export function markSlackResult(userId: string, workspaceId: string, result: SlackResult): Promise<void>;   // never throws
```

Rules the signatures do not fix:
- `updateChoices` accepts only the seven keys of `IssueNotificationChoices`; a boolean key must be a boolean and `comments` one of the three words; an unknown key, a wrong type or a non-object gives `{ error: 'invalid' }` and writes nothing. It creates the row when there is none (upsert on `userId_workspaceId`).
- `saveSlackAddress`: not `isSlackWebhookUrl` → `not_slack`; `encrypt` throwing → `not_configured`. It stores the encrypted address, clears `slackOffAt` and `slackFailedAt`, and leaves `slackOn` as it is.
- `setSlackOn(…, true)` without a stored address → `no_address`. The first time it is switched on (`slackEverOn` false) it also writes `STARTING_SET` and `slackEverOn: true`. Switching on clears `slackOffAt` and `slackFailedAt`. Switching off changes only `slackOn`.
- `removeSlackAddress`: `slackUrlEnc: null`, `slackOn: false`, both dates null; the choices and `slackEverOn` stay.
- `sendSlackTest`: no address → `no_address`. Otherwise one `postToSlack(url, SLACK_TEST_TEXT)`, then `markSlackResult` with the result; `ok` also clears `slackFailedAt`.
- `markSlackResult`: `gone` → `slackOn: false`, `slackOffAt: now`; `failed` → `slackFailedAt: now`; `ok` → no write.
- Routes: no signed-in user → 401. No `currentWorkspaceId` cookie → 400 `{ error: 'Workspace not set' }`. The user is neither the owner nor an active member of that workspace (`prisma.workspace.findFirst({ where: { id, ...issueAccessWhere(user.id).workspace }, select: { id: true } })` finds nothing) → 403. `GET` → 200 with the view. `PATCH` body: any of the seven choice keys and, optionally, `slackOn: boolean`; `invalid` → 400, `no_address` → 409. `PUT` body `{ url }`: `not_slack` → 400 with `message: 'Only a Slack webhook address is accepted. It starts with https://hooks.slack.com/services/'`; `not_configured` → 503. `DELETE` → 200 with the view. `POST` → 200 `{ result, settings }`.

- [ ] **Step 1: Write the failing tests.** Library, with a small in-memory `issueNotificationSetting` fake (`findUnique`, `upsert`, `update`) and fakes for `@/lib/apps/crypto` and `@/lib/notification-slack`'s `postToSlack`:
  - "a person without a row has everything off, and reading writes nothing".
  - "choices are saved one key at a time; an unknown key, a wrong type and a wrong word are refused and change nothing".
  - "saving an address does not switch Slack on, and the view shows only the mask".
  - "an address that is not Slack's is refused": `https://example.com/x` → `not_slack`, nothing stored, `encrypt` not called.
  - "a server without an encryption key says so": `encrypt` throwing → `not_configured`.
  - "the first switch-on ticks the starting set; the second keeps my ticks".
  - "Slack cannot be switched on without an address" → `no_address`.
  - "removing the address switches Slack off and keeps the ticks".
  - "a test message: ok clears the failure date; gone switches Slack off with a date; failed sets the failure date; none without an address".
  - "markSlackResult never throws": with a fake whose `update` throws.
  - Routes: "401, 400 and 403 before anything is read"; "GET, PATCH, PUT, DELETE and POST answer as the rules say"; "no answer contains the address": the JSON text of every answer in the file is searched for the secret tail of the test address and for `slackUrlEnc`.
- [ ] **Step 2: Run** both test files. Expected: FAIL, the modules do not exist.
- [ ] **Step 3: Implement** the library, then the two route files.
- [ ] **Step 4: Run** both test files. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 4: From an event to the messages

**Files:**
- Create: `src/lib/notification-issue-events.ts`
- Modify: `tests/security/helpers.cjs` (beside the `@/lib/agent-stop-email` stub: `@/lib/notification-issue-events` resolves to `{ tellIssueEvent() {}, issueEventsSettled: async () => {} }` unless the test hands its own)
- Test: `tests/security/notification-issue-events.test.cjs`

**Interfaces:**
- Consumes: `prisma`; `PERSON` from `@/lib/agent-stop-boundary`; `issueReadAccessWhere` from `@/lib/issue-finder`; `extractMentionUserIds` from `@/utils/mentions`; `decrypt` from `@/lib/apps/crypto`; `sendCapped`, `slackEscape` from `@/lib/notification-slack`; `markSlackResult` from `@/lib/notification-settings`.
- Produces:

```ts
export type IssueEvent =
  | { kind: 'status'; issueId: string; actorId: string; fromStatusId: string | null; toStatusId: string | null }
  | { kind: 'assigned'; issueId: string; actorId: string; assigneeId: string }
  | { kind: 'comment'; issueId: string; actorId: string; commentId: string; text: string }   // text: the comment's html, or its content
  | { kind: 'described'; issueId: string; actorId: string; mentionedIds: string[] }
  | { kind: 'like'; issueId: string; actorId: string; commentAuthorId: string }
  | { kind: 'ack'; issueId: string; actorId: string; commentAuthorIds: string[] };            // one entry per acked comment
export type IssueFacts = { key: string; title: string; url: string | null; assigneeId: string | null; reporterId: string | null;
  followerIds: string[]; actorName: string; fromStatus: string | null; toStatus: string | null };
export type SettingRow = { userId: string; mineAssigned: boolean; mineReported: boolean; mineFollowed: boolean;
  onStatus: boolean; onAssigned: boolean; onReactions: boolean; comments: string };
export function excerpt(text: string): string;
export function messagesFor(event: IssueEvent, facts: IssueFacts, settings: SettingRow[]): { userId: string; text: string }[];
export function tellIssueEvent(event: IssueEvent): void;       // starts the work and returns; never throws
export function issueEventsSettled(): Promise<void>;           // resolves when every started delivery has ended; for tests
```

Rules the signatures do not fix:
- `excerpt`: mention spans and the `@[name](id)` form become `@name`; every other tag is removed; HTML entities `&amp; &lt; &gt; &quot; &#39; &nbsp;` are decoded; runs of white space become one space; trimmed; longer than 200 characters → the first 200 and `…`.
- `messagesFor` is pure. With `link` = `<{url}|{key}>` when `url` is set and `{key}` otherwise, `T` = `slackEscape(title)`, `A` = `slackEscape(actorName)` with every `*` removed (an empty name is `Someone`):

  | Event | Who is considered | Sent when | Text |
  | --- | --- | --- | --- |
  | `status` | assignee, reporter, followers | `onStatus` and the box of a role the person has (`mineAssigned` for the assignee, `mineReported` for the reporter, `mineFollowed` for a follower) | `*A* moved link “T” from {fromStatus} to {toStatus}`; without `fromStatus`: `*A* moved link “T” to {toStatus}` |
  | `assigned` | `assigneeId` | `onAssigned` | `*A* assigned link “T” to you` |
  | `comment` | the ids `extractMentionUserIds(text)` gives | `comments` is `mentions` or `all` | `*A* mentioned you on link “T”: {slackEscape(excerpt(text))}` |
  | `comment` | assignee, reporter, followers not already taken as mentioned | `comments` is `all` and the box of a role the person has | `*A* commented on link “T”: {slackEscape(excerpt(text))}` |
  | `described` | `mentionedIds` | `comments` is `mentions` or `all` | `*A* mentioned you in the description of link “T”` |
  | `like` | `commentAuthorId` | `onReactions` | `*A* liked your comment on link “T”` |
  | `ack` | each distinct id in `commentAuthorIds`, with `n` = how often it appears | `onReactions` | `*A* acked your comment on link “T”` for `n` = 1, else `*A* acked {n} of your comments on link “T”` |

  The actor is never in the result. A person appears at most once. A status event with `toStatus` null gives nothing.
- `tellIssueEvent` runs the delivery detached, in the form `void (async () => { try { … } catch (error) { report } })().catch(() => {})`. The report line starts `[issue-notify]` and never contains an address.
- The delivery: (1) read the issue (`id`, `issueKey`, `title`, `workspaceId`, `assigneeId`, `reporterId`, `workspace.slug`) and stop if it is not found; (2) for a status event read the two `ProjectStatus` rows and use `displayName || name`; read the actor's `name`; read the followers' ids; (3) collect the ids `messagesFor` could consider, without the actor, and stop if there are none; (4) read the settings rows `where: { workspaceId, userId: { in: ids }, slackOn: true, slackUrlEnc: { not: null }, user: PERSON }`; (5) `messagesFor`; (6) per message, in turn: `prisma.issue.findFirst({ where: { id: issueId, AND: [issueReadAccessWhere(userId)] }, select: { id: true } })` and skip the person when it finds nothing; decrypt the address; `sendCapped(`${workspaceId}:${userId}`, url, text)`; on `gone` or `failed` call `markSlackResult`. A failure for one person does not stop the others.
- `url`: `new URL(`/${encodeURIComponent(slug)}/issues/${encodeURIComponent(issueKey ?? issueId)}`, base).href` with `base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL`; no base → `null`.

- [ ] **Step 1: Write the failing tests.**
  - `excerpt`: "tags go, mentions stay as names": `'<p>Hi <span data-type="mention" data-user-id="u1">@Erdem</span> &amp; all</p>'` → `'Hi @Erdem & all'`; `'see @[Erdem](u1) now'` → `'see @Erdem now'`; a 250-character text → 200 characters and `…`.
  - `messagesFor`, one test per row of the table with the exact text, using `facts = { key: 'CLB-123', title: 'Fix the login redirect', url: 'https://c.example/w/issues/CLB-123', assigneeId: 'a', reporterId: 'r', followerIds: ['f'], actorName: 'Collab Developer', fromStatus: 'In Progress', toStatus: 'In Review' }`. For example the status text is `*Collab Developer* moved <https://c.example/w/issues/CLB-123|CLB-123> “Fix the login redirect” from In Progress to In Review`.
  - "a status change is not sent to a reporter whose 'Issues I reported' box is off", "…nor to anyone with 'The status changes' off".
  - "a mention reaches a person who has no role on the issue; with comments off it does not".
  - "a comment that mentions the assignee arrives once, with the mention wording".
  - "a person who is assignee and follower gets one message".
  - "the actor is never told": the actor as assignee, as mentioned, as comment author of a like.
  - "three acked comments of one author are one message": `commentAuthorIds: ['p', 'p', 'p', 'q']` → `p` gets `acked 3 of your comments`, `q` gets `acked your comment`.
  - "a title with < & > and a name with * cannot break the message".
  - "without a site address the key is not a link".
  - Delivery, with fakes for `prisma`, `@/lib/apps/crypto`, `@/lib/notification-slack` (`sendCapped` recording its calls) and `@/lib/notification-settings`: "one event, two people with Slack on: two sends, keyed by workspace and person"; "a person who cannot read the issue is skipped"; "a seat's account and a person with Slack off are never read as recipients" (the settings query carries `user: PERSON` and `slackOn: true`); "gone and failed are reported to the settings store, ok is not"; "a database that throws, and a sender that throws, are caught: `tellIssueEvent` returns and `issueEventsSettled` resolves"; "an event for an issue that does not exist sends nothing"; "the log line never contains the address".
  - "the loader's stub": loading `src/app/api/issues/[issueId]/comments/route.ts` the way `tests/security/comment-acks-routes.test.cjs` does still works after Task 6 imports the module (write this as a plain `load` of `@/lib/notification-issue-events` through `helpers.cjs` returning an object with a `tellIssueEvent` function).
- [ ] **Step 2: Run** `node --test tests/security/notification-issue-events.test.cjs`. Expected: FAIL, the module does not exist.
- [ ] **Step 3: Implement** the library and add the stub to `tests/security/helpers.cjs`.
- [ ] **Step 4: Run** the test, then `npm test`. Expected: PASS, no new failure.
- [ ] **Step 5: Commit.**

---

### Task 5: Status changes and assignments tell the notifier (issue routes)

**Files:**
- Modify: `src/app/api/issues/[issueId]/route.ts` (PUT), `src/app/api/issues/route.ts` (POST), `src/app/api/apps/auth/issues/route.ts` (POST), `src/app/api/apps/auth/issues/[issueIdOrKey]/route.ts` (PATCH), `src/app/api/apps/auth/issues/[issueIdOrKey]/assign/route.ts` (POST)
- Test: `tests/security/issue-notify-web.test.cjs` (fakes), `tests/agents/issue-notifications.test.cjs` (PostgreSQL; new file)

**Interfaces:**
- Consumes: `tellIssueEvent`, `issueEventsSettled` from `@/lib/notification-issue-events` (Task 4).
- Produces: nothing new.

Where each call goes, always after the write is committed and never awaited:
- Web PUT: `status` when `oldIssue.statusId !== updatedIssue.statusId` (`fromStatusId: oldIssue.statusId`, `toStatusId: updatedIssue.statusId`); `assigned` when `assigneeChanged && updatedIssue.assigneeId`; `described` with the same user ids the existing `ISSUE_MENTION` notification of the description is sent to, when that list is not empty. Actor `currentUser.id`.
- Web POST: `assigned` when the created issue has an assignee; `described` as above. Actor `session.user.id`.
- Token POST: `assigned` when `newIssue.assigneeId`. Actor `context.user.id`.
- Token PATCH: `status` when `existingIssue.statusId !== updatedIssue.statusId`; `assigned` when `updatedIssue.assigneeId && updatedIssue.assigneeId !== existingIssue.assigneeId`. Actor `context.user.id`.
- Token assign: `assigned` after the assign branch commits, with the new assignee. Nothing on the unassign branch.

- [ ] **Step 1: Write the failing tests.**
  - `tests/security/issue-notify-web.test.cjs`, with the fixture style of `tests/security/issues-mutations.test.cjs` and its own `@/lib/notification-issue-events` recording the events: "a status change tells status once, with both status ids"; "saving without a status change tells nothing"; "a new assignee tells assigned; an unassignment tells nothing"; "creating an issue with an assignee tells assigned"; "a description mention tells described with the mentioned ids"; "the PUT and POST answers have the same keys as before" (compare `Object.keys` of the answer body with the list taken before the change).
  - `tests/agents/issue-notifications.test.cjs`, on a real database through `seatsDatabase` from `tests/agents/seats-db.cjs` (the pattern of `tests/agents/comment-acks.test.cjs`), with the real `notification-issue-events`, `notification-settings` and `notification-slack` modules, a `fetch` fake handed as a global, `APP_TOKENS_KEY` set to a 32-character test value and `NEXT_PUBLIC_APP_URL` to `https://collab.example`: a person `P` with a settings row (Slack on, an encrypted test address, `STARTING_SET`) reports an issue held by a seat. "a seat's status change through the token PATCH reaches the reporter's Slack": after `issueEventsSettled()`, `fetch` was called once with the test address and `JSON.parse(body).text` equal to `*{seat name}* moved <https://collab.example/{slug}/issues/{KEY}|{KEY}> “{title}” from {old displayName} to {new displayName}`. "a seat assigning the issue to the person through the token assign route says so". "a token create with the person as assignee says so". "a person with everything off gets nothing". "the token PATCH answer has the same keys as before".
- [ ] **Step 2: Run** both (the second in the container). Expected: FAIL, no event is told.
- [ ] **Step 3: Add the calls.**
- [ ] **Step 4: Run** both, then `npm test` and, in the container, `tests/agents/*.test.cjs`. Expected: PASS, no new failure.
- [ ] **Step 5: Commit.**

---

### Task 6: Comments, likes and acks tell the notifier

**Files:**
- Modify: `src/app/api/issues/[issueId]/comments/route.ts` (POST), `src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts` (POST), `src/app/api/issues/[issueId]/comments/[commentId]/like/route.ts`, `src/actions/issueComment.ts` (`toggleIssueCommentLike`), `src/lib/issue-comment-acks.ts` (`recordCommentAcks`)
- Test: `tests/security/issue-notify-comments.test.cjs` (fakes), `tests/security/comment-acks.test.cjs` (two tests added), `tests/agents/issue-notifications.test.cjs` (tests added)

**Interfaces:**
- Consumes: `tellIssueEvent` (Task 4).
- Produces: nothing new. `recordCommentAcks` keeps its signature and its result.

Where each call goes:
- Web comment POST, after the comment is created: `{ kind: 'comment', issueId: issue.id, actorId: currentUser.id, commentId: comment.id, text: html?.trim() ? html : content }`.
- Token comment POST, after the comment is created: the same with `actorId: context.user.id` and `text: data.content`.
- Like route and `toggleIssueCommentLike`: on the branch that creates the like only: `{ kind: 'like', issueId, actorId, commentAuthorId: comment.authorId }`.
- `recordCommentAcks`: the comment query selects `{ id: true, authorId: true }`; after the loop, when at least one row was written: `{ kind: 'ack', issueId, actorId: seatUserId, commentAuthorIds }` with one entry per row actually written. Inside its own `try`, so the function still never throws.

- [ ] **Step 1: Write the failing tests.**
  - `tests/security/issue-notify-comments.test.cjs`: "a web comment tells comment with the html when there is html, else the content"; "a token comment tells comment with the content"; "adding a like tells like with the comment's author; taking it back tells nothing" (route and action); "the comment and like answers have the same keys as before".
  - `tests/security/comment-acks.test.cjs`: "acks tell the notifier once, with the authors of the rows written" (three comments, one skipped with P2002 → two authors); "nothing is told when nothing was written".
  - `tests/agents/issue-notifications.test.cjs`: "a seat's comment that mentions the person reaches the person's Slack with the mention wording"; "a seat's comment without a mention is not sent on 'only mentions' and is sent on 'all'"; "a run start that acks two of the person's comments sends one message: acked 2 of your comments".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Add the calls.**
- [ ] **Step 4: Run** them, then `npm test` and, in the container, `tests/agents/*.test.cjs`. Expected: PASS, no new failure.
- [ ] **Step 5: Commit.**

---

### Task 7: Runs and the AI action tell the notifier

**Files:**
- Modify: `src/lib/agent-runs.ts` (`checkout`, `finish` with `settle`), `src/app/api/issues/[issueId]/runs/[runId]/reply/route.ts`, `src/app/api/ai/action/route.ts`
- Test: `tests/security/issue-notify-runs.test.cjs` (fakes), `tests/agents/issue-notifications.test.cjs` (tests added)

**Interfaces:**
- Consumes: `tellIssueEvent` (Task 4).
- Produces: nothing new.

Where each call goes:
- `checkout`: when the transaction moved the issue to an in-progress status, after commit: `status` with `fromStatusId: issue.statusId`, `toStatusId: status.id`, actor `me`. The values leave the transaction the way `seatStarted` does.
- `finish`: `settle` reports whether it moved the status and to which id; after the transaction commits, one `status` event per issue that moved (the run's issue and each `alsoFinish` extra), actor `me`.
- Run reply route: after `notifyCommentMentions`: `{ kind: 'comment', issueId: comment.issueId, actorId: user.id, commentId: comment.id, text: comment.content }`.
- AI action: `update_issue`, after `updateIssue` returned an issue: `status` when `oldIssue.statusId !== issue.statusId`, `assigned` when `assigneeChanged && issue.assigneeId`; `create_issue`: `assigned` when `params.assigneeId`. Actor `currentUser.id`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/security/issue-notify-runs.test.cjs`, with the fixture style of `tests/security/comment-acks-runs.test.cjs`: "a run start that moves the issue tells status after the commit"; "a run start on an issue already in progress tells nothing"; "finishing a run that moves the issue tells status; one that does not, tells nothing"; "a transaction that fails tells nothing"; "the run answers are unchanged, and a notifier that throws does not fail the run" (the fake `tellIssueEvent` throws; the checkout still resolves, which means the call sits in its own `try`).
  - `tests/agents/issue-notifications.test.cjs`: "a seat starting a run on the person's issue: moved from {To Do displayName} to {In Progress displayName}"; "a reply to a stopped run reaches the assignee who has 'all comments'".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Add the calls.**
- [ ] **Step 4: Run** them, then `npm test` and, in the container, `tests/agents/*.test.cjs`. Expected: PASS, no new failure.
- [ ] **Step 5: Commit.**

---

### Task 8: The settings on Profile → Notifications

**Files:**
- Create: `src/components/profile/IssueNotificationSettings.tsx`, `src/components/profile/issueNotificationSummary.ts`
- Modify: `src/components/profile/NotificationSettings.tsx` (remove the groups with `id: "issues"` and `id: "projects"`; render the new component above the remaining groups), `src/hooks/queries/useNotificationPreferences.ts` (new hooks)
- Test: `tests/render/issue-notification-settings.test.cjs`, `tests/security/issue-notification-summary.test.cjs`

**Interfaces:**
- Consumes: the API of Task 3 and its `IssueNotificationView` type; `Card`, `Switch`, `Button`, `Checkbox`, `RadioGroup`, `RadioGroupItem`, `Label`, `Input`, `Badge` from `@/components/ui/*`; `useToast`.
- Produces:

```ts
// useNotificationPreferences.ts
export function useIssueNotificationSettings(workspaceId?: string);                    // GET  /api/user/notification-preferences/issues
export function useUpdateIssueNotificationSettings(workspaceId?: string);              // PATCH, body: Partial<choices> & { slackOn?: boolean }
export function useSaveSlackAddress(workspaceId?: string);                             // PUT    …/issues/slack { url }
export function useRemoveSlackAddress(workspaceId?: string);                           // DELETE …/issues/slack
export function useSendSlackTest(workspaceId?: string);                                // POST   …/issues/slack
// issueNotificationSummary.ts
export function summaryLine(view: IssueNotificationView): { text: string; warn?: string };
```

Copy, exactly (the approved screen is `docs/design/notification-settings/2-settings.png`):
- Card "Where to send", hint `Only Slack can be switched on in the first version.`
  - Row "Slack", with a switch labelled `Send to Slack` that is disabled while no address is saved. State beside the name: `Not set up`, `On`, `Saved, switched off`, or `Switched off by Collab`.
  - Without an address, or while replacing: an input with placeholder `https://hooks.slack.com/services/…` and label `Slack webhook address`, a `Save` button (and `Cancel` while replacing), and the help line `In Slack: create an “Incoming webhook” for the channel you want, and paste its address here. Collab stores it encrypted and never shows it in full again.`
  - With an address: the masked address, and the buttons `Send test message`, `Replace`, `Remove`.
  - Messages: empty input `Paste the address Slack gave you.`; refused `Only a Slack webhook address is accepted. It starts with https://hooks.slack.com/services/`; 503 `Slack addresses cannot be stored on this server yet.`; saved `Address saved. Slack stays off until you switch it on.` (or `New address saved.` when Slack is on); removed `Address removed. Slack is off; your ticks are kept.`; first switch-on `First time on: a starting set was ticked for you. Change anything.`; test `ok` `Test message sent. Look in your Slack channel.`; test `failed` `Slack did not accept the test message. Try again in a moment.`; test `gone` and `offAt` set: `Switched off on {date}: Slack says this address no longer exists. Paste a new address to switch Slack on again. Your ticks are kept.`; `failedAt` set: `The last message could not be delivered ({date}). Slack stays on; the next message is tried as usual.`
  - Rows "In-app" and "Email": greyed, a badge `Later`, a disabled switch; notes `The bell keeps working as it does today. These choices will drive it later.` and `Not sent yet.`
- Card "Which issues", hint `Status changes and “all comments” are sent for these issues.`: checkboxes `Issues assigned to me`, `Issues I reported`, `Issues I follow`.
- Card "Tell me when", hint `You are never told about something you did yourself.`: checkbox `The status changes` (note `For example: moved from In Progress to In Review.`); checkbox `An issue is assigned to me`; a radio group `Comments` with `Off`, `Only comments that mention me` (note `A mention reaches you on any issue, also one that is not yours.`), `All comments` (note `On the issues ticked above. Mentions are included.`); checkbox `Acks and likes on my comments` (note `Comments you wrote, on any issue. An ack means a seat took your comment in.`).
- The summary under the cards, from `summaryLine`:
  - no address: `Nothing is sent: no Slack address is saved.`
  - address, Slack off: `Nothing is sent: Slack is switched off.`
  - on, nothing that sends: `Nothing is sent: Slack is on, but nothing is ticked.`
  - otherwise `With these settings: Slack gets a message when {parts}.` where the parts, joined by `; and `, are: first the "any issue" clauses joined by `; ` (`an issue is assigned to you`; `someone mentions you, on any issue` when comments is not off; `someone acks or likes a comment you wrote`), then, when at least one "which issues" box and at least one of status / all comments is on, `on {issues}: {events}` with issues joined by `, ` from `issues assigned to you`, `issues you reported`, `issues you follow`, and events joined by `, and ` from `its status changes`, `someone comments on it`.
  - `warn`, when status or "all comments" is on and no "which issues" box is ticked: `Status changes and “all comments” need at least one box ticked under “Which issues”.`
- Each change is saved at once with the matching hook; a failed save shows the existing toast style of this page and puts the control back.

- [ ] **Step 1: Write the failing tests.**
  - `tests/security/issue-notification-summary.test.cjs`: one test per case above with the exact sentence; with the starting set the text is `With these settings: Slack gets a message when an issue is assigned to you; someone mentions you, on any issue; someone acks or likes a comment you wrote; and on issues assigned to you, issues you reported, issues you follow: its status changes.`
  - `tests/render/issue-notification-settings.test.cjs` (jsdom, the pattern of `tests/render/issue-comment-ack.test.cjs`, hooks handed as fakes): "everything off: the switch is disabled, no box is ticked, Comments is Off, In-app and Email are disabled and marked Later"; "an empty address shows the hint and calls nothing"; "saving calls the save hook with the typed address and then shows the mask and the three buttons"; "the address input is gone after saving and the full address is nowhere in the document"; "a refused address shows the refusal text"; "ticking a box calls the update hook with that one key"; "choosing All comments calls it with comments: 'all'"; "switching on calls it with slackOn: true"; "offAt set shows the switched-off text with the date"; "failedAt set shows the could-not-be-delivered text"; "Remove calls the remove hook".
  - In the same render file: "the two groups that changed nothing are gone": rendering `NotificationSettings` shows no `Issue Notifications` and no `Project Notifications` heading, and still shows `Email Delivery`, `Browser Push Notifications` and the leave group.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the summary, the hooks, the component, and the change to `NotificationSettings.tsx`.
- [ ] **Step 4: Run** them, then `npm test`. Expected: PASS, no new failure.
- [ ] **Step 5: Commit.**

---

### Task 9: The switches that stay read the record the page saves

**Files:**
- Modify: `src/lib/notification-service.ts` (`getUserPreferences`, `shouldNotifyUser` and their callers inside the file)
- Test: `tests/security/profile-notifications.test.cjs` (tests added)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getUserPreferences(userId: string, workspaceId?: string | null)`: the record of that workspace when there is one, else the record without a workspace, else the defaults. Every caller in the file that knows the workspace of the thing it notifies about passes it.

The page (`src/app/api/user/notification-preferences/route.ts`) saves the record of the current workspace; today the senders read only the record without a workspace, so the Leave and Post switches change nothing. Browser push is not part of this: its subscription stays on the record without a workspace.

- [ ] **Step 1: Write the failing tests** in `tests/security/profile-notifications.test.cjs`, in its existing fixture style: "a post-comment notification is not sent to a follower who switched it off on the settings page of that workspace"; "…and is sent when only the record without a workspace says off but the workspace's record says on"; "a person with no record of that workspace falls back to the record without one"; "a leave notification follows the workspace's record"; "push still reads the record without a workspace".
- [ ] **Step 2: Run** `node --test tests/security/profile-notifications.test.cjs`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.** If a caller has no workspace at hand, leave that caller on the old lookup and say so in the report.
- [ ] **Step 4: Run** it with `tests/security/{notifications-push,notes-notifications,leave-notifications}.test.cjs`, then `npm test`. Expected: PASS, no new failure.
- [ ] **Step 5: Commit.**

---

### Task 10: Docs

**Files:**
- Create: `content/docs/notifications.md`
- Modify: `content/docs/nav.json` (the page under "Start here"), `content/docs/agents/runner-contract.md` (a short section before "What Collab leaves to the runner")

**Interfaces:**
- Consumes: the copy of Tasks 4 and 8 and the spec.
- Produces: nothing.

- [ ] **Step 1: Run** `npm run docs:check` and note that it passes before the change.
- [ ] **Step 2: Write `content/docs/notifications.md`**: first heading `# Get told in Slack about your issues`, a one-paragraph summary, then: how to get a Slack address (Slack → an app with "Incoming webhooks" → the channel), where to paste it (Profile → Notifications), the choices as a table with what each sends, the message wording as a table, that everything starts off, what is never sent (your own actions, edits, unassignments), what happens when Slack does not answer or the address is deleted, the limit of 30 a minute, and that the bell is unchanged and In-app and Email come later. Every sentence must be true of the code on this branch; check each against the libraries of Tasks 2 to 4.
- [ ] **Step 3: Add to `runner-contract.md`** a section `## People are told in Slack` saying: a seat's status change, assignment, comment, mention and ack can now reach people in Slack when they chose so; the runner does nothing for it; no call's answer changed; the sending never delays or fails a call.
- [ ] **Step 4: Run** `npm run docs:check` and `node --test tests/render/docs-*.test.cjs tests/render/check-docs.test.cjs`. Expected: PASS.
- [ ] **Step 5: Commit.**
