# Fresh database bootstrap

The retained migration history cannot initialize an empty database: early
migrations assume tables that their predecessors do not create. Historical
files remain unchanged. This procedure creates a **new, empty, dedicated**
PostgreSQL database from the current schema and explicitly baselines that
history. It does not repair historical shadow-database replay, upgrade an
existing installation or authorize production changes.

The contract includes agent handoffs, Git provider connections and issue Trash.
Their tables, indexes and foreign keys are fully represented by the current Prisma
schema; they require no additional bootstrap SQL supplements. This does not
qualify upgrades of an existing installation. In particular, do not use bootstrap
or baseline commands on a populated database without a migration ledger. Apply
only its separately reviewed upgrade SQL after a fresh backup. For Git provider
upgrades, see [Git provider database and deployment](git-provider-connections.md#database-and-deployment).

Run from the reviewed source checkout with locked dependencies (Prisma 6.19.3),
Node and the native PostgreSQL `psql` client installed. Use a separately admitted operator environment; bootstrap is never an app-startup action. Keep the
app and `COLLAB_READY_WORKER` disabled throughout bootstrap and verification.
Select the new database through `DATABASE_URL` using existing protected
credential custody; never put credentials in command arguments or history.
`DATABASE_URL` must be present in the process environment; the bootstrap script
does not load `.env` itself.
The URL must explicitly name host, user and database; schema must be public.
Select `sslmode=require` explicitly in the URL. Only an explicitly selected numeric
loopback fixture (`127.0.0.1` or `::1`) may use `sslmode=disable`. Missing, duplicate,
opportunistic or other TLS modes refuse before child processes. This requires
encryption remotely; it is not a certificate-hostname verification guarantee.
Both Prisma and psql receive the same explicit mode. psql never prompts for a
password (`-w`); use existing credential custody. A missing psql executable is a
local prerequisite failure; timeouts and lost acknowledgments remain unconfirmed.
Only the documented TLS/libpq connection options are accepted, not Prisma pool
options. Ambient PG variables are cleared so they cannot override that target.

```sh
node scripts/bootstrap-empty-database.mjs --empty-database-only
node node_modules/prisma/build/index.js migrate status
node node_modules/prisma/build/index.js migrate deploy
```

The bootstrap refuses a database containing non-system schemas, relations,
types or functions. Do not run another schema writer alongside it. An advisory
lock serializes concurrent bootstrap attempts; all empty checks and schema DDL
run in one PostgreSQL transaction. Prisma generates the current modeled schema;
the script also applies the exact Ready state CHECK and active-attempt partial
unique index from the retained Ready migration, plus all six Version provenance
functions and triggers from `20260924130000_version_access_invalidation`.
The current model already creates `Version.issueAccessInvalidated` with default
false. The historical migration first marks existing rows true; that upgrade
backfill is deliberately not replayed into an empty bootstrap. Existing databases
must run the original migration, including its conservative invalidation. The modeled project foreign
key preserves delete restriction. Do not substitute `db push` for bootstrap or
reviewed upgrade migrations: it does not install the unmodeled constraints and
Version functions/triggers. No reset is used.

After schema creation, native `prisma migrate resolve --applied` records each
retained historical migration. These are baselines, not claims that historical
data transformations were executed on the empty database. `prisma/bootstrap-contract.json` pins the current schema SHA256, exact sixteen
migration names/bytes and Prisma 6.19.3. Schema changes, changed/added/removed
migrations and CLI upgrades refuse before generation or connection and require
reviewed requalification. Run only from the admitted immutable source bundle;
do not edit its schema, migrations, contract or tooling while bootstrap runs. On success,
native status must be current and deploy must have no pending migrations.
Provision owner/account mappings and private bindings only through their
separately reviewed process; bootstrap does not create users or grant access.

## Interrupted or uncertain result

A nonzero psql result can mean the transaction committed but its acknowledgment
was lost. The script reports an **unconfirmed outcome**, never assumes rollback,
and stops before recording a baseline. A failed native resolve leaves the
schema committed and may leave a partially recorded baseline. Both cases keep
the app and worker off. Bootstrap reruns refuse a populated target.

Recovery is an explicit operator investigation, not an automatic retry:

1. Verify the intended database, exact reviewed source and whether schema
   creation committed. Preserve any existing records and take a readback-checked
   backup before considering further writes.
2. Compare the actual schema with the reviewed Prisma model and inspect the
   Ready state CHECK, partial unique index and restrictive project foreign key,
   plus the six enabled Version function/trigger pairs on the expected tables.
   Verify `Version.issueAccessInvalidated` is non-null with default false.
   The expected catalog is defined by the pinned schema, original supplement SQL
   and `prisma/bootstrap-contract.json`; actual native readback is still required.
   Model diff alone does not cover these unmodeled database constraints.
3. If and only if this is the verified newly created bootstrap database, with
   matching complete schema and no application writes, use native
   `prisma migrate status` to identify the unrecorded historical entries. Record
   only those explicitly verified names with native `migrate resolve --applied
   <migration-name>`. Do not infer that an existing/legacy target can be marked
   applied; it needs its own upgrade plan.
4. Recheck status and a no-op deploy. Before any restored system starts execution,
   also reconcile possible post-snapshot provider runs against the separate durable
   journal as described in [Ready execution](forge-ready-execution.md). Never
   restore, initialize or clear that independent authority merely to make SQL
   look current. Missing/newer/ambiguous evidence remains UNKNOWN/nonretryable.

The migration history still cannot be replayed into a shadow database from
empty. Do not claim that `migrate dev` or a complete historical replay is fixed.

## Runnable check

With `COLLAB_BOOTSTRAP_TEST_SERVER_URL` unset,
`node --test tests/security/bootstrap-empty-database.test.cjs` checks the explicit
intent guard and verifies that the fixture runner clears inherited PG variables
while preserving explicit overrides; the native check is skipped.
Set `COLLAB_BOOTSTRAP_TEST_SERVER_URL` to an owned disposable
numeric loopback PostgreSQL server with create-database rights and explicit
`sslmode=disable` (or `require` for TLS) for the full check. It
creates and removes uniquely named test databases, executes native bootstrap,
status and deploy, verifies Ready constraints, tests misleading ambient PG
variables and populated/custom-schema refusal, and injects a lost acknowledgment
after a real COMMIT. It never selects an existing application database.


## Current source qualification and restore boundary

The October 26 contract binds all sixteen migrations through
`20261022190000_issue_trash`, including the earlier agent-handoff and Git-provider
migrations. It retains the exact Ready and Version provenance supplements.
Historical migrations are unchanged. Fresh schema generation installs the Trash
columns, durable audit table and restrictive Issue project/workspace foreign
keys directly; it does not replay the Trash migration's ALTER statements.

`node --test tests/security/bootstrap-recipe.test.cjs` executes the actual CLI
with process doubles. It checks exact emitted supplement bytes, one guarded
transaction followed by fifteen ordered native baseline commands, target/env
handling, drift refusal and no retry after simulated failures. These doubles do
not execute PostgreSQL or prove transaction, catalog or trigger behavior.
The native fixture verifies exact baseline names/checksums, a complete model
diff, all six Version catalog pairs, the new modeled tables, nullable Trash
columns, restrictive parent foreign keys and audit indexes. It also verifies
that the audit table has no foreign keys that could cascade away its snapshots.
It retains the status/no-op deploy, populated/custom-schema refusal and lost
COMMIT acknowledgment checks. A passing disposable local fixture qualifies this
bootstrap recipe; it is not a production migration or restore receipt.

Before bootstrap on another target, the operator must bind the exact reviewed
source and toolchain to that separately admitted empty database and repeat the
catalog, baseline and recovery checks above. Existing installations require
their own backup and upgrade plan; no production migration, worker activation
or gateway cutover is implied by these local checks.

The October 26 contract additionally binds `20261026000100_agent_operations`. Fresh bootstrap installs the nullable host/session/watcher fields, unique per-user host/session identity, and replacement-handoff foreign key directly from the current Prisma schema. Existing installations apply only the reviewed additive migration after a verified backup; bootstrap remains empty-database-only.
