import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HandoffError, seatFor, seatWriteGuard } from '@/lib/agent-seats';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { assertLegacyIssueWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { findIssueByIdOrKey } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { AGENT_APP_SLUG } from '@/lib/agent-tokens';

export const INBOX_LIMIT = 50;
export const LEASE_MS = 60_000;
/** The states of a run whose session is taken to be alive. */
const LIVE = ['running', 'waiting'];
type Caller = Pick<AppAuthContext, 'user' | 'workspace'>;
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
/** Inbox order: issues to resume, in review with something new, blocked with something new, then the rest. */
const ORDER: Record<string, number> = { resume: 0, in_review: 1, blocked: 2 };

export interface InboxItem {
  issueId: string; issueKey: string | null; title: string; priority: string; category: string;
  reason: 'resume' | 'review_returned' | 'reply' | 'blocker_resolved' | 'assigned'; lastRunAt: string | null;
}

type Status = { category: string | null; isFinal: boolean } | null;
/** The group of a status. One made after the backfill has none: it reads as done when final, otherwise as to do. */
const categoryOf = (status: Status) => status?.category ?? (status?.isFinal ? 'done' : 'todo');
const isDone = (issue: { projectStatus: Status }) => categoryOf(issue.projectStatus) === 'done';
const statusSelect = { select: { category: true, isFinal: true } } as const;

/**
 * What the caller should work on next: the issues assigned to it, and for a seat only those of its project.
 * Never an issue with a run open, and never one whose status is in the done group. Where an issue stands is
 * read from its last run (resume when it ended without finishing, else its outcome); the status group speaks
 * for an issue that never had a run or whose last run finished done. A run that ended before the issue was
 * last assigned to the caller says nothing: the assignment is new work. An issue in review or blocked is
 * offered only when something happened after its reference time: the end of that run, or without one the
 * time it was last assigned to the caller.
 */
export async function seatInbox(context: Caller): Promise<{ items: InboxItem[] }> {
  const me = context.user.id;
  await markLost(context.workspace.id);
  const seat = await seatFor(prisma, context);
  if (seat) {
    await prisma.agentSeat.updateMany({
      where: { id: seat.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { lastSeenAt: new Date() },
    });
  }
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId: context.workspace.id, assigneeId: me, ...(seat && { projectId: seat.projectId }),
      OR: [{ statusId: null }, { projectStatus: { OR: [{ category: { not: 'done' } }, { category: null, isFinal: false }] } }],
    },
    select: {
      id: true, issueKey: true, title: true, priority: true, createdAt: true, projectStatus: statusSelect,
      helpers: { where: { userId: me }, select: { assignedAt: true, approvedAt: true } },
      // One run at most is open per issue, and no run starts while it is, so an open run is always the latest.
      agentRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { outcome: true, endedAt: true } },
    },
  });
  const candidates = issues.flatMap(issue => {
    const last = issue.agentRuns[0];
    if (last && !last.endedAt) return [];
    const category = categoryOf(issue.projectStatus);
    // Every path that assigns writes this row and stamps it again on a later assignment.
    const assigned = issue.helpers[0]?.approvedAt ?? issue.helpers[0]?.assignedAt ?? issue.createdAt;
    const run = last?.endedAt && last.endedAt >= assigned ? last : undefined;
    const stands = !run || run.outcome === 'done' ? category : run.outcome ?? 'resume';
    return [{ issue, last, stands, category: stands === 'resume' ? category : stands, since: run?.endedAt ?? assigned }];
  });

  const waiting = candidates.filter(({ stands }) => stands === 'in_review' || stands === 'blocked').map(({ issue }) => issue.id);
  const replies = { where: { authorId: { not: me } }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } as const;
  const linked = { select: { agentRequestRole: true, reporterId: true, updatedAt: true, projectStatus: statusSelect, comments: replies } } as const;
  const details = new Map((waiting.length ? await prisma.issue.findMany({ where: { id: { in: waiting } }, select: {
    id: true, comments: replies,
    sourceRelations: { select: { relationType: true, targetIssue: linked } },
    targetRelations: { select: { relationType: true, sourceIssue: linked } },
  } }) : []).map(detail => [detail.id, detail]));

  const reasonFor = ({ issue, stands, since }: typeof candidates[number]): InboxItem['reason'] | null => {
    if (stands === 'resume') return 'resume';
    if (stands !== 'in_review' && stands !== 'blocked') return 'assigned';
    const detail = details.get(issue.id);
    if (!detail) return null;
    const after = (date?: Date) => !!date && date > since;
    // shortcut: an issue's last change stands for the time it reached done, so editing a blocker or a review request
    // that was already done offers the waiting issue once more; read the status change itself once every path records one.
    const doneAfter = (other: { projectStatus: Status; updatedAt: Date }) => isDone(other) && after(other.updatedAt);
    const others = [
      ...detail.sourceRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKED_BY', issue: relation.targetIssue })),
      ...detail.targetRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKS', issue: relation.sourceIssue })),
    ];
    // A request is known by the field only filing one sets, and it is the caller's when the caller reported it.
    const requests = others.map(other => other.issue).filter(other => other.agentRequestRole && other.reporterId === me);
    if (stands === 'in_review') {
      if (requests.some(request => request.agentRequestRole === 'review' && doneAfter(request))) return 'review_returned';
      return after(detail.comments[0]?.createdAt) ? 'reply' : null;
    }
    const blockers = others.filter(other => other.blocksMe).map(other => other.issue);
    if (blockers.length && blockers.every(isDone) && blockers.some(doneAfter)) return 'blocker_resolved';
    return [detail, ...requests].some(other => after(other.comments[0]?.createdAt)) ? 'reply' : null;
  };
  const rank = (priority: string) => (PRIORITIES.indexOf(priority.toLowerCase()) + PRIORITIES.length + 1) % (PRIORITIES.length + 1);

  return { items: candidates
    .flatMap(candidate => { const reason = reasonFor(candidate); return reason ? [{ ...candidate, reason }] : []; })
    .sort((a, b) => (ORDER[a.stands] ?? 3) - (ORDER[b.stands] ?? 3) || rank(a.issue.priority) - rank(b.issue.priority)
      || a.issue.createdAt.getTime() - b.issue.createdAt.getTime())
    .slice(0, INBOX_LIMIT)
    .map(({ issue, last, category, reason }) => ({ issueId: issue.id, issueKey: issue.issueKey, title: issue.title, priority: issue.priority,
      category, reason, lastRunAt: last?.endedAt?.toISOString() ?? null })) };
}

