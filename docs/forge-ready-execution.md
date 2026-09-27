# Ready execution

Owner/admins with current task and Notes access can select an operator-configured
Stech deployment, review approved context, and mark an open Forge issue Ready.
This explicitly authorizes one potentially billable run. Approved Rules always
enter the prompt; only selected approved Strategy, Decisions and Handoffs do.
The full issue and loaded discussion enter the prompt. Partial discussion or an
input larger than 100,000 UTF-8 bytes is rejected, never silently truncated.
Unapproved and superseded Notes are excluded. Unsaved issue edits block the UI. Consent is bound to the displayed task, discussion, memory SHA, selected notes and deployment identity; refreshed context requires confirmation again.

The source receives an execution preparation marker with the attempt ID and
configured deployment/model. Durable PostgreSQL receipts show subsequent run
state and result; the source marker is a preparation record, not a live result.
A provider result requires human review. No automatic issue closure, merge or
deployment occurs. The configured model label is not runtime model attestation.

## Deployment contract

Apply `20260924010000_forge_execution_attempt` using the normal reviewed
migration process. New empty databases require the [explicit bootstrap](database-bootstrap.md), separately qualified against the exact schema and migration contract; historical migrations do not initialize them. Its partial unique index permits only one active attempt per
project/issue; the generation index fences competing preparation transactions.
Do not replace migration execution with Prisma db push, which omits the partial
index and state constraint. Persist and back up these rows with the app database.
After any restore, keep `COLLAB_READY_WORKER` disabled. A snapshot may show READY
even though a provider run started after that snapshot; restoring a database does
not establish that launching is safe. Reconcile every potentially post-snapshot
run with the provider owner before re-enabling consumption. Preserve uncertain
attempts as UNKNOWN rather than relaunching them.

They include private task/context and agent results; apply the same custody and
retention policy as project content. Project deletion is restricted while receipts
remain, preventing loss of launch evidence through a cascade.

An optional private binding `execution.deployments` lists `key`, `label`, HTTPS
`origin`, `organization`, `agentId`, `configuredModel`, artifact SHA256 `revision`,
and absolute `tokenFile`. Tokens stay server-side. A nonsecret identity hash pins origin, organization, agent ID, artifact revision and configured model in the reviewed request and durable attempt; launch and cancellation reject identity drift. Token rotation does not change that identity. Qualify the deployment's tool
permissions, repository access, billing, model mapping and immutable artifact
before enabling `COLLAB_READY_WORKER=enabled` on a persistent Node app process.
That flag is off by default. A Ready receipt can wait while the worker is off.

The worker uses Stech's existing deployment, channels, run-stream and cancel APIs.
It verifies the configured deployment is live and channel routing has no other
deployment immediately before launching. This is a snapshot, not a provider-side
pin: qualified routing and artifact-to-model mapping must stay frozen during the
pilot. No per-request model or unsupported pin query is invented. Stech's full
row includes a private run token; only the qualification fields are retained.
No live provider credentials, execution, migration or enablement is included in
this source change.

## Failure and retry rules

The worker atomically claims READY, rechecks current requester authority, open
issue fingerprint, complete discussion fingerprint and memory SHA, then durably
records launch intent before its single POST. A provider acknowledgment records
the native run ID. A nonempty end_turn/stop_sequence result is REVIEW_REQUIRED;
an empty result is RESULT_MISSING. Neither is task acceptance.

