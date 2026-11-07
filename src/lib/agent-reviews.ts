import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { hasScope } from '@/lib/oauth-scopes';
import { assertManagedGeneration, HandoffError, issueScope, lockTransferAccessRoots, lockTransferAccessProjects, ownedAgent, visibleHandoff } from '@/lib/agent-handoffs';

const agentName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const id = z.string().min(1).max(128);
const revision = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const privateText = (limit: number) => z.string().trim().min(1).max(limit)
  .refine(value => !/[\u0000\uD800-\uDFFF]/u.test(value), 'Text must be valid Unicode without NUL');
export const createReviewSchema = z.object({ agent: agentName, generation: z.string().uuid().optional(),
  handoffId: id, reviewerAgentId: id, requestId: z.string().uuid(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),
  pullRequestNumber: z.number().int().positive().max(2147483647), revision, content: privateText(16000),
}).strict();
export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ agent: agentName, generation: z.string().uuid().optional(), action: z.literal('claim') }).strict(),
  z.object({ agent: agentName, generation: z.string().uuid().optional(), action: z.literal('reply'),
    verdict: z.enum(['approved', 'changes_requested', 'blocked']), reviewedRevision: revision, content: privateText(16000) }).strict(),
  z.object({ agent: agentName, generation: z.string().uuid().optional(), action: z.literal('hold'), reason: privateText(500), expectedHoldVersion: z.number().int().min(0).max(2147483647) }).strict(),
  z.object({ agent: agentName, generation: z.string().uuid().optional(), action: z.literal('release_hold'), expectedHoldVersion: z.number().int().min(0).max(2147483647) }).strict(),
  z.object({ agent: agentName, generation: z.string().uuid().optional(), action: z.literal('resolve') }).strict(),
  z.object({ agent: agentName, generation: z.string().uuid().optional(), action: z.literal('cancel'), reason: privateText(500) }).strict(),
]);
export const reviewListSchema = z.object({ agent: agentName, limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(4096).regex(/^[A-Za-z0-9_-]+$/).optional(), view: z.literal('incoming-v1').optional() }).strict();
const cursorSchema = z.tuple([id, id, z.string().datetime(), id]);
const incomingCursorSchema = z.tuple([id, id, z.literal('incoming-v1'), z.string().datetime(), id]);
const notFound = () => new HandoffError('review_not_found', 'Review not found or access denied', 404);
function needRead(context: AppAuthContext) {
  if (!hasScope('issues:read', context.token.scopes)) throw new HandoffError('insufficient_scope', 'Reviews require issues:read', 403);
}
function needWrite(context: AppAuthContext) {
  if (!['issues:read', 'issues:write'].every(scope => hasScope(scope, context.token.scopes))) {
    throw new HandoffError('insufficient_scope', 'Reviews require issues:read and issues:write', 403);
  }
}
function assertReviewWorker(value: Prisma.JsonValue | null, generation?: string) {
  assertManagedGeneration(value, generation);
  // Coordinator review dispatch has no correlated admission contract yet.
  // Reject even malformed or stale bindings instead of bypassing coordinator fencing.
  if (value && typeof value === 'object' && !Array.isArray(value) && 'coordinator' in value) {
    throw new HandoffError('coordinator_review_unsupported', 'Coordinator-bound workers cannot mutate reviews yet', 409);
  }
}
async function requireReviewGuards(db: Prisma.TransactionClient) {
  // Hold locks conflicting with trigger-disable DDL until commit. Row-exclusive
  // locks remain compatible with ordinary row writers and other review requests.
  await db.$executeRaw`LOCK TABLE "AgentReviewRequest", "AgentHandoff", "AgentTransferOffer", "AgentRegistration" IN ROW EXCLUSIVE MODE`;
  const rows = await db.$queryRaw<Array<{ ok: boolean }>>`
    SELECT current_setting('session_replication_role') = 'origin'
      AND (SELECT count(*) = 4 FROM (VALUES
        ('public."AgentReviewRequest"'::regclass, 'guard_review_request',
         'CREATE TRIGGER guard_review_request BEFORE INSERT OR UPDATE ON public."AgentReviewRequest" FOR EACH ROW EXECUTE FUNCTION guard_review_request()',
         '01589c2c030d7bcf7d5d02d72f7a8de62b620d002d400a2923a25cb6ac004524'),
        ('public."AgentHandoff"'::regclass, 'guard_pending_review_claim',
         'CREATE TRIGGER guard_pending_review_claim BEFORE UPDATE OF status, "claimedById" ON public."AgentHandoff" FOR EACH ROW EXECUTE FUNCTION guard_pending_review_claim()',
         '9fb1d902ef8a0b0add78b9ee6d92ffa9151e07c08e9e573f77756e85016e2a5c'),
        ('public."AgentTransferOffer"'::regclass, 'guard_review_against_transfer',
         'CREATE TRIGGER guard_review_against_transfer BEFORE INSERT OR UPDATE OF status, "parentId" ON public."AgentTransferOffer" FOR EACH ROW EXECUTE FUNCTION guard_review_against_transfer()',
         'c732ded3599f680a9f724e377627475cfb1c3b5f463a94337a9b74ed17c97bef'),
        ('public."AgentRegistration"'::regclass, 'cancel_reviews_on_owner_delete',
         'CREATE TRIGGER cancel_reviews_on_owner_delete BEFORE DELETE ON public."AgentRegistration" FOR EACH ROW EXECUTE FUNCTION cancel_reviews_on_owner_delete()',
         'd49a070ee6a8e23efc51954aadcb56426e7209cf6772508d7a6445eb83629142')
        ) AS expected(rel, name, definition, source_hash)
        JOIN pg_trigger t ON t.tgrelid = expected.rel AND t.tgname = expected.name
        JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language lang ON lang.oid = p.prolang
        WHERE NOT t.tgisinternal AND t.tgenabled IN ('O', 'A') AND n.nspname = 'public'
          AND p.proname = expected.name AND p.pronargs = 0 AND p.prorettype = 'pg_catalog.trigger'::regtype
          AND lang.lanname = 'plpgsql' AND NOT p.prosecdef AND p.proconfig IS NULL
          AND pg_get_triggerdef(t.oid) = expected.definition
          AND encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = expected.source_hash)
      AND EXISTS (SELECT 1 FROM pg_index i WHERE
        i.indexrelid = to_regclass('public."AgentReviewRequest_one_active_per_handoff"')
        AND i.indrelid = 'public."AgentReviewRequest"'::regclass
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indnkeyatts = 1 AND i.indnatts = 1
        AND i.indexprs IS NULL AND i.indkey[0] = (SELECT a.attnum FROM pg_attribute a
          WHERE a.attrelid = i.indrelid AND a.attname = 'originalHandoffId' AND NOT a.attisdropped)
        AND pg_get_expr(i.indpred, i.indrelid) = '(status = ANY (ARRAY[''pending''::text, ''claimed''::text, ''replied''::text]))'
        AND pg_get_indexdef(i.indexrelid) = 'CREATE UNIQUE INDEX "AgentReviewRequest_one_active_per_handoff" ON public."AgentReviewRequest" USING btree ("originalHandoffId") WHERE (status = ANY (ARRAY[''pending''::text, ''claimed''::text, ''replied''::text]))') AS ok`;
  if (!rows[0]?.ok) throw new HandoffError('review_guard_unavailable', 'Review safety guards are not installed', 503);
}