const text = (max: number) => z.string().trim().min(1).max(max);
export const checkoutSchema = z.object({ issue: text(128), generation: text(128), runner: text(64) }).strict();
export const runActionSchema = z.object({ event: z.enum(['renew', 'close']), generation: text(128) }).strict();

const RUN = { id: true, issueId: true, generation: true, state: true, outcome: true, note: true, ask: true, usage: true,
  leaseUntil: true, startedAt: true, endedAt: true } as const;
const fenced = () => new HandoffError('run_fenced', 'This run is no longer the one working the issue', 409);

async function markRunLost(tx: Prisma.TransactionClient, runId: string, workspaceId: string, now: Date) {
  const run = await tx.agentRun.findFirst({ where: { id: runId, workspaceId, endedAt: null, state: { in: LIVE }, leaseUntil: { lt: now } },
    select: { id: true, issueId: true, userId: true, seatId: true, issue: { select: { projectId: true } } } });
  if (!run) return false;
  const marked = await tx.agentRun.updateMany({ where: { id: run.id, endedAt: null, state: { in: LIVE }, leaseUntil: { lt: now } }, data: { state: 'lost' } });
  if (marked.count) await tx.issueActivity.create({ data: { action: 'AGENT_RUN_LOST', itemType: 'ISSUE', itemId: run.issueId, userId: run.userId,
    workspaceId, projectId: run.issue.projectId, details: JSON.stringify({ runId: run.id, seatId: run.seatId }) } });
  return !!marked.count;
}

/**
 * Rule 5: a seat's run whose lease lapsed is lost, and stays open, because a lapsed lease does not prove the session
 * stopped. Every read of runs calls this first, so what a caller sees does not depend on who read before. A person's
 * run has no lease and is never lost.
 */
