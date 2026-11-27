# "Acked" on Issue Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under a person's comment on an issue, show whether an agent seat has taken it in: "Acked by …", "Waiting for …" or "No agent will pick this up".

**Architecture:** One library, `src/lib/issue-comment-acks.ts`, records an ack as an `IssueCommentReaction` of type `ack` under the seat's account and works out the state of each comment when a list is read. `agent-runs.ts` calls the recorder at run start and on a run-context read; the two comment list routes add the state to each comment; one React component renders the line. No schema change.

**Tech Stack:** Next.js App Router, Prisma, React, `node --test` with the repository's loader in `tests/security/helpers.cjs`.

**Spec:** `docs/design/comment-acks/README.md`

## Global Constraints

- No schema or migration change. No new CLI command, MCP tool, OAuth scope or seat-prompt change.
- Recording an ack never throws and never fails a caller: `recordCommentAcks` resolves `0` on any error; `commentAcks` resolves an empty `Map` on any error.
- Existing fields of every API answer stay as they are. The only addition is `ack` on each comment of the two comment list answers.
- The reaction type is the string `ack`. Likes stay `like`. Nothing may count or toggle an `ack` row as a like.
- A person is `PERSON` from `src/lib/agent-stop-boundary.ts` (`email` not null and no `agentSeat`). A live seat is an `AgentSeat` with `retiredAt: null`.
- User-visible copy is exactly the strings given in Task 4.
- PostgreSQL is not installed on this machine, so `tests/agents/**` cannot run here. Every new test is written with the in-memory fakes of `tests/security/helpers.cjs` (`load`, `matches`) so that it runs locally. GitHub runs the database tests on the pull request.
- Commit after each task. Run `npx tsc --noEmit -p .` (with `NODE_OPTIONS=--max-old-space-size=3072`) and `npx eslint` on the files you changed before each commit.

## Review Focus

1. The ack write fails (database error, or a test fake without the reaction table): the run still starts and the list is still answered. Tests in Tasks 1, 2 and 3.
2. An agent's own comment, another seat's comment and Collab's automatic comments never get an `ack` entry and are never acked; a person's own run (no seat) acks nothing. Tests in Tasks 1 and 2.
3. An issue with hundreds of person comments: one bounded write of at most 200 rows, newest first. Test in Task 1.
4. The same seat is given the same comment twice (run start, then a fetch): one row, and no second realtime event. Test in Task 1.
5. A comment older than `ACKS_SINCE`, and an issue held by a retired seat: no line and no ack. Tests in Task 1.

---

### Task 1: The ack library

**Files:**
- Create: `src/lib/issue-comment-acks.ts`
- Modify: `tests/security/helpers.cjs` (the dependency resolver near the `@/lib/workspace-authority` line)
- Test: `tests/security/comment-acks.test.cjs`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; `publishEvent` from `@/lib/redis`; `PERSON`, `isStopIssueDone` from `@/lib/agent-stop-boundary`; `extractMentionUserIds` from `@/utils/mentions`.
- Produces:

```ts
export const ACK_TYPE = 'ack';
export const ACKS_SINCE = new Date('2026-11-28T00:00:00.000Z'); // rule 6: the release day
export const RUNNER_SILENT_MS = 120_000;
export const ACK_WRITE_CAP = 200;
export type CommentAck = {
  state: 'acked' | 'waiting' | 'none';
  seats: { userId: string; name: string; at: string }[]; // acked: ISO times, oldest first; otherwise []
  waitingFor?: string;   // the holder seat's name: waiting, and none with reason issue_done
  reason?: 'in_run' | 'runner_silent' | 'issue_done' | 'not_holder';
  missed?: string[];     // names of mentioned live seats that do not hold the issue
};
export type AckComment = { id: string; authorId: string; createdAt: Date | string; content: string; html?: string | null;
  reactions?: { type: string; authorId?: string; createdAt: Date | string; author?: { id: string; name: string | null } }[] };
export function recordCommentAcks(input: { workspaceId: string; issueId: string; seatUserId: string;
  commentIds?: string[]; createdAt?: { gt?: Date; gte?: Date } }): Promise<number>;
export function commentAcks(issueId: string, comments: AckComment[], now?: Date): Promise<Map<string, CommentAck>>;
```

