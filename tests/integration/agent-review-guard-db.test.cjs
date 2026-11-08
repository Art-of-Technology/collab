const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

// This suite writes and deletes synthetic rows; never point it at a shared database.
const databaseUrl = process.env.COLLAB_REVIEW_GUARD_TEST_DATABASE_URL;
const required = process.env.COLLAB_REQUIRE_REVIEW_GUARD_DB === '1';
if (required && !databaseUrl) throw new Error('COLLAB_REVIEW_GUARD_TEST_DATABASE_URL is required');
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.toLowerCase().includes('test')) {
    throw new Error('Review guard tests require an explicitly named loopback test database');
  }
}
const client = () => new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const revision = 'a'.repeat(40);
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(p) {
  const tag = `rg${randomUUID().replaceAll('-', '')}`;
  const f = Object.fromEntries(['workspaceOwner', 'owner', 'reviewer', 'workspace', 'project', 'issue', 'ownerAgent', 'reviewerAgent', 'handoff', 'review', 'offer'].map(x => [x, `${tag}-${x}`]));
  for (const id of [f.workspaceOwner, f.owner, f.reviewer]) await p.$executeRaw`INSERT INTO "User" (id, "updatedAt") VALUES (${id}, now())`;
  await p.$executeRaw`INSERT INTO "Workspace" (id, name, slug, "ownerId", "updatedAt") VALUES (${f.workspace}, 'test', ${tag}, ${f.workspaceOwner}, now())`;
  await p.$executeRaw`INSERT INTO "Project" (id, name, slug, "workspaceId", "issuePrefix", "updatedAt") VALUES (${f.project}, 'test', ${tag}, ${f.workspace}, ${tag}, now())`;
  await p.$executeRaw`INSERT INTO "Issue" (id, title, "workspaceId", "projectId", "updatedAt") VALUES (${f.issue}, 'test', ${f.workspace}, ${f.project}, now())`;
  await p.$executeRaw`INSERT INTO "AgentRegistration" (id, "workspaceId", "userId", name, "updatedAt") VALUES (${f.ownerAgent}, ${f.workspace}, ${f.owner}, 'owner', now()), (${f.reviewerAgent}, ${f.workspace}, ${f.reviewer}, 'reviewer', now())`;
  await p.$executeRaw`UPDATE "AgentRegistration" SET "managedWorker" = '{"generation":"synthetic","closed":false}'::jsonb WHERE id = ${f.ownerAgent}`;
  await p.$executeRaw`INSERT INTO "AgentHandoff" (id, "workspaceId", "issueId", "sourceKey", content, status, "claimedById", "updatedAt") VALUES (${f.handoff}, ${f.workspace}, ${f.issue}, ${tag}, 'synthetic', 'claimed', ${f.ownerAgent}, now())`;
  return f;
}

async function cleanup(p, f) {
  await p.$executeRaw`DELETE FROM "AgentReviewRequest" WHERE "workspaceId" = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "AgentTransferOffer" WHERE "workspaceId" = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "AgentHandoff" WHERE "workspaceId" = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "Issue" WHERE "workspaceId" = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "Project" WHERE "workspaceId" = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "AgentRegistration" WHERE "workspaceId" = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "Workspace" WHERE id = ${f.workspace}`;
  await p.$executeRaw`DELETE FROM "User" WHERE id IN (${f.workspaceOwner}, ${f.owner}, ${f.reviewer})`;
}

const createReview = (p, f) => p.$executeRaw`INSERT INTO "AgentReviewRequest" (id, "workspaceId", "issueId", "originalHandoffId", "ownerAgentId", "reviewerAgentId", "requestId", repository, "pullRequestNumber", revision, "requestContent", "updatedAt") VALUES (${f.review}, ${f.workspace}, ${f.issue}, ${f.handoff}, ${f.ownerAgent}, ${f.reviewerAgent}, ${randomUUID()}, 'owner/repository', 7, ${revision}, 'synthetic request', now())`;
const createOffer = (p, f) => p.$executeRaw`INSERT INTO "AgentTransferOffer" (id, "workspaceId", "issueId", "parentId", "senderId", "recipientId", "recipientName", "requestId", content, "updatedAt") VALUES (${f.offer}, ${f.workspace}, ${f.issue}, ${f.handoff}, ${f.ownerAgent}, ${f.reviewerAgent}, 'reviewer', ${randomUUID()}, 'synthetic offer', now())`;
const row = async (p, f) => (await p.$queryRaw`SELECT h.status AS "handoffStatus", h."claimedById", r.status AS "reviewStatus", r."ownerAgentId", r."reviewerAgentId", r."cancelReason" FROM "AgentHandoff" h LEFT JOIN "AgentReviewRequest" r ON r."originalHandoffId" = h.id WHERE h.id = ${f.handoff}`)[0];