async function markLost(workspaceId: string) {
  const now = new Date();
  const lapsed = { workspaceId, endedAt: null, state: { in: LIVE }, leaseUntil: { lt: now } };
  for (const run of await prisma.agentRun.findMany({ where: lapsed, select: { id: true, issueId: true } })) {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${run.issueId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "AgentRun" WHERE "id" = ${run.id} FOR UPDATE`;
      await markRunLost(tx, run.id, workspaceId, new Date());
    });
  }
}

/**
 * Rule 4: take an issue. One run is open per issue, and only its assignee starts one: a seat on an issue of its
 * project, with a 60 second lease, or a person, with none. The issue moves to its project's first "in progress"
 * status unless it is in one or the project has none.
 */
export async function checkout(context: Caller & Pick<AppAuthContext, 'app'>, input: z.infer<typeof checkoutSchema>) {
  const me = context.user.id;
  const found = await prisma.issue.findFirst({ where: { workspaceId: context.workspace.id, OR: [{ id: input.issue }, { issueKey: input.issue }] }, select: { id: true } });
  if (!found) throw new HandoffError('not_found', 'Issue not found', 404);
  // As on every other issue write: a Forge-connected project's issues change through its Forge board.
  await assertLegacyIssueWriteAllowed(found.id).catch(error => {
    throw error instanceof ForgeProjectWriteError ? new HandoffError('forge_connected_project', error.message, 409) : error;
  });
  await markLost(context.workspace.id);
  try {
    const result = await prisma.$transaction(async tx => {
      // The seat's row, then the issue: the order retiring a seat takes them in. Held to the end, so a seat is not
      // retired and an issue is not reassigned between these checks and the run.
      await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "userId" = ${me} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${found.id} FOR UPDATE`;
      const issue = await tx.issue.findFirst({ where: { id: found.id },
        select: { id: true, projectId: true, assigneeId: true, statusId: true, firstStartedAt: true, projectStatus: { select: { name: true, ...statusSelect.select } } } });
      if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
      await seatWriteGuard(tx, context, issue.projectId);
      if (issue.assigneeId !== me) throw new HandoffError('not_assigned', 'Only the assignee of an issue starts a run on it', 403);
      const open = await tx.agentRun.findFirst({ where: { issueId: issue.id, endedAt: null }, select: { ...RUN, userId: true } });
      if (open) {
        await tx.$queryRaw`SELECT "id" FROM "AgentRun" WHERE "id" = ${open.id} FOR UPDATE`;
        const lost = await markRunLost(tx, open.id, context.workspace.id, new Date());
        // A person has no lease to lose: starting again gives the run that is open.
        if (open.userId === me && !open.leaseUntil && context.app.slug !== AGENT_APP_SLUG) { const { userId: _, ...run } = open; return { run }; }
        if (lost || open.state === 'lost') {
          return { error: new HandoffError('needs_person', 'The last run on this issue was lost: its runner confirms it stopped, or a person clears it', 409) };
        }
        throw new HandoffError('already_running', 'A run is already open on this issue', 409);
      }
      const seat = await seatFor(tx, context);
      const now = new Date();
      const run = await tx.agentRun.create({ data: { workspaceId: context.workspace.id, issueId: issue.id, seatId: seat?.id, userId: me,
        runner: input.runner, generation: input.generation, leaseUntil: seat ? new Date(now.getTime() + LEASE_MS) : null }, select: RUN });
      const status = categoryOf(issue.projectStatus) === 'in_progress' ? null
        : await tx.projectStatus.findFirst({ where: { projectId: issue.projectId, category: 'in_progress', isActive: true }, orderBy: { order: 'asc' } });
      await tx.issue.update({ where: { id: issue.id }, data: { ...(status && { statusId: status.id, statusValue: status.name, status: status.name }),
        lastProgressAt: now, ...(!issue.firstStartedAt && { firstStartedAt: now }) } });
      if (status) {
        await tx.issueActivity.create({ data: { action: 'STATUS_CHANGED', itemType: 'ISSUE', itemId: issue.id, userId: me, workspaceId: context.workspace.id,
          projectId: issue.projectId, fieldName: 'statusId', oldValue: issue.projectStatus?.name, newValue: status.name, oldStatusId: issue.statusId, newStatusId: status.id } });
      }
      return { run };
    });
    if ('error' in result && result.error) throw result.error;
    return result;
  } catch (error) {
    // The index that allows one open run per issue is the rule itself; any insert it refuses is this answer.
    if ((error as { code?: string }).code === 'P2002') throw new HandoffError('already_running', 'A run is already open on this issue', 409);
    throw error;
  }
}