`recordCommentAcks`: returns `0` unless `seatUserId` is a live seat's account. Selects the issue's comments whose author is a `PERSON`, `createdAt >= ACKS_SINCE`, matching `commentIds` when given and `createdAt` when given, that have no reaction `{ type: 'ack', authorId: seatUserId }`; newest first, at most `ACK_WRITE_CAP`. Writes them with one `issueCommentReaction.createMany({ data, skipDuplicates: true })`. When the count is above 0 it calls `publishEvent(\`workspace:${workspaceId}:events\`, { type: 'issue.comments.changed', workspaceId, issueId }, 1000)`. The whole body is inside one `try`; on any error it resolves `0`.

`commentAcks`: for each comment whose author is a `PERSON` and whose `createdAt >= ACKS_SINCE`, in this order:
1. It has reactions of type `ack`: `{ state: 'acked', seats }` from those rows (name from the reaction's author, falling back to a lookup), oldest first.
2. The issue's assignee is a live seat and the issue is not done (`isStopIssueDone`): `{ state: 'waiting', seats: [], waitingFor: seat.name }`, plus `reason: 'in_run'` when that seat has an open run on the issue that started at or before the comment; else `reason: 'runner_silent'` when the seat is `byRunner` and its owner's live runner in the workspace is missing or was last seen more than `RUNNER_SILENT_MS` before `now`; plus `missed` when the comment mentions other live seats.
3. The assignee is a live seat and the issue is done: `{ state: 'none', seats: [], waitingFor: seat.name, reason: 'issue_done' }`.
4. No live seat holds the issue and the comment mentions live seats: `{ state: 'none', seats: [], reason: 'not_holder', missed }`.
5. Otherwise no entry.
Every other comment has no entry. On any error it resolves an empty `Map`.

- [ ] **Step 1: Write the failing tests** in `tests/security/comment-acks.test.cjs`, with an in-memory fake `prisma` in the style of `tests/security/workspace-permissions-access.test.cjs`. Fixture: workspace `w`, issue `i` assigned to seat account `seat` (seat name `Dev 1`, `byRunner: true`, `ownerId: 'owner'`), a second live seat account `rev` (`Reviewer`) on the same project, a person `p` (email set), a runner of `owner` last seen now. Tests and what each asserts:
  - `"a run's ack is one reaction row per person comment, under the seat's account"`: three comments by `p`, the seat and `rev`; `recordCommentAcks` resolves `1`; the one row is `{ type: 'ack', commentId: <p's>, authorId: 'seat' }`; one event `issue.comments.changed` was published.
  - `"the same comment is acked once, and a second call publishes nothing"`: call twice; second resolves `0`; one row; one event.
  - `"at most 200 rows in one write, the newest comments first"`: 250 person comments; resolves `200`; `createMany` was called once; the oldest 50 have no row.
  - `"a comment older than ACKS_SINCE, a retired seat and a person's account ack nothing"`: each resolves `0` and writes nothing.
  - `"a failing database resolves 0 and does not throw"`: `createMany` rejects; resolves `0`. And with a fake that has no `issueCommentReaction` at all: resolves `0`.
  - `"commentIds and createdAt narrow what is acked"`: only the named or later comments get a row.
  - `"commentAcks: acked, waiting, the two reasons, done, not the holder, and no entry"`: one assertion per row of the list above, including `missed: ['Reviewer']` when `p` mentions `rev`, `reason: 'in_run'` with an open run started before the comment, `reason: 'runner_silent'` with the runner last seen 5 minutes ago, and no entry for the seat's own comment and for a person-held issue with no mention.
  - `"commentAcks resolves an empty map when the database fails"`.
  - `"the shared loader hands the real ack module to code that imports it"`: `load` a three-line stub file is not possible, so assert it through `tests/security/helpers.cjs`'s `load('src/lib/issue-comment-acks.ts', …)` with only `@/lib/prisma` given.
- [ ] **Step 2: Run them and see them fail.** Run: `node --test tests/security/comment-acks.test.cjs`. Expected: FAIL, `ENOENT … src/lib/issue-comment-acks.ts`.
- [ ] **Step 3: Implement the library** with the interface above.
- [ ] **Step 4: Teach the shared loader the module.** In `tests/security/helpers.cjs`, beside the `@/lib/workspace-authority` line, add: when `@/lib/issue-comment-acks` is not in `dependencies`, return `load('src/lib/issue-comment-acks.ts', …)` built from `dependencies['@/lib/prisma']`, with `@/lib/redis` falling back to `{ publishEvent: async () => {} }` and the two other imports loaded from their real files. Existing tests that load code importing the module then keep working without naming it.
- [ ] **Step 5: Run the tests and see them pass.** Run: `node --test tests/security/comment-acks.test.cjs`. Expected: PASS, 9 tests.
- [ ] **Step 6: Commit.** `git add src/lib/issue-comment-acks.ts tests/security/helpers.cjs tests/security/comment-acks.test.cjs && git commit -m "Record and read comment acks as reactions of type ack"`

### Task 2: A run's start and a run-context read record acks

**Files:**
- Modify: `src/lib/agent-runs.ts` (`checkout`, `runContext`, and the "comments since" rule around the `commentsSince` query)
- Test: `tests/security/comment-acks-runs.test.cjs`

**Interfaces:**
- Consumes: `recordCommentAcks` from Task 1.
- Produces: `export async function contextSince(db, issueId: string): Promise<{ gt?: Date; gte?: Date } | undefined>` in `src/lib/agent-runs.ts`: the `createdAt` filter `runContext` uses for `commentsSince` today (the last finished run's `endedAt`, or the early answer by `earlyAnswers`), `undefined` when no run has finished.

- [ ] **Step 1: Write the failing tests** in `tests/security/comment-acks-runs.test.cjs`. Load `src/lib/agent-runs.ts` through `load` with a fake `prisma` and with `@/lib/issue-comment-acks` replaced by a spy `{ recordCommentAcks: async input => { calls.push(input); return 0 } }`; take the list of dependencies from `tests/agents/agents-page.test.cjs`. Tests:
  - `"contextSince is the last finished run's end, or nothing before any run finished"`.
  - `"a seat's new run records acks for its comments-since window"`: `checkout` by a seat's token calls the spy once with `{ workspaceId, issueId, seatUserId: <seat account>, createdAt: <contextSince> }`.
  - `"a person's run, and a run that was already open, record nothing"`.
  - `"a run starts when recording throws"`: the spy rejects; `checkout` still resolves `{ run, repository }`.
  - `"a run-context read by the seat with a run open records the comments it returned"`: spy called with `commentIds` equal to the ids of `commentsSince`; a read with no open run, and a read by another account, record nothing; the answer's fields are unchanged.
  - `"agent-runs loads through the shared loader when the test names no ack module"`.
- [ ] **Step 2: Run them and see them fail.** Run: `node --test tests/security/comment-acks-runs.test.cjs`. Expected: FAIL (`contextSince is not a function`, spy not called).
- [ ] **Step 3: Implement.** Move the "comments since" rule into `contextSince` and use it in `runContext` (same answer as before). In `checkout`, after the transaction has created a new run for a seat, `await recordCommentAcks({ workspaceId, issueId, seatUserId: me, createdAt: await contextSince(prisma, issueId) })` inside a `try` that swallows any error; not for a person's run, not when the open run was returned again. In `runContext`, when the caller's account is a live seat with an open run on the issue, `await recordCommentAcks({ …, commentIds })` the same way, after `commentsSince` is read.
- [ ] **Step 4: Run the tests and see them pass.** Run: `node --test tests/security/comment-acks-runs.test.cjs tests/security/comment-acks.test.cjs`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Ack a seat's comments at run start and on a run-context read"`

### Task 3: The comment lists carry the ack state

**Files:**
- Modify: `src/app/api/issues/[issueId]/comments/route.ts` (GET)
- Modify: `src/app/api/apps/auth/issues/[issueIdOrKey]/comments/route.ts` (GET)
- Test: `tests/security/comment-acks-routes.test.cjs`

**Interfaces:**
- Consumes: `commentAcks`, `recordCommentAcks`, `CommentAck` from Task 1.
- Produces: on every comment and every reply of both GET answers, `ack: CommentAck | null`.

- [ ] **Step 1: Write the failing tests** in `tests/security/comment-acks-routes.test.cjs`, in the style of `tests/security/comment-access.test.cjs` and `tests/security/issue-comments-fetch.test.cjs`:
  - `"the browser list gives each comment and reply its ack, and null where there is none"`.
  - `"the token list gives the same, and every field it had before"`: compare the answer's other keys with the list in the route (`id, content, html, createdAt, updatedAt, parentId, author, reactions, reactionCounts, replies`).
  - `"a seat's token read with a run open records the comments returned, replies included, before the state is read"`: the answer already shows `state: 'acked'` for them.
  - `"a token read without an open run, or by a token that is not a seat, records nothing"`.
  - `"both lists answer when the ack library fails"`: `commentAcks` rejects or resolves an empty map; status 200 and `ack: null` everywhere.
- [ ] **Step 2: Run them and see them fail.** Run: `node --test tests/security/comment-acks-routes.test.cjs`. Expected: FAIL (`ack` is undefined).
- [ ] **Step 3: Implement** both GET handlers. Wrap the ack calls so that a rejection gives `ack: null`.
- [ ] **Step 4: Run the tests and see them pass,** with the neighbours: `node --test tests/security/comment-acks-routes.test.cjs tests/security/comment-access.test.cjs tests/security/issue-comments-fetch.test.cjs tests/security/issue-comments-realtime.test.cjs`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Comment lists carry each comment's ack state"`

### Task 4: The line under a comment

**Files:**
- Create: `src/components/issue/sections/comments/utils/commentAck.ts`
- Create: `src/components/issue/sections/comments/components/CommentAck.tsx`
- Modify: `src/components/issue/sections/comments/components/CommentItem.tsx` (render it under the comment body, above `CommentActions`)
- Modify: `src/components/issue/sections/comments/types/comment.ts` (add `updatedAt?: string` and `ack?: CommentAck | null`)
- Test: `tests/render/issue-comment-ack.test.cjs`

**Interfaces:**
- Consumes: the `CommentAck` type from Task 1 (import the type only).
- Produces: `export function ackLine(ack: CommentAck, createdAt: string, updatedAt?: string): { tone: 'acked' | 'waiting' | 'none'; text: string; more: string[]; details: string[] }` and `export function sinceText(seconds: number): string`.

Exact copy:
- `sinceText`: under 60 s `"{n} s"`; under 60 min `"{n} min"`; under 24 h `"{n} h"`; else `"{n} d"` (rounded, at least 1).
- Acked `text`: `Acked by {names joined by ", "} · {sinceText from createdAt to the first ack} after`, with ` · edited since` appended when `updatedAt` is more than 2 seconds after the first ack. `details`: one per seat, `{name} · {sinceText} after your comment`.
- Waiting `text`: `Waiting for {waitingFor}`, then for `in_run` ` · it is in a run now and gets this when it next asks for comments, or in its next run`, for `runner_silent` ` · its runner has not asked for 2 minutes or more`. `more`: for each name in `missed`, `{name} does not hold this issue; a mention does not reach it`.
- None, `issue_done`: `No agent will pick this up · the issue is done. Reopen it to send this to {waitingFor}`.
- None, `not_holder`: `No agent will pick this up · {missed joined by ", "} does not hold this issue. Assign the issue to it to send this`.

The component: always visible (not inside the hover-only action row), `text-[11px]`, an icon from `lucide-react` (`CheckCheck` acked, `CircleDashed` waiting, `Ban` none), colours `text-emerald-400`, `text-collab-500`, `text-amber-400`. An acked line is a `<button>` that toggles the `details` list; the exact ack time is its `title`. Follow `design-system.md`.

- [ ] **Step 1: Write the failing tests** in `tests/render/issue-comment-ack.test.cjs`, in the style of `tests/render/issue-run.test.cjs`: one test per copy line above with the exact string; `"an edit after the ack adds edited since, an edit before it does not"`; `"a comment with no ack renders no line"`; `"the line is outside the hover-only action row"` (the rendered markup has no `group-hover` class on the line or its ancestors inside the comment body); `"a seat name is rendered as text"` (a name containing `<b>` appears escaped).
- [ ] **Step 2: Run them and see them fail.** Run: `node --test tests/render/issue-comment-ack.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the two new files and the two edits.
- [ ] **Step 4: Run the tests and see them pass.** Run: `node --test tests/render/issue-comment-ack.test.cjs tests/render/issue-run.test.cjs`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Show the ack line under a person's comment"`

### Task 5: Docs

**Files:**
- Modify: `content/docs/agents/give-a-seat-work.md` (a section "How you know your comment landed": the three lines, the two reasons, that a mention does not reach a seat)
- Modify: `content/docs/agents/runner-contract.md` (a short section "Acks": Collab records them at run start and on a read during a run; a runner and a session do nothing; the `ack` field on comment lists and its shape)

- [ ] **Step 1: Write both sections,** in the plain style of the pages around them, a table before prose.
- [ ] **Step 2: Check.** Run: `npm run docs:check`. Expected: exit 0.
- [ ] **Step 3: Run the whole local check.** Run: `npm run check:changed -- tests/security/comment-acks.test.cjs tests/security/comment-acks-runs.test.cjs tests/security/comment-acks-routes.test.cjs tests/render/issue-comment-ack.test.cjs`. Expected: exit 0.
- [ ] **Step 4: Commit.** `git commit -m "Document the ack line and that runners do nothing for it"`