// Both issue access and any inconsistent cross-project status link must remain safe.
async function accessibleIssue(db: Prisma.TransactionClient, context: AppAuthContext, issueId: string, userId: string) {
  const issue = await db.issue.findFirst({ where: { id: issueId, ...issueScope({ user: { id: userId }, workspace: context.workspace }) },
    select: { id: true, projectId: true, projectStatus: { select: { projectId: true } } } });
  if (!issue || issue.projectStatus && issue.projectStatus.projectId !== issue.projectId) throw notFound();
  return issue;
}

async function recordReviewEvent(db: Prisma.TransactionClient, context: AppAuthContext,
  issue: { id: string; projectId: string }, review: { id: string; originalHandoffId: string }, action: string) {
  await db.issueActivity.create({ data: { itemType: 'ISSUE', itemId: issue.id, workspaceId: context.workspace.id,
    projectId: issue.projectId, userId: context.user.id, action: `AGENT_REVIEW_${action}`,
    details: JSON.stringify({ reviewId: review.id, originalHandoffId: review.originalHandoffId }) } });
}

export async function createReview(context: AppAuthContext, input: z.infer<typeof createReviewSchema>) {
  needWrite(context);
  return prisma.$transaction(async db => {
    await requireReviewGuards(db);
    let owner = await ownedAgent(db, context, input.agent);
    let reviewer = await db.agentRegistration.findFirst({ where: { id: input.reviewerAgentId, workspaceId: context.workspace.id } });
    if (!reviewer || reviewer.id === owner.id) throw notFound();
    const ownerId = owner.id, reviewerId = reviewer.id, ownerUserId = owner.userId, reviewerUserId = reviewer.userId;
    const prior = await visibleHandoff(db, context, owner, input.handoffId);
    await db.$queryRaw`SELECT id FROM "User" WHERE id IN (${ownerUserId}, ${reviewerUserId}) ORDER BY id FOR KEY SHARE`;
    await lockTransferAccessRoots(db, context.workspace.id, prior.issueId, ownerUserId, reviewerUserId);
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND id IN (${ownerId}, ${reviewerId}) ORDER BY id FOR UPDATE`;
    owner = await ownedAgent(db, context, input.agent);
    reviewer = await db.agentRegistration.findFirst({ where: { id: reviewerId, workspaceId: context.workspace.id } });
    if (owner.id !== ownerId || owner.userId !== ownerUserId || !reviewer || reviewer.userId !== reviewerUserId || reviewer.id === owner.id) throw notFound();
    assertReviewWorker(owner.managedWorker, input.generation);
    // Even without a repository row, its project lock fences conflicting FK inserts.
    await lockTransferAccessProjects(db, context.workspace.id, prior.issueId, true);
    const issue = await accessibleIssue(db, context, prior.issueId, owner.userId);
    await accessibleIssue(db, context, prior.issueId, reviewer.userId);
    await db.$queryRaw`SELECT id FROM "Repository" WHERE "projectId" = ${issue.projectId} FOR SHARE`;
    const binding = await db.repository.findUnique({ where: { projectId: issue.projectId }, select: { fullName: true } });
    if (binding && binding.fullName.toLowerCase() !== input.repository.toLowerCase()) {
      throw new HandoffError('repository_mismatch', 'Review repository does not match the project repository', 409);
    }
    await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${prior.id} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
    const current = await visibleHandoff(db, context, owner, input.handoffId);
    const previous = await db.agentReviewRequest.findFirst({ where: { workspaceId: context.workspace.id, ownerAgentId: owner.id, requestId: input.requestId } });
    if (previous) {
      if (previous.originalHandoffId !== current.id || previous.reviewerAgentId !== reviewer.id || previous.repository !== input.repository ||
          previous.pullRequestNumber !== input.pullRequestNumber || previous.revision !== input.revision || previous.requestContent !== input.content) {
        throw new HandoffError('request_conflict', 'This request ID belongs to a different review', 409);
      }
      return previous;
    }
    if (current.issueId !== issue.id || current.status !== 'claimed' || current.claimedById !== owner.id) {
      throw new HandoffError('claim_required', 'The original owner must retain the claim', 409);
    }
    const active = await db.agentReviewRequest.findFirst({ where: { originalHandoffId: current.id, status: { in: ['pending', 'claimed', 'replied'] } }, select: { id: true } });
    if (active) throw new HandoffError('review_already_active', 'This handoff already has an active review. Read it before taking further action.', 409);
    if (await db.agentTransferOffer.findFirst({ where: { parentId: current.id, status: 'pending' }, select: { id: true } })) {
      throw new HandoffError('transfer_offer_pending', 'Accept or cancel the pending transfer offer before requesting review', 409);
    }
    const created = await db.agentReviewRequest.create({ data: { workspaceId: context.workspace.id, issueId: issue.id,
      originalHandoffId: current.id, ownerAgentId: owner.id, reviewerAgentId: reviewer.id, requestId: input.requestId,
      repository: input.repository, pullRequestNumber: input.pullRequestNumber, revision: input.revision, requestContent: input.content } });
    await recordReviewEvent(db, context, issue, created, 'REQUESTED');
    return created;
  });
}

export async function listReviews(context: AppAuthContext, query: z.infer<typeof reviewListSchema>) {
  needRead(context);
  const agent = await ownedAgent(prisma, context, query.agent);
  let position: { createdAt: Date; id: string } | undefined;
  if (query.cursor) {
    try {
      const bytes = Buffer.from(query.cursor, 'base64url');
      if (bytes.toString('base64url') !== query.cursor) throw new Error();
      const raw = JSON.parse(bytes.toString('utf8'));
      const [workspace, agentId, timestamp, lastId] = query.view
        ? (([w, a, , t, i]) => [w, a, t, i] as const)(incomingCursorSchema.parse(raw))
        : cursorSchema.parse(raw);
      const createdAt = new Date(timestamp);
      if (workspace !== context.workspace.id || agentId !== agent.id || createdAt.toISOString() !== timestamp) throw new Error();
      position = { createdAt, id: lastId };
    } catch { throw new HandoffError('invalid_cursor', 'Invalid review cursor'); }
  }
  const items = await prisma.agentReviewRequest.findMany({ where: { workspaceId: context.workspace.id,
    ...(query.view ? { reviewerAgentId: agent.id, status: { in: ['pending', 'claimed'] } }
      : { OR: [{ ownerAgentId: agent.id }, { reviewerAgentId: agent.id }] }), issue: issueScope(context),
    ...(position && { AND: [{ OR: [{ createdAt: { gt: position.createdAt } }, { createdAt: position.createdAt, id: { gt: position.id } }] }] }),
  }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1 });
  const page = items.slice(0, query.limit), last = page.at(-1);
  return { ...(query.view && { view: query.view }), items: page, nextCursor: items.length > query.limit && last ? Buffer.from(JSON.stringify([
    context.workspace.id, agent.id, ...(query.view ? [query.view] : []), last.createdAt.toISOString(), last.id,
  ])).toString('base64url') : null };
}

export async function getReview(context: AppAuthContext, agentNameInput: string, reviewId: string) {
  needRead(context);
  id.parse(reviewId);
  const agent = await ownedAgent(prisma, context, agentName.parse(agentNameInput));
  const review = await prisma.agentReviewRequest.findFirst({ where: { id: reviewId, workspaceId: context.workspace.id,
    OR: [{ ownerAgentId: agent.id }, { reviewerAgentId: agent.id }], issue: issueScope(context) } });
  if (!review) throw notFound();
  return review;
}

export async function actOnReview(context: AppAuthContext, reviewId: string, input: z.infer<typeof reviewActionSchema>) {
  needWrite(context);
  id.parse(reviewId);
  return prisma.$transaction(async db => {
    await requireReviewGuards(db);
    let actor = await ownedAgent(db, context, input.agent);
    const initial = await db.agentReviewRequest.findFirst({ where: { id: reviewId, workspaceId: context.workspace.id,
      OR: [{ ownerAgentId: actor.id }, { reviewerAgentId: actor.id }], issue: issueScope(context) } });
    if (!initial) throw notFound();
    const ownerId = initial.ownerAgentId, reviewerId = initial.reviewerAgentId;
    const counterpartId = actor.id === ownerId ? reviewerId : ownerId;
    const counterpart = counterpartId ? await db.agentRegistration.findFirst({ where: { id: counterpartId, workspaceId: context.workspace.id } }) : null;
    await db.$queryRaw`SELECT id FROM "User" WHERE id IN (${actor.userId}, ${counterpart?.userId ?? actor.userId}) ORDER BY id FOR KEY SHARE`;
    await lockTransferAccessRoots(db, context.workspace.id, initial.issueId, actor.userId, counterpart?.userId ?? actor.userId);
    await db.$queryRaw`SELECT id FROM "AgentRegistration" WHERE "workspaceId" = ${context.workspace.id} AND (id = ${actor.id} OR id = ${counterpartId}) ORDER BY id FOR UPDATE`;
    const originalActorId = actor.id;
    actor = await ownedAgent(db, context, input.agent);
    if (actor.id !== originalActorId) throw notFound();
    assertReviewWorker(actor.managedWorker, input.generation);
    const freshCounterpart = counterpartId ? await db.agentRegistration.findFirst({ where: { id: counterpartId, workspaceId: context.workspace.id } }) : null;
    const allowUnavailableReviewer = actor.id === ownerId && (input.action === 'cancel' || input.action === 'release_hold');
    if (!allowUnavailableReviewer && (!counterpart || !freshCounterpart || counterpart.id !== freshCounterpart.id || counterpart.userId !== freshCounterpart.userId)) throw notFound();
    await lockTransferAccessProjects(db, context.workspace.id, initial.issueId);
    const issue = await accessibleIssue(db, context, initial.issueId, actor.userId);
    if (!allowUnavailableReviewer && freshCounterpart) await accessibleIssue(db, context, initial.issueId, freshCounterpart.userId);
    await db.$queryRaw`SELECT id FROM "AgentHandoff" WHERE id = ${initial.originalHandoffId} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM "AgentReviewRequest" WHERE id = ${reviewId} AND "workspaceId" = ${context.workspace.id} FOR UPDATE`;
    const review = await db.agentReviewRequest.findFirst({ where: { id: reviewId, workspaceId: context.workspace.id,
      OR: [{ ownerAgentId: actor.id }, { reviewerAgentId: actor.id }], issue: issueScope(context) } });
    if (!review || review.ownerAgentId !== ownerId || review.reviewerAgentId !== reviewerId || review.originalHandoffId !== initial.originalHandoffId) throw notFound();
    const original = await db.agentHandoff.findFirst({ where: { id: review.originalHandoffId, workspaceId: context.workspace.id, issueId: review.issueId } });
    const isOwner = actor.id === review.ownerAgentId, isReviewer = actor.id === review.reviewerAgentId;
    if (original && isOwner && input.action === 'resolve' && review.status === 'resolved') return review;
    if (original && isOwner && input.action === 'cancel' && review.status === 'cancelled' && review.cancelReason === input.reason) return review;
    if (original && isReviewer && input.action === 'reply' && ['replied', 'resolved'].includes(review.status) &&
        review.reviewedRevision === input.reviewedRevision && review.responseOutcome === input.verdict && review.responseContent === input.content) return review;
    if (!original || original.status !== 'claimed' || original.claimedById !== review.ownerAgentId) throw new HandoffError('claim_changed', 'The original claim is no longer held by the owner', 409);
    if (input.action === 'claim') {
      if (!isReviewer) throw notFound();
      if (review.status === 'claimed') return review;
      if (review.status !== 'pending') throw new HandoffError('review_closed', 'Review cannot be claimed', 409);
      const updated = await db.agentReviewRequest.update({ where: { id: review.id }, data: { status: 'claimed' } });
      await recordReviewEvent(db, context, issue, updated, 'CLAIMED');
      return updated;
    }
    if (input.action === 'reply') {
      if (!isReviewer) throw notFound();
      if (input.reviewedRevision !== review.revision) throw new HandoffError('revision_mismatch', 'Review must match the requested revision', 409);
      if (review.status !== 'claimed') throw new HandoffError('review_closed', 'A claimed review is required', 409);
      const updated = await db.agentReviewRequest.update({ where: { id: review.id }, data: { status: 'replied', reviewedRevision: input.reviewedRevision,
        responseOutcome: input.verdict, responseContent: input.content } });
      await recordReviewEvent(db, context, issue, updated, 'REPLIED');
      return updated;
    }
    if (!isOwner) throw notFound();
    if (input.action === 'cancel') {
      if (!['pending', 'claimed', 'replied'].includes(review.status)) throw new HandoffError('review_closed', 'Review cannot be cancelled', 409);
      if (review.holdReason) throw new HandoffError('review_held', 'Release the current hold before cancelling', 409);
      const updated = await db.agentReviewRequest.update({ where: { id: review.id }, data: { status: 'cancelled', cancelReason: input.reason } });
      await recordReviewEvent(db, context, issue, updated, 'CANCELLED');
      return updated;
    }
    if (!['pending', 'claimed', 'replied'].includes(review.status)) throw new HandoffError('review_closed', 'Review is closed', 409);
    if (input.action === 'hold' || input.action === 'release_hold') {
      const reason = input.action === 'hold' ? input.reason : null;
      if (review.holdVersion !== input.expectedHoldVersion) throw new HandoffError('hold_changed', 'The hold changed; read the review before taking another action', 409);
      if (review.holdReason === reason) return review;
      if (review.holdVersion === 2147483647) throw new HandoffError('hold_version_exhausted', 'Hold version exhausted', 409);
      const updated = await db.agentReviewRequest.update({ where: { id: review.id }, data: { holdReason: reason, holdVersion: review.holdVersion + 1 } });
      await recordReviewEvent(db, context, issue, updated, reason === null ? 'HOLD_RELEASED' : 'HELD');
      return updated;
    }
    if (review.holdReason || review.status !== 'replied' || review.responseOutcome !== 'approved' || review.reviewedRevision !== review.revision) {
      throw new HandoffError('review_not_ready', 'Resolve an approved matching review only after clearing any explicit hold', 409);
    }
    // This records receipt only. The owner must separately verify live PR head, reviews, holds and CI before merge.
    const updated = await db.agentReviewRequest.update({ where: { id: review.id }, data: { status: 'resolved' } });
    await recordReviewEvent(db, context, issue, updated, 'RESOLVED');
    return updated;
  });
}