async function isolated(fn) {
  const p = client();
  let f;
  try { f = await fixture(p); await fn(p, f); }
  finally { if (f) await cleanup(p, f); await p.$disconnect(); }
}

const dbTest = (name, fn) => test(name, { skip: !databaseUrl, timeout: 20000 }, () => isolated(fn));

dbTest('legacy completion, release, and afterId cannot close a claim while review is active', async (p, f) => {
  await createReview(p, f);
  await assert.rejects(p.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff}`);
  await assert.rejects(p.$executeRaw`UPDATE "AgentHandoff" SET status = 'open', "claimedById" = NULL WHERE id = ${f.handoff}`);
  await assert.rejects(p.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff}`;
    await tx.$executeRaw`INSERT INTO "AgentHandoff" (id, "workspaceId", "issueId", "sourceKey", content, "afterId", "updatedAt") VALUES (${f.offer}, ${f.workspace}, ${f.issue}, ${f.offer}, 'successor', ${f.handoff}, now())`;
  }));
  assert.deepEqual(await row(p, f), { handoffStatus: 'claimed', claimedById: f.ownerAgent, reviewStatus: 'pending', ownerAgentId: f.ownerAgent, reviewerAgentId: f.reviewerAgent, cancelReason: null });
  assert.equal(Number((await p.$queryRaw`SELECT count(*) AS n FROM "AgentHandoff" WHERE id = ${f.offer}`)[0].n), 0);
});

dbTest('review and transfer requests are mutually exclusive in both orders', async (p, f) => {
  await createReview(p, f);
  await assert.rejects(createOffer(p, f));
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'test', "updatedAt" = now() WHERE id = ${f.review}`;
  await createOffer(p, f);
  f.review += '-second';
  await assert.rejects(createReview(p, f));
});

dbTest('only a claimed, approved exact revision with cleared hold can resolve', async (p, f) => {
  await createReview(p, f);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed', "holdReason" = 'owner hold', "holdVersion" = 1 WHERE id = ${f.review}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${'b'.repeat(40)} WHERE id = ${f.review}`);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'resolved', "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review}`);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'resolved' WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff}`;
  assert.equal((await row(p, f)).handoffStatus, 'completed');
});

dbTest('cancelling a claimed review cannot forge a reviewer response', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed' WHERE id = ${f.review}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'synthetic', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`);
  assert.equal((await row(p, f)).reviewStatus, 'claimed');
});

dbTest('hold version rejects skipped, missing and spurious increments', async (p, f) => {
  await createReview(p, f);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H1' WHERE id = ${f.review}`);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H1', "holdVersion" = 2 WHERE id = ${f.review}`);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdVersion" = 1 WHERE id = ${f.review}`);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H1', "holdVersion" = 1 WHERE id = ${f.review}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H2', "holdVersion" = 1 WHERE id = ${f.review}`);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H1', "holdVersion" = 2 WHERE id = ${f.review}`);
});

dbTest('stale hold and release replays cannot overwrite a newer hold with CAS', async (p, f) => {
  await createReview(p, f);
  assert.equal(await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H1', "holdVersion" = 1 WHERE id = ${f.review} AND "holdVersion" = 0`, 1);
  assert.equal(await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review} AND "holdVersion" = 1`, 1);
  assert.equal(await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H2', "holdVersion" = 3 WHERE id = ${f.review} AND "holdVersion" = 2`, 1);
  assert.equal(await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review} AND "holdVersion" = 1`, 0);
  assert.equal(await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'H1', "holdVersion" = 1 WHERE id = ${f.review} AND "holdVersion" = 0`, 0);
  const current = (await p.$queryRaw`SELECT "holdReason", "holdVersion" FROM "AgentReviewRequest" WHERE id = ${f.review}`)[0];
  assert.deepEqual(current, { holdReason: 'H2', holdVersion: 3 });
});

