import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { HandoffError, seatFor, seatWriteGuard } from '@/lib/agent-seats';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { assertLegacyIssueWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { AGENT_APP_SLUG } from '@/lib/agent-tokens';
import { findIssueByIdOrKey } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';

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
/** The issues that are not in a status of the done group, as a query reads `categoryOf`. */
export const NOT_DONE = { OR: [{ statusId: null }, { projectStatus: { OR: [{ category: { not: 'done' } }, { category: null, isFinal: false }] } }] };

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
      workspaceId: context.workspace.id, assigneeId: me, ...(seat && { projectId: seat.projectId }), ...NOT_DONE,
    },
    select: {
      id: true, issueKey: true, projectId: true, title: true, priority: true, createdAt: true, projectStatus: statusSelect,
      helpers: { where: { userId: me }, select: { assignedAt: true, approvedAt: true } },
      // One run at most is open per issue, and no run starts while it is, so an open run is always the latest.
      agentRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { outcome: true, endedAt: true } },
    },
  });
  // A run that finished done leaves the issue to its status, so a reopened issue is offered again. A project with no
  // status in the done group cannot show done: there the run says it, until the issue is assigned again.
  const finished = [...new Set(issues.filter(issue => issue.agentRuns[0]?.outcome === 'done').map(issue => issue.projectId))];
  const showsDone = new Set((finished.length ? await prisma.projectStatus.findMany({ where: { projectId: { in: finished }, isActive: true,
    OR: [{ category: 'done' }, { category: null, isFinal: true }] }, select: { projectId: true }, distinct: ['projectId'] }) : []).map(status => status.projectId));
  const candidates = issues.flatMap(issue => {
    const last = issue.agentRuns[0];
    if (last && !last.endedAt) return [];
    const category = categoryOf(issue.projectStatus);
    // Every path that assigns writes this row and stamps it again on a later assignment.
    const assigned = issue.helpers[0]?.approvedAt ?? issue.helpers[0]?.assignedAt ?? issue.createdAt;
    const run = last?.endedAt && last.endedAt >= assigned ? last : undefined;
    if (run?.outcome === 'done' && !showsDone.has(issue.projectId)) return [];
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
/** The headings an exit note has, each on a line of its own. */
const NOTE_HEADINGS = ['Done', 'Decisions', 'Evidence', 'Next'];
/** What each outcome waits for. A finish names at least one of them, and nothing its outcome does not wait for. */
const WAITS_FOR = { done: [], in_review: ['reviewRequest', 'askedUser'], blocked: ['blockedBy', 'askedUser'] } as const;
const amount = z.number().finite().nonnegative(), tally = z.number().int().nonnegative();
const finishSchema = z.object({
  event: z.literal('finish'), generation: text(128), outcome: z.enum(['done', 'in_review', 'blocked']), note: text(16_000),
  status: text(64).optional(), reviewRequest: text(128).optional(), askedUser: text(128).optional(), blockedBy: text(128).optional(),
  // The shape a managed worker reports (`workerSchema` in src/lib/agent-handoffs.ts), so one reader serves both.
  usage: z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), chargedUSD: amount, reservedUSD: amount, estimatedUSD: amount, unknownUSD: amount,
    restarts: z.number().int().min(0).max(100), starts: tally, totalStarts: tally,
    inputTokens: tally, outputTokens: tally, cacheReadTokens: tally, cacheWriteTokens: tally }).strict().optional(),
  alsoFinish: z.array(text(128)).min(1).max(20).optional(),
}).strict();
export const runActionSchema = z.discriminatedUnion('event', [z.object({ event: z.enum(['renew', 'close']), generation: text(128) }).strict(), finishSchema]);

const RUN = { id: true, issueId: true, generation: true, state: true, outcome: true, note: true, ask: true, usage: true,
  leaseUntil: true, startedAt: true, endedAt: true } as const;
const fenced = () => new HandoffError('run_fenced', 'This run is no longer the one working the issue', 409);
/** A finish that is not complete: 422, with what is missing in the reply. */
const incomplete = (code: string, message: string, missing: readonly string[]) => Object.assign(new HandoffError(code, message, 422), { body: { missing } });
const forgeGuard = (...issueIds: string[]) => assertLegacyIssueWriteAllowed(...issueIds).catch(error => {
  throw error instanceof ForgeProjectWriteError ? new HandoffError('forge_connected_project', error.message, 409) : error;
});

