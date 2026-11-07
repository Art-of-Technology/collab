const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');

test('runtime grants protect existing writers and permit review operations after migration', { timeout: 120000 }, t => {
  const root = mkdtempSync(join(tmpdir(), 'review-grant-'));
  const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const data = join(root, 'data');
  let started = false;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('PG')) delete env[key];
  const run = (name, args, options = {}) => execFileSync(join(bin, name), args, { stdio: 'pipe', env, ...options });
  t.after(() => {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  });
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-k ${root} -c listen_addresses=''`, '-w', 'start']);
  started = true;
  const databaseUrl = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(root)}`;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js', { paths: [process.cwd()] }), 'db', 'push', '--skip-generate'], { env: { ...env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  const args = ['-XqAt', '-v', 'ON_ERROR_STOP=1', '-h', root, '-U', userInfo().username, '-d', 'postgres'];
  const sql = input => spawnSync(join(bin, 'psql'), args, { input, encoding: 'utf8', env });
  const sqlAs = (actor, input) => spawnSync(join(bin, 'psql'), [...args, '-U', actor], { input, encoding: 'utf8', env });
  const success = input => { const result = sql(input); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  success(`
DROP TABLE "AgentReviewRequest", "AgentTransferOffer" CASCADE;
CREATE ROLE review_runtime LOGIN;
CREATE ROLE legacy_runtime LOGIN;
CREATE ROLE cleanup_runtime LOGIN;
INSERT INTO "User" (id, "updatedAt") VALUES ('u1',now()),('u2',now()),('u3',now()),('u4',now());
INSERT INTO "Workspace" (id, name, slug, "ownerId", "updatedAt") VALUES ('w1','one','w1','u2',now()),('w2','two','w2','u4',now());
INSERT INTO "Project" (id, name, slug, "workspaceId", "issuePrefix", "updatedAt") VALUES ('p1','one','p1','w1','P1',now()),('p2','two','p2','w2','P2',now());
INSERT INTO "Issue" (id, title, "workspaceId", "projectId", "updatedAt") VALUES ('i1','one','w1','p1',now()),('i2','two','w2','p2',now());
INSERT INTO "AgentRegistration" (id, "workspaceId", "userId", name, "updatedAt") VALUES ('a1','w1','u1','a1',now()),('a2','w1','u2','a2',now()),('a3','w1','u2','a3',now()),('a4','w2','u3','a4',now()),('a5','w2','u4','a5',now());
INSERT INTO "AgentHandoff" (id, "workspaceId", "issueId", "sourceKey", content, status, "claimedById", "updatedAt") VALUES ('h1','w1','i1','h1','work','claimed','a1',now()),('h2','w2','i2','h2','work','claimed','a4',now());
`);
  // Prisma prepares the disposable baseline; the transfer and review guards come from their actual migrations.
  assert.equal(success('SELECT current_schema();').trim(), 'public');
  for (const migration of ['20261030000200_agent_transfer_offer', '20261031000100_transfer_worker_guard', '20261031000200_transfer_recipient_guard', '20261031000300_pending_offer_serialization']) {
    success(readFileSync(resolve(`prisma/migrations/${migration}/migration.sql`), 'utf8'));
  }
  success('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO review_runtime, legacy_runtime, cleanup_runtime;');
  success(readFileSync(resolve('prisma/migrations/20261107000100_agent_review_guard/migration.sql'), 'utf8'));
  for (const actor of ['review_runtime', 'legacy_runtime', 'cleanup_runtime']) for (const statement of [
    `UPDATE "AgentHandoff" SET status='completed' WHERE id='h1'`,
    `INSERT INTO "AgentTransferOffer" (id, "workspaceId", "issueId", "parentId", "senderId", "recipientId", "recipientName", "requestId", content, status, "updatedAt") VALUES ('o1', 'w1', 'i1', 'h1', 'a1', 'a2', 'a2', 'q1', 'work', 'pending', now())`,
    `DELETE FROM "AgentRegistration" WHERE id='a3'`,
  ]) {
    const result = sql(`SET ROLE ${actor}; ${statement};`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /permission denied for table AgentReviewRequest/);
  }
  const grantRecipe = readFileSync(resolve('docs/agent-review-contract.md'), 'utf8')
    .match(/```sql\n(\\set ON_ERROR_STOP on[\s\S]*?)\n```/);
  assert.ok(grantRecipe, 'the executable grant is documented');
  success(grantRecipe[1].replace('verified_role_name', 'review_runtime'));
  success('GRANT SELECT ON "AgentReviewRequest" TO legacy_runtime; GRANT SELECT, UPDATE ON "AgentReviewRequest" TO cleanup_runtime;');
  for (const [actor, expected] of [['review_runtime', 't|t|t|t|f'], ['legacy_runtime', 't|t|f|f|f'], ['cleanup_runtime', 't|t|f|t|f']]) {
    const privileges = success(`SET ROLE ${actor}; SELECT has_schema_privilege(current_user, 'public', 'USAGE'), has_table_privilege(current_user, 'public."AgentReviewRequest"', 'SELECT'), has_table_privilege(current_user, 'public."AgentReviewRequest"', 'INSERT'), has_table_privilege(current_user, 'public."AgentReviewRequest"', 'UPDATE'), has_table_privilege(current_user, 'public."AgentReviewRequest"', 'DELETE');`);
    assert.equal(privileges.trim(), expected);
  }
  success(`SET ROLE legacy_runtime;
DELETE FROM "AgentRegistration" WHERE id='a3';
UPDATE "AgentHandoff" SET status='open', "claimedById"=NULL WHERE id='h1';
UPDATE "AgentHandoff" SET status='claimed', "claimedById"='a1' WHERE id='h1';`);
  success('REVOKE UPDATE ON "AgentHandoff" FROM legacy_runtime, cleanup_runtime;');
  const deniedTransferLock = sql(`SET ROLE legacy_runtime; INSERT INTO "AgentTransferOffer" (id, "workspaceId", "issueId", "parentId", "senderId", "recipientId", "recipientName", "requestId", content, status, "updatedAt") VALUES ('o1', 'w1', 'i1', 'h1', 'a1', 'a2', 'a2', 'q1', 'work', 'pending', now());`);
  assert.notEqual(deniedTransferLock.status, 0);
  assert.match(deniedTransferLock.stderr, /permission denied for table AgentHandoff/);
  success('GRANT UPDATE ("updatedAt") ON "AgentHandoff" TO legacy_runtime;');
  success(`SET ROLE legacy_runtime;
INSERT INTO "AgentTransferOffer" (id, "workspaceId", "issueId", "parentId", "senderId", "recipientId", "recipientName", "requestId", content, status, "updatedAt") VALUES ('o1', 'w1', 'i1', 'h1', 'a1', 'a2', 'a2', 'q1', 'work', 'pending', now());
UPDATE "AgentTransferOffer" SET status='cancelled' WHERE id='o1';`);
  const insertReview = `INSERT INTO "AgentReviewRequest" ("id", "workspaceId", "issueId", "originalHandoffId", "ownerAgentId", "reviewerAgentId", "requestId", repository, "pullRequestNumber", revision, "requestContent", "updatedAt") VALUES ('r1','w1','i1','h1','a1','a2','q1','owner/repo',1,'0123456789012345678901234567890123456789','Review',CURRENT_TIMESTAMP);`;
  for (const table of ['Workspace', 'Issue', 'AgentRegistration', 'AgentHandoff', 'AgentTransferOffer']) {
    success(`REVOKE SELECT ON "${table}" FROM review_runtime;`);
    const denied = sql(`SET ROLE review_runtime; ${insertReview}`);
    assert.notEqual(denied.status, 0, `review insertion needs ${table} SELECT`);
    assert.match(denied.stderr, new RegExp(`permission denied for table ${table}`));
    success(`GRANT SELECT ON "${table}" TO review_runtime;`);
  }
  for (const table of ['Workspace', 'Issue', 'AgentRegistration', 'AgentHandoff']) {
    success(`REVOKE UPDATE ON "${table}" FROM review_runtime;`);
    const denied = sql(`SET ROLE review_runtime; ${insertReview}`);
    assert.notEqual(denied.status, 0, `review insertion needs ${table} row-lock privileges`);
    assert.match(denied.stderr, new RegExp(`permission denied for table ${table}`));
    success(`GRANT UPDATE ON "${table}" TO review_runtime;`);
  }
  success('REVOKE UPDATE ON "AgentHandoff" FROM review_runtime; GRANT UPDATE (status) ON "AgentHandoff" TO review_runtime;');
  const deniedTimestamp = sql(`SET ROLE review_runtime; ${insertReview}`);
  assert.notEqual(deniedTimestamp.status, 0);
  assert.match(deniedTimestamp.stderr, /permission denied for table AgentHandoff/);
  success('GRANT UPDATE ("updatedAt") ON "AgentHandoff" TO review_runtime;');
  success(`SET ROLE review_runtime; ${insertReview}`);
  success('GRANT UPDATE ON "AgentHandoff" TO review_runtime;');
  const legacyInsert = sql(`SET ROLE legacy_runtime; INSERT INTO "AgentReviewRequest" (id) VALUES ('denied');`);
  assert.notEqual(legacyInsert.status, 0);
  assert.match(legacyInsert.stderr, /permission denied for table AgentReviewRequest/);
  success('GRANT UPDATE (status, "claimedById") ON "AgentHandoff" TO legacy_runtime;');
  const blocked = sql(`SET ROLE legacy_runtime; UPDATE "AgentHandoff" SET status='completed' WHERE id='h1';`);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Resolve or cancel the pending review/);
  const blockedTransfer = sql(`SET ROLE legacy_runtime; INSERT INTO "AgentTransferOffer" (id, "workspaceId", "issueId", "parentId", "senderId", "recipientId", "recipientName", "requestId", content, status, "updatedAt") VALUES ('o2', 'w1', 'i1', 'h1', 'a1', 'a2', 'a2', 'q2', 'work', 'pending', now());`);
  assert.notEqual(blockedTransfer.status, 0);
  assert.match(blockedTransfer.stderr, /Resolve or cancel the review before transferring/);
  const directDelete = sql(`SET ROLE review_runtime; DELETE FROM "AgentReviewRequest" WHERE id='r1';`);
  assert.notEqual(directDelete.status, 0);
  assert.match(directDelete.stderr, /permission denied for table AgentReviewRequest/);
  success(`SET ROLE review_runtime; DELETE FROM "User" WHERE id='u1';`);
  const state = success(`SET ROLE review_runtime; SELECT status, "cancelReason", "ownerAgentId" IS NULL FROM "AgentReviewRequest" WHERE id='r1';`);
  assert.equal(state.trim(), 'cancelled|owner_deleted|t');
  const claim = success(`SET ROLE review_runtime; SELECT "claimedById" IS NULL FROM "AgentHandoff" WHERE id='h1';`);
  assert.equal(claim.trim(), 't');
  success(`SET ROLE review_runtime; DELETE FROM "Issue" WHERE id='i1'; DELETE FROM "Project" WHERE id='p1'; DELETE FROM "Workspace" WHERE id='w1';`);
  const count = success(`SET ROLE review_runtime; SELECT count(*) FROM "AgentReviewRequest";`);
  assert.equal(count.trim(), '0');
  success(`SET ROLE review_runtime;
INSERT INTO "AgentReviewRequest" ("id", "workspaceId", "issueId", "originalHandoffId", "ownerAgentId", "reviewerAgentId", "requestId", repository, "pullRequestNumber", revision, "requestContent", "updatedAt")
VALUES ('r2','w2','i2','h2','a4','a5','q2','owner/repo',1,'0123456789012345678901234567890123456789','Review',CURRENT_TIMESTAMP);`);
  const deniedCleanup = sql(`SET ROLE legacy_runtime; DELETE FROM "AgentRegistration" WHERE id='a4';`);
  assert.notEqual(deniedCleanup.status, 0);
  assert.match(deniedCleanup.stderr, /permission denied for table AgentReviewRequest/);
  const deniedCleanupLock = sql(`SET ROLE cleanup_runtime; DELETE FROM "AgentRegistration" WHERE id='a4';`);
  assert.notEqual(deniedCleanupLock.status, 0);
  assert.match(deniedCleanupLock.stderr, /permission denied for table AgentHandoff/);
  success('GRANT UPDATE ("updatedAt") ON "AgentHandoff" TO cleanup_runtime;');
  const cleanupState = success(`SET ROLE cleanup_runtime; DELETE FROM "AgentRegistration" WHERE id='a4'; SELECT status, "cancelReason", "ownerAgentId" IS NULL FROM "AgentReviewRequest" WHERE id='r2'; DELETE FROM "Issue" WHERE id='i2';`);
  assert.equal(cleanupState.trim(), 'cancelled|owner_deleted|t');
  const issueCount = success(`SET ROLE review_runtime; SELECT count(*) FROM "AgentReviewRequest" WHERE id='r2';`);
  assert.equal(issueCount.trim(), '0');
  // Broad grants or owner-role membership invalidate the least-privilege qualification.
  const qualification = readFileSync(resolve('docs/agent-review-contract.md'), 'utf8')
    .match(/```sql\n(SELECT current_user,[\s\S]*?)\n```/);
  assert.ok(qualification, 'the executable rollout readback is documented');
  const safeRole = () => {
    const result = sqlAs('review_runtime', qualification[1]);
    assert.equal(result.status, 0, result.stderr);
    const fields = result.stdout.trim().split('|');
    assert.equal(fields.length, 18, 'qualification returns exactly one complete row');
    return [9, 10, 11, 12].every(i => fields[i] === 't') &&
      [2, 3, 4, 5, 7, 8, 13, 14, 15, 16, 17].every(i => fields[i] === 'f') ? 't' : 'f';
  };
  assert.equal(safeRole(), 't');
  success('GRANT TRUNCATE ON "AgentReviewRequest" TO PUBLIC;');
  assert.equal(safeRole(), 'f', 'PUBLIC privileges are included');
  success('REVOKE TRUNCATE ON "AgentReviewRequest" FROM PUBLIC;');
  assert.equal(safeRole(), 't');
  success('CREATE ROLE review_broad NOLOGIN; GRANT TRUNCATE ON "AgentReviewRequest" TO review_broad; GRANT review_broad TO review_runtime WITH INHERIT FALSE, SET TRUE;');
  const effective = sqlAs('review_runtime', `SELECT has_table_privilege(current_user, 'public."AgentReviewRequest"', 'TRUNCATE');`);
  assert.equal(effective.stdout.trim(), 'f', 'NOINHERIT hides the assumable grant from current privileges');
  assert.equal(safeRole(), 'f', 'assumable role privileges are included');
  success('REVOKE review_broad FROM review_runtime;');
  assert.equal(safeRole(), 't');
  success('GRANT REFERENCES (id) ON "AgentReviewRequest" TO review_broad; GRANT review_broad TO review_runtime WITH INHERIT FALSE, SET TRUE;');
  const columnRights = sqlAs('review_runtime', `SELECT has_table_privilege('review_broad', 'public."AgentReviewRequest"', 'REFERENCES'), has_any_column_privilege('review_broad', 'public."AgentReviewRequest"', 'REFERENCES');`);
  assert.equal(columnRights.stdout.trim(), 'f|t', 'a column grant can exist without a table grant');
  assert.equal(safeRole(), 'f', 'column REFERENCES on a reachable role is included');
  success('REVOKE review_broad FROM review_runtime;');
  assert.equal(safeRole(), 't');
  success('CREATE ROLE review_admin_risk NOLOGIN; GRANT TRUNCATE ON "AgentReviewRequest" TO review_admin_risk; GRANT review_admin_risk TO review_runtime WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;');
  const deniedSet = sqlAs('review_runtime', 'SET ROLE review_admin_risk;');
  assert.notEqual(deniedSet.status, 0, 'SET is initially disabled');
  assert.equal(safeRole(), 'f', 'ADMIN membership is detected even when SET and inheritance are disabled');
  const selfGrant = sqlAs('review_runtime', 'GRANT review_admin_risk TO review_runtime WITH SET TRUE;');
  assert.equal(selfGrant.status, 0, selfGrant.stderr);
  const afterGrant = sqlAs('review_runtime', `SET ROLE review_admin_risk; SELECT has_table_privilege(current_user, 'public."AgentReviewRequest"', 'TRUNCATE');`);
  assert.equal(afterGrant.stdout.trim(), 't', 'ADMIN can enable SET and reach the excessive grant');
  success('REVOKE review_admin_risk FROM review_runtime CASCADE;');
  assert.equal(safeRole(), 't');
  success('CREATE ROLE review_creator NOLOGIN CREATEROLE; GRANT review_creator TO review_runtime WITH INHERIT FALSE, SET TRUE;');
  assert.equal(safeRole(), 'f', 'reachable role-creation privileges are rejected');
  success('REVOKE review_creator FROM review_runtime;');
  assert.equal(safeRole(), 't');
  success('CREATE ROLE review_table_owner NOLOGIN; ALTER TABLE "AgentReviewRequest" OWNER TO review_table_owner; GRANT review_table_owner TO review_runtime;');
  assert.equal(safeRole(), 'f', 'owner-role membership is included');
});