dbTest('a held review cannot be cancelled or cleared and cancelled in one update', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'safety hold', "holdVersion" = 1 WHERE id = ${f.review}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'owner_deleted' WHERE id = ${f.review}`);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'operator', "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review}`);
  assert.equal((await row(p, f)).reviewStatus, 'pending');
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'operator' WHERE id = ${f.review}`;
});

dbTest('account deletion still cancels a held review without losing its hold evidence', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'safety hold', "holdVersion" = 1 WHERE id = ${f.review}`;
  await p.$executeRaw`DELETE FROM "User" WHERE id = ${f.owner}`;
  const current = (await p.$queryRaw`SELECT status, "holdReason", "holdVersion", "cancelReason" FROM "AgentReviewRequest" WHERE id = ${f.review}`)[0];
  assert.deepEqual(current, { status: 'cancelled', holdReason: 'safety hold', holdVersion: 1, cancelReason: 'owner_deleted' });
  assert.equal((await row(p, f)).claimedById, null);
});

dbTest('deleting and re-registering the reviewer cannot retarget the pending review', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`DELETE FROM "User" WHERE id = ${f.reviewer}`;
  await p.$executeRaw`INSERT INTO "User" (id, "updatedAt") VALUES (${f.reviewer}, now())`;
  const replacement = `${f.reviewerAgent}-replacement`;
  await p.$executeRaw`INSERT INTO "AgentRegistration" (id, "workspaceId", "userId", name, "updatedAt") VALUES (${replacement}, ${f.workspace}, ${f.reviewer}, 'reviewer', now())`;
  assert.equal((await row(p, f)).reviewerAgentId, null);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET "reviewerAgentId" = ${replacement} WHERE id = ${f.review}`);
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed' WHERE id = ${f.review}`);
  assert.equal((await row(p, f)).reviewStatus, 'pending');
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'reviewer unavailable' WHERE id = ${f.review}`;
});

dbTest('a deleted reviewer cannot reply to a previously claimed review', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed' WHERE id = ${f.review}`;
  await p.$executeRaw`DELETE FROM "User" WHERE id = ${f.reviewer}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'reviewer deleted' WHERE id = ${f.review}`;
});

dbTest('deleting the owner account cancels review and leaves the original unclaimable', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`DELETE FROM "User" WHERE id = ${f.owner}`;
  assert.deepEqual(await row(p, f), { handoffStatus: 'claimed', claimedById: null, reviewStatus: 'cancelled', ownerAgentId: null, reviewerAgentId: f.reviewerAgent, cancelReason: 'owner_deleted' });
});

dbTest('a review cannot resolve after the reviewer identity is deleted', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed' WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`;
  await p.$executeRaw`DELETE FROM "User" WHERE id = ${f.reviewer}`;
  await assert.rejects(p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'resolved' WHERE id = ${f.review}`);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'reviewer deleted' WHERE id = ${f.review}`;
});

dbTest('deleting a reviewer after resolution preserves user deletion', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed' WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'resolved' WHERE id = ${f.review}`;
  await p.$executeRaw`DELETE FROM "User" WHERE id = ${f.reviewer}`;
  const result = await row(p, f);
  assert.equal(result.reviewStatus, 'resolved');
  assert.equal(result.reviewerAgentId, null);
});

dbTest('rollback of review creation restores the claim and allows a later transfer', async (p, f) => {
  await assert.rejects(p.$transaction(async tx => { await createReview(tx, f); throw new Error('synthetic rollback'); }));
  await createOffer(p, f);
  assert.equal((await row(p, f)).handoffStatus, 'claimed');
});