/**
 * Rule 5: a seat's run whose lease lapsed is lost, and stays open, because a lapsed lease does not prove the session
 * stopped. Inbox reads and valid run calls start with this sweep; an authorized clear also sweeps. It is the one place a lease is judged: what
 * follows in the call reads the run's state. A lease that lapses after the sweep is judged by the next call's sweep.
 * A person's run has no lease and is never lost.
 */
async function markLost(workspaceId: string) {
  const now = new Date();
  const lapsed = { workspaceId, endedAt: null, state: { in: LIVE }, leaseUntil: { lt: now } };
  for (const run of await prisma.agentRun.findMany({ where: lapsed, select: { id: true, issueId: true, userId: true, seatId: true, issue: { select: { projectId: true } } } })) {
    await prisma.$transaction(async tx => {
      // Checked again with the write: a renew that got in first keeps its run, and two readers report it once.
      const marked = await tx.agentRun.updateMany({ where: { ...lapsed, id: run.id }, data: { state: 'lost' } });
      if (marked.count) await tx.issueActivity.create({ data: { action: 'AGENT_RUN_LOST', itemType: 'ISSUE', itemId: run.issueId, userId: run.userId,
        workspaceId, projectId: run.issue.projectId, details: JSON.stringify({ runId: run.id, seatId: run.seatId }) } });
    });
  }
}

/**
 * Rule 4: take an issue. One run is open per issue, and only its assignee starts one: a seat on an issue of its
 * project, with a 60 second lease, or a person, with none. An agent token that is not a seat starts none. The issue
 * moves to its project's first "in progress" status unless it is in one or the project has none.
 */