Lost launch responses, disconnected streams without terminal evidence, or lost
worker heartbeats become UNKNOWN. UNKNOWN remains active and blocks every retry,
including after restart. Stech has no idempotent start or supported run-ID
reconciliation read, so the UI cannot safely resolve this automatically. The
operator and provider owner must follow the
[independent reconciliation contract](#independent-restore-and-launch-fence)
before any repair; never delete/expire a row to enable a retry.

Known prelaunch failures and qualified terminal empty-result/cancellation can be retried
only by a new explicit reviewed request tied to the latest receipt. A cancellation
before claim prevents launch. Once launch intent is committed, cancellation can
race launch and is a request, not proof of stopping. HTTP202 acceptance does not
invent runtime acknowledgment: nullable acknowledgedAt is preserved, and only a
terminal cancelled event establishes provider cancellation. A run that completes
while cancellation is pending still requires result review.

Ready marker writes share the [issue actions guide's](forge-issue-actions.md)
preflight/PATCH/readback limitation. The worker verifies the resulting source
again before launch. Agent output renders
as plain text; it cannot execute HTML or silently become new instructions.

## Local qualification

`node --test tests/security/forge-execution.test.cjs` tests provider framing,
qualification and cancellation acknowledgment without a live provider.
Set `COLLAB_READY_TEST_DATABASE_URL` to a disposable loopback PostgreSQL instance
to also execute the real migration, partial uniqueness, competing worker claims,
unknown outcomes, persisted restart state, closed/revoked denial and changed
discussion checks. This creates and removes its own random database schema.
The provider and authorization dependencies in that test are controlled doubles;
it is not native Stech execution or browser/production acceptance.

Browser and PostgreSQL qualification reported for the retained September 24 source is historical. This integration has not run a browser, database migration, native concurrency test or provider execution. The optional PostgreSQL fixture is adapted to the independent journal but remains unexecuted for this candidate.


## Independent restore and launch fence

SQL is not sufficient launch authority after a restore or copy. Preparation
requires explicitly initialized independent authority; a retry or transition
that could permit execution must match its independent receipt. Fail-closed
UNKNOWN fencing can update SQL alone, preserving the original external evidence.
The worker first
checks that receipt, atomically claims the local READY row, then exclusively
claims the independent journal before it can issue a provider POST. This is two
ordered claims, not an atomic transaction across SQL and the filesystem. Two
copies of the SQL database must use the same journal authority and mount.

`COLLAB_READY_JOURNAL_DIR=/var/lib/collab-ready-journal` is a dedicated persistent
mount owned by the Collab runtime (production contract UID:GID 1001:1001), mode
0700, outside the SQL volume and its restore boundary. Journal files are 0600.
The production UID and mount are a deployment contract, not accepted custody or
an allocated service. The root directory must already exist; app entrypoints
never create or initialize it. An operator initializes a genuinely new, empty
mounted directory once with:

```sh
node scripts/initialize-ready-journal.mjs /var/lib/collab-ready-journal
```

Bind the returned nonsecret UUID as `COLLAB_READY_JOURNAL_ID`. The matching
`authority.json` distinguishes explicitly initialized empty history from a
missing, unavailable or replaced authority. Never initialize a replacement mount
merely to get a restored app running. The journal contains private reviewed task
context and requires equivalent confidentiality and independent backup custody.
It retains the latest receipt per upstream origin/repository/issue, including
attempt identity, generation, tenant binding, reviewed input and fingerprints,
deployment identity, state and provider run ID; it is not a complete event log.

Exclusive file creation serializes claims. Writes use a new file, file fsync,
atomic rename and directory fsync. A completed journal operation releases its
own lock; a crashed claimant or uncertain journal write retains the lock.
No timeout, restart, cancellation or retry clears a retained lock. Missing,
corrupt, mismatched or newer independent evidence fences the SQL attempt as
UNKNOWN/nonretryable before launch; a retained receipt absent from restored SQL
creates an UNKNOWN fence. Old attempts without authority-bound input also fail
closed. An ambiguous cancellation does not issue a provider cancellation POST.

Unqualified HTTP errors, generic error frames, unknown terminal reasons, lost
acknowledgments and disconnects after a possible launch remain UNKNOWN. Only a
qualified terminal event matching the acknowledged run ID permits terminal
retry state. Forge fingerprint preflight/PATCH/readback is not a CAS or launch
fence. The journal does not make provider start idempotent.

Keep the worker OFF until ND qualifies the actual shared persistent filesystem:
exclusive creation across all app processes/copies, file and directory fsync,
atomic rename, protected mount ownership, failure behavior and independent
backup/restore custody. A Docker bridge or application URL proves none of these.
After a crash or restore, operator/provider reconciliation must establish whether
execution occurred and bind the reviewed outcome in both authorities before any
separately authorized repair. Never delete a lock, row or journal history merely
to allow another launch. No automated reconciliation/lock-clear interface exists.

`forge-execution-journal.test.cjs` executes local filesystem and child-process
failure checks. `forge-execution-restore.test.cjs` executes the actual service,
worker and receipt code with modeled Prisma state and synthetic provider
responses, including competing workers and restored SQL copies. These are
source-level checks, not native SQL isolation or mounted-filesystem durability
proof. No gateway activation, credentials, live allocation or cutover is implied.