async function concurrent(p, first, second) {
  const begun = deferred(), release = deferred(), secondStarted = deferred();
  const firstTx = p.$transaction(async tx => { await first(tx); begun.resolve(); await release.promise; }, { timeout: 10000 });
  await begun.promise;
  const secondResult = p.$transaction(async tx => {
    const pid = Number((await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid);
    secondStarted.resolve(pid);
    return second(tx);
  }, { timeout: 10000 }).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
  const pid = await secondStarted.promise;
  let blocked = false;
  try {
    for (let i = 0; i < 80; i++) {
      const waiting = await p.$queryRaw`SELECT cardinality(pg_blocking_pids(${pid}::int)) AS n`;
      if (Number(waiting[0].n) > 0) { blocked = true; break; }
      await delay(25);
    }
  } finally { release.resolve(); }
  await firstTx;
  assert.equal(blocked, true, 'second operation never waited on the first transaction');
  const result = await secondResult;
  if (!result.ok) assert.notEqual(result.error?.meta?.code, '40P01', 'concurrent operations deadlocked');
  return result;
}

dbTest('review creation and legacy close serialize in either order', async (p, f) => {
  let result = await concurrent(p, tx => createReview(tx, f), tx => tx.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff}`);
  assert.equal(result.ok, false);
  assert.equal((await row(p, f)).handoffStatus, 'claimed');
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'test' WHERE id = ${f.review}`;
  f.review += '-second';
  result = await concurrent(p, tx => tx.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff}`, tx => createReview(tx, f));
  assert.equal(result.ok, false);
  assert.equal((await row(p, f)).handoffStatus, 'completed');
});

dbTest('review creation and pending transfer serialize in either order', async (p, f) => {
  let result = await concurrent(p, tx => createReview(tx, f), tx => createOffer(tx, f));
  assert.equal(result.ok, false);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'cancelled', "cancelReason" = 'test' WHERE id = ${f.review}`;
  f.review += '-second';
  result = await concurrent(p, tx => createOffer(tx, f), tx => createReview(tx, f));
  assert.equal(result.ok, false);
});

dbTest('review creation and owner user deletion serialize in either order', async (p, f) => {
  let result = await concurrent(p, tx => createReview(tx, f), tx => tx.$executeRaw`DELETE FROM "User" WHERE id = ${f.owner}`);
  assert.equal(result.ok, true);
  let current = await row(p, f);
  assert.equal(current.reviewStatus, 'cancelled');
  assert.equal(current.cancelReason, 'owner_deleted');
  assert.equal(current.claimedById, null);
  assert.equal(current.handoffStatus, 'claimed');
});

dbTest('owner deletion committed first prevents later review creation', async (p, f) => {
  const result = await concurrent(p, tx => tx.$executeRaw`DELETE FROM "User" WHERE id = ${f.owner}`, tx => createReview(tx, f));
  assert.equal(result.ok, false);
  const current = await row(p, f);
  assert.equal(current.handoffStatus, 'claimed');
  assert.equal(current.claimedById, null);
});

dbTest('owner deletion and a legacy owner close serialize without abandoning the claim', async (p, f) => {
  await createReview(p, f);
  const result = await concurrent(p, tx => tx.$executeRaw`DELETE FROM "User" WHERE id = ${f.owner}`,
    tx => tx.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff} AND "claimedById" = ${f.ownerAgent}`);
  assert.equal(result.ok, true);
  assert.equal(result.value, 0);
  const current = await row(p, f);
  assert.equal(current.reviewStatus, 'cancelled');
  assert.equal(current.cancelReason, 'owner_deleted');
  assert.equal(current.handoffStatus, 'claimed');
  assert.equal(current.claimedById, null);
});

dbTest('explicit hold and resolution serialize in both orders', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'claimed' WHERE id = ${f.review}`;
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'replied', "responseOutcome" = 'approved', "responseContent" = 'ok', "reviewedRevision" = ${revision} WHERE id = ${f.review}`;
  let result = await concurrent(p, tx => tx.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'hold', "holdVersion" = 1 WHERE id = ${f.review}`,
    tx => tx.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'resolved' WHERE id = ${f.review}`);
  assert.equal(result.ok, false);
  assert.equal((await row(p, f)).reviewStatus, 'replied');
  await p.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = NULL, "holdVersion" = 2 WHERE id = ${f.review}`;
  result = await concurrent(p, tx => tx.$executeRaw`UPDATE "AgentReviewRequest" SET status = 'resolved' WHERE id = ${f.review}`,
    tx => tx.$executeRaw`UPDATE "AgentReviewRequest" SET "holdReason" = 'late hold', "holdVersion" = 3 WHERE id = ${f.review}`);
  assert.equal(result.ok, false);
  assert.equal((await row(p, f)).reviewStatus, 'resolved');
});

dbTest('explicit issue deletion cascades the original and its review', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`DELETE FROM "Issue" WHERE id = ${f.issue}`;
  assert.equal(Number((await p.$queryRaw`SELECT count(*) AS n FROM "AgentHandoff" WHERE id = ${f.handoff}`)[0].n), 0);
  assert.equal(Number((await p.$queryRaw`SELECT count(*) AS n FROM "AgentReviewRequest" WHERE id = ${f.review}`)[0].n), 0);
});