export async function checkout(context: Caller & Pick<AppAuthContext, 'app'>, input: z.infer<typeof checkoutSchema>) {
  const me = context.user.id;
  await markLost(context.workspace.id);
  const found = await prisma.issue.findFirst({ where: { workspaceId: context.workspace.id, OR: [{ id: input.issue }, { issueKey: input.issue }] }, select: { id: true } });
  if (!found) throw new HandoffError('not_found', 'Issue not found', 404);
  // As on every other issue write: a Forge-connected project's issues change through its Forge board.
  await forgeGuard(found.id);
  try {
    return await prisma.$transaction(async tx => {
      // The seat's row, then the issue: the order retiring a seat takes them in. Held to the end, so a seat is not
      // retired and an issue is not reassigned between these checks and the run.
      await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "userId" = ${me} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${found.id} FOR UPDATE`;
      const issue = await tx.issue.findFirst({ where: { id: found.id },
        select: { id: true, projectId: true, assigneeId: true, statusId: true, firstStartedAt: true, projectStatus: { select: { name: true, ...statusSelect.select } } } });
      if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
      await seatWriteGuard(tx, context, issue.projectId);
      if (issue.assigneeId !== me) throw new HandoffError('not_assigned', 'Only the assignee of an issue starts a run on it', 403);
      const seat = await seatFor(tx, context);
      // Runs are for seats and people; an agent without a seat would hold a run without a lease.
      if (!seat && context.app.slug === AGENT_APP_SLUG) throw new HandoffError('seat_required', 'An agent token takes an issue only as a seat', 403);
      const open = await tx.agentRun.findFirst({ where: { issueId: issue.id, endedAt: null }, select: { ...RUN, userId: true } });
      if (open) {
        // A person has no lease to lose: starting again gives the run that is open, and changes nothing.
        if (open.userId === me && !open.leaseUntil) { const { userId: _, ...run } = open; return { run }; }
        if (open.state === 'lost') {
          throw new HandoffError('needs_person', 'The last run on this issue was lost: its runner confirms it stopped, or a person clears it', 409);
        }
        throw new HandoffError('already_running', 'A run is already open on this issue', 409);
      }
      const now = new Date();
      const run = await tx.agentRun.create({ data: { workspaceId: context.workspace.id, issueId: issue.id, seatId: seat?.id, userId: me,
        runner: input.runner, generation: input.generation, leaseUntil: seat ? new Date(now.getTime() + LEASE_MS) : null }, select: RUN });
      const status = categoryOf(issue.projectStatus) === 'in_progress' ? null
        : await tx.projectStatus.findFirst({ where: { projectId: issue.projectId, category: 'in_progress', isActive: true }, orderBy: { order: 'asc' } });
      // Starting a run is progress, whether or not the status moves.
      await tx.issue.update({ where: { id: issue.id }, data: { ...(status && { statusId: status.id, statusValue: status.name, status: status.name }),
        lastProgressAt: now, ...(!issue.firstStartedAt && { firstStartedAt: now }) } });
      if (status) {
        await tx.issueActivity.create({ data: { action: 'STATUS_CHANGED', itemType: 'ISSUE', itemId: issue.id, userId: me, workspaceId: context.workspace.id,
          projectId: issue.projectId, fieldName: 'statusId', oldValue: issue.projectStatus?.name, newValue: status.name, oldStatusId: issue.statusId, newStatusId: status.id } });
      }
      return { run };
    });
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
 * `renew` extends the lease of a run that is not lost while its issue is still assigned to the caller; anything else
 * is fenced and changes nothing. A lost run cannot renew its way back. `close` is the runner saying the session is gone: it ends a run that has not ended, lost or not,
 * as `stopped`. It asks nothing of the issue, so it still works after the issue went to someone else. A release
 * seat's unfinished run is left for a person.
 */
export async function actOnRun(context: Caller, runId: string, input: z.infer<typeof runActionSchema>) {
  const me = context.user.id;
  const own = { id: runId, workspaceId: context.workspace.id, userId: me };
  await markLost(context.workspace.id);
  const run = await prisma.agentRun.findFirst({ where: own, select: { issueId: true, seatId: true, runner: true, leaseUntil: true, seat: { select: { role: true } } } });
  if (!run) throw new HandoffError('not_found', 'Run not found', 404);
  const live = { ...own, generation: input.generation, endedAt: null };
  if (input.event === 'finish') {
    const statusUnmapped = await finish(context, { ...run, id: runId }, input);
    return { run: await prisma.agentRun.findFirstOrThrow({ where: own, select: RUN }), statusUnmapped };
  }
  if (input.event === 'renew') {
    // By the state, not the clock: the sweep above judged the lease, and a run marked lost by anyone since stays lost.
    const renewed = await prisma.agentRun.updateMany({
      where: { ...live, state: { in: LIVE }, issue: { assigneeId: me } },
      data: { leaseUntil: run.leaseUntil && new Date(Date.now() + LEASE_MS) },
    });
    if (!renewed.count) throw fenced();
  } else {
    if (run.seat?.role === 'release') throw new HandoffError('needs_person', "A release seat's unfinished run is cleared by a person", 409);
    const closed = await prisma.agentRun.updateMany({ where: live, data: { state: 'stopped', endedAt: new Date() } });
    if (!closed.count) throw fenced();
  }
  return { run: await prisma.agentRun.findFirstOrThrow({ where: own, select: RUN }) };
}

type Finish = z.infer<typeof finishSchema>;
const ISSUE = { id: true, issueKey: true, projectId: true, assigneeId: true, statusId: true, projectStatus: { select: { name: true, ...statusSelect.select } } } as const;

/**
 * Rule 6: a run finishes `done`, `in_review` or `blocked` with an exit note that has all four headings, and says what
 * an issue in review or blocked waits for. It is accepted from the session that holds the run (its account and
 * generation) while the run is not lost and the issue is still the caller's. Anything else is fenced and changes
 * neither the run nor the issue; the note of a run that had not finished is kept on the timeline, so the work is
 * not lost. Returns whether the project had no status to move the issue to.
 */
async function finish(context: Caller, run: { id: string; issueId: string; seatId: string | null; runner: string; seat: { role: string } | null }, input: Finish) {
  const me = context.user.id, workspaceId = context.workspace.id;
  const absent = NOTE_HEADINGS.filter(heading => !new RegExp(`^## ${heading}[ \\t]*$`, 'm').test(input.note));
  if (absent.length) throw incomplete('exit_note_required', `The exit note needs each of these as a heading on its own line: ${absent.map(heading => `## ${heading}`).join(', ')}`, absent);
  const waitsFor: readonly string[] = WAITS_FOR[input.outcome];
  const given = (['reviewRequest', 'askedUser', 'blockedBy'] as const).filter(name => input[name]);
  const stray = given.filter(name => !waitsFor.includes(name));
  if (stray.length) throw new HandoffError('invalid_request', `A run that finishes ${input.outcome} does not take ${stray.join(' or ')}`);
  if (waitsFor.length && !given.length) throw incomplete('exit_state_required', `A run that finishes ${input.outcome} names ${waitsFor.join(' or ')}`, waitsFor);
  if (input.alsoFinish && run.seat?.role !== 'release') throw new HandoffError('role_mismatch', 'Only a release seat finishes other issues with its run', 422);
  if (input.alsoFinish && input.outcome !== 'done') throw incomplete('exit_state_required', 'Other issues are finished with a run only when it is done', ['alsoFinish']);

  const also = input.alsoFinish ?? [];
  const extras = also.length ? await prisma.issue.findMany({ where: { workspaceId, OR: [{ id: { in: also } }, { issueKey: { in: also } }] }, select: { id: true } }) : [];
  if (extras.length !== also.length) throw new HandoffError('not_found', 'alsoFinish names an issue that is not in this workspace, or one issue twice', 404);
  const issueIds = [run.issueId, ...extras.map(extra => extra.id)];
  await forgeGuard(...issueIds);

  const result = await prisma.$transaction(async tx => {
    // The issues, held to the end, so none is reassigned or taken in between. A seat is not retired while its run is open.
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ANY(${issueIds}) ORDER BY "id" FOR UPDATE`;
    const issue = await tx.issue.findFirst({ where: { id: run.issueId }, select: ISSUE });
    if (!issue) return null;
    await seatWriteGuard(tx, context, issue.projectId);
    const now = new Date();
    const holds = { id: run.id, userId: me, generation: input.generation };
    const ended = issue.assigneeId !== me ? 0 : (await tx.agentRun.updateMany({ where: { ...holds, state: { in: LIVE } },
      data: { state: 'finished', outcome: input.outcome, note: input.note, usage: input.usage, endedAt: now } })).count;
    const entry = (target: { id: string; projectId: string }, action: string, details: object) => tx.issueActivity.create({ data: { action, itemType: 'ISSUE', itemId: target.id,
      userId: me, workspaceId, projectId: target.projectId, details: JSON.stringify({ seatId: run.seatId, outcome: input.outcome, content: input.note, ...details }) } });
    if (!ended) {
      // Lost, stopped, or the issue went to someone else: the session did the work, so what it wrote is kept.
      if (await tx.agentRun.findFirst({ where: { ...holds, state: { not: 'finished' } }, select: { id: true } })) await entry(issue, 'AGENT_RUN_LATE', { runId: run.id });
      return null;
    }

    const waits: Record<string, string> = {};
    for (const name of ['reviewRequest', 'blockedBy'] as const) {
      const ref = input[name];
      if (!ref) continue;
      const blocker = name === 'blockedBy';
      // Linked to this issue from either side; a blocker by a blocking link, a review request by being one the caller filed.
      const other = await tx.issue.findFirst({ where: { workspaceId, ...(!blocker && { agentRequestRole: 'review', reporterId: me }), AND: [{ OR: [{ id: ref }, { issueKey: ref }] }, { OR: [
        { sourceRelations: { some: { targetIssueId: issue.id, ...(blocker && { relationType: 'BLOCKS' as const }) } } },
        { targetRelations: { some: { sourceIssueId: issue.id, ...(blocker && { relationType: 'BLOCKED_BY' as const }) } } }] }] },
        select: { id: true, issueKey: true, projectStatus: statusSelect } });
      // One that is done already would never bring this issue back to its inbox.
      if (!other || isDone(other)) throw incomplete('exit_state_required', blocker
        ? `${name} names an issue that is not done and is linked as blocking this one`
        : `${name} names a review request that is not done, was filed by the caller and is linked to this issue`, [name]);
      waits[name] = other.issueKey ?? other.id;
    }
    if (input.askedUser) {
      // A person: someone who can sign in and read the question. An agent's account has no email.
      const asked = input.askedUser === me ? null : await tx.user.findFirst({ where: { id: input.askedUser, email: { not: null },
        OR: [{ ownedWorkspaces: { some: { id: workspaceId } } }, { workspaceMemberships: { some: { workspaceId, status: true } } }] }, select: { id: true } });
      if (!asked) throw incomplete('exit_state_required', 'askedUser names another person who is an active member of this workspace', ['askedUser']);
      waits.askedUser = asked.id;
    }

    // Every issue here is in one project: when it has no status for the outcome, the first issue already says so.
    const unmapped = await settle(tx, me, workspaceId, issue, input, now);
    await entry(issue, 'AGENT_RUN_FINISHED', { runId: run.id, ...waits });
    for (const { id } of extras) {
      const extra = await tx.issue.findFirst({ where: { id }, select: ISSUE });
      if (!extra) throw new HandoffError('not_found', 'alsoFinish names an issue that is not in this workspace', 404);
      const key = extra.issueKey ?? extra.id;
      await seatWriteGuard(tx, context, extra.projectId);
      if (extra.assigneeId !== me) throw new HandoffError('not_assigned', `${key} is not assigned to this seat`, 403);
      if (categoryOf(extra.projectStatus) !== 'todo') throw incomplete('exit_state_required', `${key} is not in a to do status: only issues nobody started are finished with another run`, ['alsoFinish']);
      // The issue is locked, so this is settled; the index that allows one open run per issue stands behind it.
      if (await tx.agentRun.findFirst({ where: { issueId: extra.id, endedAt: null }, select: { id: true } })) throw new HandoffError('already_running', `A run is already open on ${key}`, 409);
      const batched = await tx.agentRun.create({ data: { workspaceId, issueId: extra.id, seatId: run.seatId, userId: me, runner: run.runner, generation: input.generation,
        state: 'finished', outcome: input.outcome, note: input.note, startedAt: now, endedAt: now }, select: { id: true } });
      await settle(tx, me, workspaceId, extra, input, now);
      await entry(extra, 'AGENT_RUN_FINISHED', { runId: batched.id, finishedWith: run.id });
    }
    return { unmapped };
  });
  if (!result) throw fenced();
  return result.unmapped;
}

/**
 * Moves a finished issue to a status of its outcome's group: the one the caller named, else it stays when it is in
 * the group already, else the group's first active status by order, and for done a final one before the others.
 * Returns true when the project has no such status and the issue was left where it is.
 */
async function settle(tx: Prisma.TransactionClient, me: string, workspaceId: string,
  issue: { id: string; projectId: string; statusId: string | null; projectStatus: { name: string; category: string | null; isFinal: boolean } | null }, input: Finish, now: Date) {
  const done = input.outcome === 'done';
  const group = { projectId: issue.projectId, isActive: true, ...(done ? { OR: [{ category: 'done' }, { category: null, isFinal: true }] } : { category: input.outcome }) };
  const status = input.status ? await tx.projectStatus.findFirst({ where: { ...group, name: input.status } })
    : categoryOf(issue.projectStatus) === input.outcome ? issue.projectStatus && { id: issue.statusId!, name: issue.projectStatus.name }
    : await tx.projectStatus.findFirst({ where: group, orderBy: done ? [{ isFinal: 'desc' }, { order: 'asc' }] : { order: 'asc' } });
  if (input.status && !status) throw incomplete('exit_state_required', `"${input.status}" is not an active status of this project's ${input.outcome} group`, ['status']);
  const moves = !!status && status.id !== issue.statusId;
  await tx.issue.update({ where: { id: issue.id }, data: { ...(moves && { statusId: status.id, statusValue: status.name, status: status.name }), lastProgressAt: now } });
  if (moves) {
    await tx.issueActivity.create({ data: { action: 'STATUS_CHANGED', itemType: 'ISSUE', itemId: issue.id, userId: me, workspaceId, projectId: issue.projectId,
      fieldName: 'statusId', oldValue: issue.projectStatus?.name, newValue: status.name, oldStatusId: issue.statusId, newStatusId: status.id } });
  }
  return !status;
}

const REF = { id: true, issueKey: true, title: true, projectId: true, agentRequestRole: true, projectStatus: { select: { name: true, ...statusSelect.select } } } as const;
type Ref = { id: string; issueKey: string | null; title: string; projectId: string; agentRequestRole: string | null; projectStatus: { name: string; category: string | null; isFinal: boolean } | null };
/** An issue as another issue's context names it: enough to tell what it is and whether it is done. */
const toRef = (issue: Ref) => ({ id: issue.id, issueKey: issue.issueKey, title: issue.title, projectId: issue.projectId, status: issue.projectStatus?.name ?? null,
  category: categoryOf(issue.projectStatus), ...(issue.agentRequestRole && { requestRole: issue.agentRequestRole }) });

/**
 * What a fresh session needs to work an issue, in one read: the issue, the exit note of the last run that finished, the
 * comments made after that run ended (all of them when no run has finished), the issues linked as blocking it, the
 * requests linked to it, and for a request the issues it was filed for (the ones it blocks or relates to from its own
 * side, which is how filing links it). A run that ended without a note moves nothing:
 * what was said since the last note is still what the next session lacks. A read like any other: every token that
 * reads the workspace's issues gets it.
 */
export async function runContext(context: Caller, issueIdOrKey: string) {
  const issue = await prisma.issue.findFirst({ where: { workspaceId: context.workspace.id, OR: [{ id: issueIdOrKey }, { issueKey: issueIdOrKey }] }, select: {
    ...REF, description: true, type: true, priority: true, assigneeId: true,
    agentRuns: { where: { state: 'finished' }, orderBy: { endedAt: 'desc' }, take: 1, select: { note: true, endedAt: true } },
    sourceRelations: { select: { relationType: true, targetIssue: { select: REF } } },
    targetRelations: { select: { relationType: true, sourceIssue: { select: REF } } },
  } });
  if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
  const last = issue.agentRuns[0];
  const commentsSince = await prisma.issueComment.findMany({ where: { issueId: issue.id, ...(last?.endedAt && { createdAt: { gt: last.endedAt } }) },
    orderBy: { createdAt: 'asc' }, select: { id: true, content: true, createdAt: true, parentId: true, author: { select: { id: true, name: true } } } });
  const others = [
    ...issue.sourceRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKED_BY', filedFor: relation.relationType === 'BLOCKS' || relation.relationType === 'RELATES_TO', issue: relation.targetIssue })),
    ...issue.targetRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKS', filedFor: false, issue: relation.sourceIssue })),
  ];
  const key = issue.issueKey ?? issue.id;
  return {
    issue: { id: issue.id, issueKey: issue.issueKey, title: issue.title, description: issue.description, type: issue.type, priority: issue.priority, projectId: issue.projectId,
      status: issue.projectStatus?.name ?? null, category: categoryOf(issue.projectStatus), assigneeId: issue.assigneeId, agentRequestRole: issue.agentRequestRole },
    lastExitNote: last?.note ?? null,
    commentsSince,
    blockers: others.filter(other => other.blocksMe).map(other => toRef(other.issue)),
    requests: others.filter(other => other.issue.agentRequestRole).map(other => toRef(other.issue)),
    // Filing a request links it to its source from the request's side: it blocks the source or relates to it.
    requestFor: issue.agentRequestRole ? others.filter(other => other.filedFor && !other.issue.agentRequestRole).map(other => toRef(other.issue)) : [],
    // Where the rest is: the project's context, what was said before the last note, and the timeline, which holds a late exit note.
    commands: [`collab context get --project-id ${issue.projectId}`, `collab comments list ${key}`, `collab issues activity ${key}`],
  };
}

/** The run that is open on an issue, for its page: who holds it, since when, and whether this person may clear it now. */
export async function openRun(userId: string, issueIdOrKey: string) {
  const issue = await findIssueByIdOrKey<{ id: string; workspaceId: string }>(issueIdOrKey, { userId, select: { id: true, workspaceId: true } });
  if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
  await markLost(issue.workspaceId);
  const run = await prisma.agentRun.findFirst({ where: { issueId: issue.id, endedAt: null }, select: { id: true, state: true, startedAt: true, leaseUntil: true, user: { select: { name: true } } } });
  if (!run) return { run: null };
  // What `clearRun` accepts: a lost run, or a run without a lease, from a person who may assign issues.
  const clearable = (run.state === 'lost' || !run.leaseUntil) && (await checkUserPermission(userId, issue.workspaceId, Permission.ASSIGN_TASK)).hasPermission;
  return { run: { id: run.id, state: run.state, startedAt: run.startedAt, by: run.user.name, clearable } };
}

/**
 * A person with the assign permission confirms a run's session is gone: a lost run,
 * or a person's run, which has no lease and so would otherwise stay open for good once it is abandoned.
 */
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
    const cleared = await tx.agentRun.updateMany({ where: { id: runId, endedAt: null, OR: [{ state: 'lost' }, { leaseUntil: null }] }, data: { state: 'stopped', endedAt: new Date() } });
    if (!cleared.count) throw new HandoffError('not_lost', 'A run under a lease is cleared once it is lost; until then its runner holds it', 409);
    await tx.issueActivity.create({ data: { action: 'AGENT_RUN_CLEARED', itemType: 'ISSUE', itemId: issue.id, userId, workspaceId: issue.workspaceId,
      projectId: issue.projectId, details: JSON.stringify({ runId }) } });
    return { run: await tx.agentRun.findFirstOrThrow({ where: { id: runId }, select: RUN }) };
  });
}