/** A run, read by the account that holds it. */
export async function getRun(context: Caller, runId: string) {
  await markLost(context.workspace.id);
  const run = await prisma.agentRun.findFirst({ where: { id: runId, workspaceId: context.workspace.id, userId: context.user.id }, select: RUN });
  if (!run) throw new HandoffError('not_found', 'Run not found', 404);
  return { run };
}

/**
 * `renew` extends a run's lease while the lease holds and its issue is still assigned to the caller; anything else
 * is fenced and changes nothing. A lost run's lease has lapsed, so it cannot renew its way back. `close` is the runner saying the session is gone: it ends a run that has not ended, lost or not,
 * as `stopped`. It asks nothing of the issue, so it still works after the issue went to someone else. A release
 * seat's unfinished run is left for a person.
 */
export async function actOnRun(context: Caller, runId: string, input: z.infer<typeof runActionSchema>) {
  const me = context.user.id;
  const own = { id: runId, workspaceId: context.workspace.id, userId: me };
  await markLost(context.workspace.id);
  const run = await prisma.agentRun.findFirst({ where: own, select: { issueId: true } });
  if (!run) throw new HandoffError('not_found', 'Run not found', 404);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${run.issueId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "AgentRun" WHERE "id" = ${runId} FOR UPDATE`;
    const now = new Date();
    await markRunLost(tx, runId, context.workspace.id, now);
    const current = await tx.agentRun.findFirst({ where: own, select: { leaseUntil: true, seat: { select: { role: true } } } });
    if (!current) return { error: new HandoffError('not_found', 'Run not found', 404) };
    const live = { ...own, generation: input.generation, endedAt: null };
    if (input.event === 'renew') {
      const renewed = await tx.agentRun.updateMany({
        where: { ...live, state: { in: LIVE }, issue: { assigneeId: me }, OR: [{ leaseUntil: null }, { leaseUntil: { gte: now } }] },
        data: { leaseUntil: current.leaseUntil && new Date(now.getTime() + LEASE_MS) },
      });
      if (!renewed.count) return { error: fenced() };
    } else {
      if (current.seat?.role === 'release') return { error: new HandoffError('needs_person', "A release seat's unfinished run is cleared by a person", 409) };
      const closed = await tx.agentRun.updateMany({ where: live, data: { state: 'stopped', endedAt: now } });
      if (!closed.count) return { error: fenced() };
    }
    return { run: await tx.agentRun.findFirstOrThrow({ where: own, select: RUN }) };
  });
  if ('error' in result && result.error) throw result.error;
  return result;
}

/** A person with the assign permission confirms a lost run's session is gone, so its issue is offered again. */
export async function clearRun(userId: string, issueIdOrKey: string, runId: string) {
  const issue = await findIssueByIdOrKey<{ id: string; workspaceId: string; projectId: string }>(issueIdOrKey,
    { userId, select: { id: true, workspaceId: true, projectId: true } });
  if (!issue || !await prisma.agentRun.findFirst({ where: { id: runId, issueId: issue.id }, select: { id: true } })) {
    throw new HandoffError('not_found', 'Run not found', 404);
  }
  if (!(await checkUserPermission(userId, issue.workspaceId, Permission.ASSIGN_TASK)).hasPermission) {
    throw new HandoffError('forbidden', 'Clearing a run needs the permission to assign issues', 403);
  }
  await markLost(issue.workspaceId);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${issue.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "AgentRun" WHERE "id" = ${runId} FOR UPDATE`;
    await markRunLost(tx, runId, issue.workspaceId, new Date());
    const cleared = await tx.agentRun.updateMany({ where: { id: runId, state: 'lost', endedAt: null }, data: { state: 'stopped', endedAt: new Date() } });
    if (!cleared.count) throw new HandoffError('not_lost', 'Only a lost run is cleared; a run that is held ends by itself or when its lease lapses', 409);
    await tx.issueActivity.create({ data: { action: 'AGENT_RUN_CLEARED', itemType: 'ISSUE', itemId: issue.id, userId, workspaceId: issue.workspaceId,
      projectId: issue.projectId, details: JSON.stringify({ runId }) } });
    return { run: await tx.agentRun.findFirstOrThrow({ where: { id: runId }, select: RUN }) };
  });
}