dbTest('explicit original handoff deletion cascades its review', async (p, f) => {
  await createReview(p, f);
  await p.$executeRaw`DELETE FROM "AgentHandoff" WHERE id = ${f.handoff}`;
  assert.equal(Number((await p.$queryRaw`SELECT count(*) AS n FROM "AgentReviewRequest" WHERE id = ${f.review}`)[0].n), 0);
});

dbTest('review creation racing explicit issue deletion does not deadlock or strand data', async (p, f) => {
  const issueLocked = deferred(), continueDelete = deferred(), reviewStarted = deferred();
  const deletion = p.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Issue" WHERE id = ${f.issue} FOR UPDATE`;
    issueLocked.resolve();
    await continueDelete.promise;
    return tx.$executeRaw`DELETE FROM "Issue" WHERE id = ${f.issue}`;
  }, { timeout: 10000 }).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
  await issueLocked.promise;
  const review = p.$transaction(async tx => {
    const pid = Number((await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid);
    reviewStarted.resolve(pid);
    return createReview(tx, f);
  }, { timeout: 10000 }).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
  const pid = await reviewStarted.promise;
  let blocked = false;
  try {
    for (let i = 0; i < 80; i++) {
      const waiting = await p.$queryRaw`SELECT cardinality(pg_blocking_pids(${pid}::int)) AS n`;
      if (Number(waiting[0].n) > 0) { blocked = true; break; }
      await delay(25);
    }
  } finally { continueDelete.resolve(); }
  assert.equal(blocked, true, 'review insertion did not wait on the issue lock');
  const [deleted, reviewed] = await Promise.all([deletion, review]);
  assert.equal(deleted.ok, true, 'explicit issue deletion unexpectedly failed');
  assert.equal(reviewed.ok, false, 'a deleted issue must not accept a new review');
  assert.notEqual(reviewed.error?.meta?.code, '40P01', 'review creation deadlocked with issue deletion');
  assert.equal(Number((await p.$queryRaw`SELECT count(*) AS n FROM "AgentReviewRequest" WHERE id = ${f.review}`)[0].n), 0);
});

dbTest('pre-existing repeatable-read legacy snapshot cannot close a newly reviewed claim', async (p, f) => {
  const snapshot = deferred(), release = deferred();
  const oldWriter = p.$transaction(async tx => {
    await tx.$queryRaw`SELECT status FROM "AgentHandoff" WHERE id = ${f.handoff}`;
    snapshot.resolve();
    await release.promise;
    return tx.$executeRaw`UPDATE "AgentHandoff" SET status = 'completed' WHERE id = ${f.handoff}`;
  }, { isolationLevel: 'RepeatableRead', timeout: 10000 }).then(() => ({ ok: true }), error => ({ ok: false, error }));
  await snapshot.promise;
  await createReview(p, f);
  release.resolve();
  assert.equal((await oldWriter).ok, false);
  assert.equal((await row(p, f)).handoffStatus, 'claimed');
});

dbTest('pre-existing repeatable-read transfer writer cannot bypass a new review', async (p, f) => {
  const snapshot = deferred(), release = deferred();
  const oldWriter = p.$transaction(async tx => {
    await tx.$queryRaw`SELECT status FROM "AgentHandoff" WHERE id = ${f.handoff}`;
    snapshot.resolve();
    await release.promise;
    return createOffer(tx, f);
  }, { isolationLevel: 'RepeatableRead', timeout: 10000 }).then(() => ({ ok: true }), error => ({ ok: false, error }));
  await snapshot.promise;
  await createReview(p, f);
  release.resolve();
  assert.equal((await oldWriter).ok, false);
  assert.equal(Number((await p.$queryRaw`SELECT count(*) AS n FROM "AgentTransferOffer" WHERE id = ${f.offer}`)[0].n), 0);
});
