import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { HandoffError, LEAD_CAP, NOT_DONE, STARTED_MOVE_MS, byRoom, fromLead, noRoomDue, seatFor, seatWriteGuard, seatsWithRoom } from '@/lib/agent-seats';
import { connectedRepositories, repositoryStateForSeat, repositoryOfIssue } from '@/lib/agent-repository';
import { ROLE_CATALOGUE } from '@/lib/agent-role-catalogue';
import { earlyAnswers, isStopIssueDone, lastAssigned } from '@/lib/agent-stop-boundary';
import { emailDeclaredStop } from '@/lib/agent-stop-email';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { assertLegacyIssueWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { AGENT_APP_SLUG } from '@/lib/agent-tokens';
import { findIssueByIdOrKey, issueReadAccessWhere, tokenIssueReadWhere } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';

export { NOT_DONE };
export const INBOX_LIMIT = 50;
export const LEASE_MS = 60_000;
/** A child issue that a seat has held this long without starting a run brings its parent back to the lead. */
export const CHILD_IDLE_MS = 2 * 60 * 60_000;
/** The states of a run whose session is taken to be alive. */
const LIVE = ['running', 'waiting'];
type Caller = Pick<AppAuthContext, 'user' | 'workspace'>;
type DB = Prisma.TransactionClient | typeof prisma;
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
/** Inbox order: issues to resume, in review with something new, blocked with something new, then the rest. */
const ORDER: Record<string, number> = { resume: 0, in_review: 1, blocked: 2 };

export interface InboxItem {
  issueId: string; issueKey: string | null; title: string; priority: string; category: string;
  reason: 'resume' | 'review_returned' | 'reply' | 'blocker_resolved' | 'child_done' | 'child_blocked' | 'child_idle' | 'child_no_room' | 'other_child_done' | 'assigned'; lastRunAt: string | null;
  /**
   * With `child_no_room`: the child issues to move, each with the seat it sits on and why that seat has no room, and for
   * a child a run has started on the pull request its last run pushed (CLB-809).
   */
  noRoom?: { issueKey: string | null; seat: string; reason: string; pullRequest?: string }[];
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
 * time it was last assigned to the caller. For a lead seat whose last run on an issue finished blocked, what happened
 * to the issue's children since that run started counts too: one reached done, one's run finished blocked, one
 * has sat with a seat for `CHILD_IDLE_MS` without a run, or one sits on a developer seat that has had no room while another
 * developer seat could take it (`child_no_room`): for `NO_ROOM_MOVE_MS` when no run ever started on it (CLB-780), for
 * `STARTED_MOVE_MS` when its seat's inbox offers it for its next run and its last run pushed its work (`waitsPushed`, CLB-809).
 * A child that reached final done under another issue the lead holds in its project counts if it clears a recorded
 * dependency for a child the lead may place and that child has no open blockers (`other_child_done`, CLB-1196).
 */
export async function seatInbox(context: Caller): Promise<{ items: InboxItem[] }> {
  await markLost(context.workspace.id);
  const seat = await seatFor(prisma, context);
  if (seat) {
    await prisma.agentSeat.updateMany({
      where: { id: seat.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { lastSeenAt: new Date() },
    });
  }
  const inbox = await inboxOf(context.workspace.id, context.user.id, seat);
  return { items: inbox.items.slice(0, INBOX_LIMIT) };
}

/** The read of `seatInbox` alone. It marks no run lost and records no sign of life, so a person's page can ask it for a seat. */
export async function inboxOf(workspaceId: string, me: string, seat: { projectId: string; role: string } | null, db: DB = prisma): Promise<{ items: InboxItem[] }> {
  const issues = await db.issue.findMany({
    where: {
      workspaceId, assigneeId: me, ...(seat && { projectId: seat.projectId }), ...NOT_DONE,
    },
    select: {
      id: true, issueKey: true, projectId: true, title: true, priority: true, createdAt: true, status: true, statusValue: true, projectStatus: statusSelect,
      helpers: { where: { userId: me }, select: { assignedAt: true, approvedAt: true } },
      // One run at most is open per issue, and no run starts while it is, so an open run is always the latest.
      agentRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { id: true, seatId: true, userId: true, outcome: true, startedAt: true, endedAt: true } },
    },
  });
  // A run that finished done leaves the issue to its status, so a reopened issue is offered again. A project with no
  // status in the done group cannot show done: there the run says it, until the issue is assigned again.
  const finished = [...new Set(issues.filter(issue => issue.agentRuns[0]?.outcome === 'done').map(issue => issue.projectId))];
  const showsDone = new Set((finished.length ? await db.projectStatus.findMany({ where: { projectId: { in: finished }, isActive: true,
    OR: [{ category: 'done' }, { category: null, isFinal: true }] }, select: { projectId: true }, distinct: ['projectId'] }) : []).map(status => status.projectId));
  const candidates = issues.flatMap(issue => {
    const last = issue.agentRuns[0];
    if ((last && !last.endedAt) || isStopIssueDone(issue)) return [];
    const category = categoryOf(issue.projectStatus);
    // Every path that assigns writes this row and stamps it again on a later assignment.
    const assigned = issue.helpers[0]?.approvedAt ?? issue.helpers[0]?.assignedAt ?? issue.createdAt;
    const run = last?.endedAt && last.endedAt >= assigned ? last : undefined;
    if (run?.outcome === 'done' && !showsDone.has(issue.projectId)) return [];
    const stands = !run || run.outcome === 'done' ? category : run.outcome ?? 'resume';
    return [{ issue, last, stands, category: stands === 'resume' ? category : stands, since: run?.endedAt ?? assigned, ranBlocked: run?.outcome === 'blocked' ? run.startedAt : null }];
  });

  const waiting = candidates.filter(({ stands }) => stands === 'in_review' || stands === 'blocked').map(({ issue }) => issue.id);
  const replies = { where: { authorId: { not: me } }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } as const;
  const linked = { select: { agentRequestRole: true, reporterId: true, updatedAt: true, projectStatus: statusSelect, comments: replies } } as const;
  const details = new Map((waiting.length ? await db.issue.findMany({ where: { id: { in: waiting } }, select: {
    id: true, comments: replies,
    sourceRelations: { select: { relationType: true, targetIssue: linked } },
    targetRelations: { select: { relationType: true, sourceIssue: linked } },
  } }) : []).map(detail => [detail.id, detail]));
  // `since` is the end of the last run only when that run still says where the issue stands.
  const early = await answeredEarly(db, me, candidates.flatMap(({ issue, last, since }) => last?.seatId && last.userId === me && last.endedAt && last.endedAt >= since
    ? [{ issueId: issue.id, runId: last.id, startedAt: last.startedAt, endedAt: last.endedAt, reply: details.get(issue.id)?.comments[0]?.createdAt }] : []));

  // Only a lead waits for children, so nobody else pays for this read.
  const children = seat?.role === 'lead' && waiting.length ? await db.issue.findMany({ where: { workspaceId, parentId: { in: waiting }, projectId: seat.projectId }, select: {
    id: true, parentId: true, issueKey: true, agentRequestRole: true, createdAt: true, updatedAt: true, assigneeId: true, projectStatus: statusSelect,
    assignee: { select: { agentSeat: { select: { id: true, role: true } } } },
    helpers: { select: { userId: true, assignedAt: true, approvedAt: true, approvedBy: true } },
    agentRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { outcome: true, startedAt: true, endedAt: true } },
  } }) : [];
  const now = Date.now();

  // CLB-780. Developer work is the lead's to move, and only what the lead may move is offered: a child the lead itself
  // placed, on a developer seat. Its seat has had no room for long enough, and another developer seat has a number and
  // is under its limit of issues from the lead: otherwise there is nowhere to move it. A child a run has started on
  // waits longer and moves only between runs, from what its last run pushed (CLB-809).
  const placed = children.filter(child => !isDone(child) && !child.agentRequestRole && child.assignee?.agentSeat?.role === 'developer'
    && child.helpers.some(row => row.userId === child.assigneeId && row.approvedBy === me));
  const full = new Map<string, { seat: string; reason: string; due: Date | null; started: { due: Date | null; pushed: Map<string, Pushed> } | null }>();
  if (seat && placed.length) {
    const developers = await seatsWithRoom(db, seat.projectId, 'developer', new Date(now));
    let free = false;
    for (const developer of developers) {
      if (!free && developer.room.kind === 'room') free = await db.issue.count({ where: fromLead(seat.projectId, me, developer.userId) }) < LEAD_CAP;
    }
    for (const developer of free ? developers : []) {
      const held = placed.filter(child => child.assigneeId === developer.userId);
      if (developer.room.kind !== 'no_room' || !held.length) continue;
      const started = held.some(child => child.agentRuns.length)
        ? { due: await noRoomDue(db, developer, new Date(now), STARTED_MOVE_MS), pushed: await waitsPushed(workspaceId, seat.projectId, developer, db) } : null;
      full.set(developer.userId, { seat: developer.name, reason: developer.room.reason, due: await noRoomDue(db, developer, new Date(now)), started });
    }
  }
  // Once per spell without room: the moment the seat had had none for long enough is after the lead last looked.
  const noRoomOf = (issueId: string, ranBlocked: Date | null) => placed.flatMap(child => {
    const held = ranBlocked && child.parentId === issueId ? full.get(child.assigneeId!) : undefined;
    const pushed = child.agentRuns.length ? held?.started?.pushed.get(child.id) : undefined;
    const due = child.agentRuns.length ? pushed && held?.started?.due : held?.due;
    // shortcut: a started child that waits for a person or another issue when its 30 minutes come, and is ready for its next
    // run only after the lead has looked in that spell, is not offered in that spell; keeping when it became ready would be exact.
    return held && due && due.getTime() <= now && due > ranBlocked! ? [{ issueKey: child.issueKey, seat: held.seat, reason: held.reason, ...(pushed && { pullRequest: pushed.pullRequest }) }] : [];
  });

  // CLB-1196. Only a recorded dependency can connect a completion elsewhere to work this lead may now place.
  const waitingForChildren = new Map(candidates.filter(candidate => candidate.ranBlocked).map(({ issue, ranBlocked }) => [issue.id, ranBlocked!]));
  const loose = children.filter(child => child.parentId && waitingForChildren.has(child.parentId)
    && !isDone(child) && !child.assigneeId && !child.agentRequestRole && (!child.agentRuns.length || child.agentRuns[0].endedAt));
  const placedBefore = new Set((loose.length ? await db.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: { in: loose.map(child => child.id) }, action: 'LEAD_ASSIGNED' },
    select: { itemId: true } }) : []).map(entry => entry.itemId));
  const toPlace = loose.filter(child => !placedBefore.has(child.id)).map(child => child.id);
  const readyEpics = new Set<string>();
  if (seat && toPlace.length) {
    const blockerScope = { workspaceId, ...issueReadAccessWhere(me) };
    // A recorded blocker outside this scope prevents an offer without its status being read.
    const hiddenBlocker = { NOT: { AND: [blockerScope] } };
    const blockerSelect = {
      projectId: true, projectStatus: statusSelect, finishedAt: true,
      parent: { where: { workspaceId, projectId: seat.projectId, assigneeId: me }, select: { id: true } },
    } as const;
    const linkedChildren = await db.issue.findMany({
      where: {
        id: { in: toPlace }, workspaceId, projectId: seat.projectId, assigneeId: null, agentRequestRole: null, ...NOT_DONE,
        sourceRelations: { none: { relationType: 'BLOCKED_BY', targetIssue: hiddenBlocker } },
        targetRelations: { none: { relationType: 'BLOCKS', sourceIssue: hiddenBlocker } },
      },
      select: {
        parentId: true,
        sourceRelations: { where: { relationType: 'BLOCKED_BY', targetIssue: blockerScope }, select: { targetIssue: { select: blockerSelect } } },
        targetRelations: { where: { relationType: 'BLOCKS', sourceIssue: blockerScope }, select: { sourceIssue: { select: blockerSelect } } },
      },
    });
    for (const child of linkedChildren) {
      if (!child.parentId) continue;
      const ranBlocked = waitingForChildren.get(child.parentId);
      if (!ranBlocked) continue;
      const blockers = [...child.sourceRelations.map(relation => relation.targetIssue), ...child.targetRelations.map(relation => relation.sourceIssue)];
      // finishedAt records entry into a final status, so editing an old done blocker does not offer the epic again.
      if (blockers.every(isDone) && blockers.some(blocker => blocker.projectId === seat.projectId && blocker.parent
        && blocker.parent.id !== child.parentId && blocker.finishedAt && blocker.finishedAt > ranBlocked)) {
        readyEpics.add(child.parentId);
      }
    }
  }

  const reasonFor = ({ issue, stands, since, ranBlocked }: typeof candidates[number]): InboxItem['reason'] | null => {
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
    // Only after a run of the lead's that finished blocked: a blocked status alone says nothing about children. They are
    // measured from when that run started, not from its end: what happened while the session ran, it may not have seen.
    const own = ranBlocked ? children.filter(child => child.parentId === issue.id) : [];
    const unseen = (date?: Date | null) => !!date && !!ranBlocked && date > ranBlocked;
    // shortcut: as `doneAfter` above, a done child's last change stands for the time it reached done, so editing one wakes the lead once more.
    if (own.some(child => isDone(child) && unseen(child.updatedAt))) return 'child_done';
    if (own.some(child => !isDone(child) && child.agentRuns[0]?.outcome === 'blocked' && unseen(child.agentRuns[0].endedAt))) return 'child_blocked';
    // Once per assignment: the moment a child had sat too long is after the lead last looked, and has come.
    if (own.some(child => {
      const held = child.helpers.find(row => row.userId === child.assigneeId);
      const assigned = (held?.approvedAt ?? held?.assignedAt ?? child.createdAt).getTime(), due = assigned + CHILD_IDLE_MS;
      return !isDone(child) && child.assignee?.agentSeat && (child.agentRuns[0]?.startedAt.getTime() ?? 0) < assigned && unseen(new Date(due)) && due <= now;
    })) return 'child_idle';
    if (noRoomOf(issue.id, ranBlocked).length) return 'child_no_room';
    if (readyEpics.has(issue.id)) return 'other_child_done';
    return [detail, ...requests].some(other => after(other.comments[0]?.createdAt)) ? 'reply' : null;
  };
  const rank = (priority: string) => (PRIORITIES.indexOf(priority.toLowerCase()) + PRIORITIES.length + 1) % (PRIORITIES.length + 1);

  return { items: candidates
    .flatMap(candidate => { const reason = reasonFor(candidate) ?? (early.has(candidate.issue.id) ? 'reply' as const : null); return reason ? [{ ...candidate, reason }] : []; })
    .sort((a, b) => (ORDER[a.stands] ?? 3) - (ORDER[b.stands] ?? 3) || rank(a.issue.priority) - rank(b.issue.priority)
      || a.issue.createdAt.getTime() - b.issue.createdAt.getTime())
    .map(({ issue, last, category, reason, ranBlocked }) => ({ issueId: issue.id, issueKey: issue.issueKey, title: issue.title, priority: issue.priority,
      category, reason, lastRunAt: last?.endedAt?.toISOString() ?? null, ...(reason === 'child_no_room' && { noRoom: noRoomOf(issue.id, ranBlocked) }) })) };
}

async function runsNamingPerson(db: DB, issueIds: string[]) {
  const runs = new Map<string, string>();
  if (!issueIds.length) return runs;
  const finishes = await db.$queryRaw<{ itemId: string; details: string | null }[]>`SELECT DISTINCT ON ("itemId") "itemId", "details"
    FROM "BoardItemActivity" WHERE "itemType" = 'ISSUE' AND "action" = 'AGENT_RUN_FINISHED' AND "itemId" = ANY(${issueIds}::text[])
    ORDER BY "itemId", "createdAt" DESC, "id" DESC`;
  for (const { itemId, details } of finishes) {
    try {
      const facts = JSON.parse(details ?? 'null');
      if (typeof facts?.askedUser === 'string' && typeof facts.runId === 'string') runs.set(itemId, facts.runId);
    } catch {
      continue;
    }
  }
  return runs;
}

/**
 * Declared stops: the issues whose stop was answered before its run finished, by the rule of `earlyAnswers`, for a run
 * that named a person. `reply` is the issue's latest comment by somebody else: one after the finish is a reply already,
 * so nothing is read unless it came during the run, and then one finish per issue that has such an answer.
 */
async function answeredEarly(db: DB, me: string, stops: { issueId: string; runId: string; startedAt: Date; endedAt: Date; reply?: Date }[]) {
  const during = stops.filter(stop => stop.reply && stop.reply > stop.startedAt && stop.reply <= stop.endedAt);
  const early = await earlyAnswers(db, during.map(stop => ({ ...stop, seatUserId: me })));
  const named = await runsNamingPerson(db, [...early.keys()]);
  return new Set(during.filter(stop => named.get(stop.issueId) === stop.runId).map(stop => stop.issueId));
}

export type Pushed = { runId: string; pullRequest: string; headCommit: string };

/**
 * CLB-809: whether the last run on an issue pushed its work, from what that run recorded and nothing else: it finished,
 * and its finish gave the pull request and the full commit it was left at (`exitFacts`). A pull request exists only for a
 * pushed branch. Null for an issue no run has started on, one with a run open, and one whose last run stopped, was lost,
 * or finished without a pull request: Collab cannot tell that anything was pushed, and nothing moves.
 */
export async function pushedWork(db: DB, issueId: string): Promise<Pushed | null> {
  // One run at most is open per issue, and no run starts while it is, so an open run is always the latest.
  const last = await db.agentRun.findFirst({ where: { issueId }, orderBy: { startedAt: 'desc' }, select: { id: true, state: true } });
  if (last?.state !== 'finished') return null;
  const entry = await db.issueActivity.findFirst({ where: { itemType: 'ISSUE', itemId: issueId, action: 'AGENT_RUN_FINISHED' }, orderBy: { createdAt: 'desc' }, select: { details: true } });
  const facts = JSON.parse(entry?.details ?? '{}');
  return facts.runId === last.id && typeof facts.pullRequest === 'string' && typeof facts.headCommit === 'string'
    ? { runId: last.id, pullRequest: facts.pullRequest, headCommit: facts.headCommit } : null;
}

/**
 * CLB-809: the issues a run has started on that may leave a seat between runs, each with what its last run pushed. An
 * issue qualifies when the seat's inbox offers it for its next run (to resume, a review came back, a reply, a blocker
 * resolved), so none with a run open and none that waits for a person or another issue, and when `pushedWork` has it.
 */
export async function waitsPushed(workspaceId: string, projectId: string, seat: { userId: string; role: string }, db: DB = prisma) {
  const pushed = new Map<string, Pushed>();
  for (const item of (await inboxOf(workspaceId, seat.userId, { projectId, role: seat.role }, db)).items) {
    const work = item.lastRunAt && await pushedWork(db, item.issueId);
    if (work) pushed.set(item.issueId, work);
  }
  return pushed;
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
  verdict: z.enum(['passed', 'failed']).optional(), reviewed: text(200).optional(),
  // Checked in `exitFacts`, so a wrong one is refused like a missing heading, with its name.
  pullRequest: z.string().trim().optional(), headCommit: z.string().trim().optional(), nextStep: z.string().trim().optional(),
  // Checked in `askOf`, so a wrong one is refused like a wrong fact, with the place it is wrong in.
  ask: z.unknown(),
  // The shape a managed worker reports (`workerSchema` in src/lib/agent-handoffs.ts), so one reader serves both.
  usage: z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), chargedUSD: amount, reservedUSD: amount, estimatedUSD: amount, unknownUSD: amount,
    restarts: z.number().int().min(0).max(100), starts: tally, totalStarts: tally,
    inputTokens: tally, outputTokens: tally, cacheReadTokens: tally, cacheWriteTokens: tally }).strict().optional(),
  alsoFinish: z.array(text(128)).min(1).max(20).optional(),
}).strict();
// Keep the exact question while rejecting strings PostgreSQL cannot store without changing them.
const plainText = (max: number) => z.string().max(max).refine(value => !!value.trim() && !/[\u0000\uD800-\uDFFF]/u.test(value), 'Expected nonempty plain text');
export const runActionSchema = z.discriminatedUnion('event', [
  z.object({ event: z.enum(['renew', 'close']), generation: text(128) }).strict(),
  z.object({ event: z.literal('ask'), generation: text(128), ask: plainText(16_000) }).strict(),
  finishSchema,
]);
export const runAnswerSchema = z.object({
  questionId: text(128), decision: z.enum(['approved', 'refused']), text: plainText(4000).transform(value => value.trim()).optional(),
}).strict();
export const stopAnswerSchema = z.object({ content: plainText(4000).transform(value => value.trim()) }).strict();

type Question = { id: string; text: string; answer: { decision: 'approved' | 'refused'; text: string | null; userId: string; at: string } | null };
// The existing JSON column was nullable and had no writer before questions.
const questionsOf = (ask: Prisma.JsonValue) => Array.isArray(ask) ? ask as Question[] : [];
const questionNotOpen = () => new HandoffError('question_not_open', 'This question is no longer open on the run', 409);

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
 * moves to its project's first "in progress" status unless it is in one or the project has none. The reply names the
 * repository of the issue's project, so the runner needs none of its own, or null where Collab works none out.
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
      // A person has no lease to lose: starting again gives the run that is open, and changes nothing.
      const again = !!open && open.userId === me && !open.leaseUntil;
      if (open && !again) {
        if (open.state === 'lost') {
          throw new HandoffError('needs_person', 'The last run on this issue was lost: its runner confirms it stopped, or a person clears it', 409);
        }
        throw new HandoffError('already_running', 'A run is already open on this issue', 409);
      }
      // The repository the session works in, answered for the run that is open as well as for the one started below.
      const { repository, repositories } = await repositoryStateForSeat(tx, issue.projectId, seat);
      if (!repository && repositories.length > 1) {
        throw new HandoffError('repository_required', 'Choose a default repository for agents in Project settings before starting this run.', 409);
      }
      if (open) { const { userId: _, ...run } = open; return { run, repository }; }
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
      return { run, repository };
    });
  } catch (error) {
    // The index that allows one open run per issue is the rule itself; any insert it refuses is this answer.
    if ((error as { code?: string }).code === 'P2002') throw new HandoffError('already_running', 'A run is already open on this issue', 409);
    throw error;
  }
}

const RUN_WITH_KEY = { ...RUN, issue: { select: { issueKey: true } } } as const;
const withKeyAndTime = ({ issue, ...run }: Prisma.AgentRunGetPayload<{ select: typeof RUN_WITH_KEY }>) =>
  ({ run: { ...run, ask: run.endedAt ? null : run.ask, issueKey: issue.issueKey }, now: new Date() });

/** A run, read by the account that holds it. */
export async function getRun(context: Caller, runId: string) {
  await markLost(context.workspace.id);
  const run = await prisma.agentRun.findFirst({ where: { id: runId, workspaceId: context.workspace.id, userId: context.user.id }, select: RUN_WITH_KEY });
  if (!run) throw new HandoffError('not_found', 'Run not found', 404);
  return withKeyAndTime(run);
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
  if (input.event === 'ask') return askOnRun(context, { ...live, issueId: run.issueId, seatId: run.seatId }, input.ask);
  if (input.event === 'finish') {
    const statusUnmapped = await finish(context, { ...run, id: runId }, input);
    return { run: { ...await prisma.agentRun.findFirstOrThrow({ where: own, select: RUN }), ask: null }, statusUnmapped };
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
  if (input.event === 'renew') {
    return withKeyAndTime(await prisma.agentRun.findFirstOrThrow({ where: own, select: RUN_WITH_KEY }));
  }
  return { run: { ...await prisma.agentRun.findFirstOrThrow({ where: own, select: RUN }), ask: null } };
}

async function askOnRun(context: Caller, run: {
  id: string; issueId: string; seatId: string | null; generation: string; endedAt: null; userId: string; workspaceId: string;
}, text: string) {
  const { issueId, seatId, ...live } = run;
  const { userId, workspaceId } = live;
  if (!seatId) throw new HandoffError('seat_required', 'Only a seat run can ask its owner', 403);
  await forgeGuard(issueId);
  return prisma.$transaction(async tx => {
    // Serialize both question writes with finish and assignment. Lock in the same order as checkout.
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${seatId} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${issueId} FOR UPDATE`;
    const current = await tx.agentRun.findFirst({ where: { ...live, state: { in: LIVE }, issue: { assigneeId: userId } },
      select: { ask: true, state: true, issue: { select: { issueKey: true, projectId: true } },
        seat: { select: { owner: { select: { id: true, email: true, agentSeat: { select: { id: true } } } } } } } });
    if (!current) throw fenced();
    await seatWriteGuard(tx, context, current.issue.projectId);
    if (current.state === 'waiting') throw new HandoffError('question_open', 'This run already has an open question', 409);
    const owner = current.seat?.owner;
    if (!owner?.email || owner.agentSeat || !await tx.issue.count({ where: { id: issueId, ...issueReadAccessWhere(owner.id) } })) {
      throw new HandoffError('owner_required', 'The seat needs an owner who can read this issue', 409);
    }

    const question = { id: randomUUID(), text, answer: null };
    const changed = await tx.agentRun.updateMany({ where: { ...live, state: 'running', leaseUntil: { gte: new Date() } },
      data: { state: 'waiting', ask: [...questionsOf(current.ask), question] } });
    if (!changed.count) throw fenced();
    await tx.notification.create({ data: { type: 'ISSUE_RUN_QUESTION', senderId: userId, userId: owner.id,
      content: `asked a question on ${current.issue.issueKey ?? issueId}. Open the issue in Collab and select Activity to answer.` } });
    return withKeyAndTime(await tx.agentRun.findFirstOrThrow({ where: live, select: RUN_WITH_KEY }));
  });
}

/** The browser route has already verified the Collab cookie and origin. Here we bind the answer to the current owner and question. */
export async function answerRunQuestion(userId: string, issueIdOrKey: string, runId: string, input: z.infer<typeof runAnswerSchema>) {
  const issue = await findIssueByIdOrKey<{ id: string; workspaceId: string }>(issueIdOrKey, { userId, select: { id: true, workspaceId: true } });
  const run = issue && await prisma.agentRun.findFirst({ where: { id: runId, issueId: issue.id, workspaceId: issue.workspaceId }, select: { seatId: true } });
  if (!issue || !run) throw new HandoffError('not_found', 'Run not found', 404);
  const { id: issueId, workspaceId } = issue;
  const { seatId } = run;
  if (!seatId) throw questionNotOpen();
  await forgeGuard(issueId);
  await markLost(workspaceId);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "id" = ${seatId} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${issueId} FOR UPDATE`;
    const current = await tx.agentRun.findFirst({ where: { id: runId, issueId, workspaceId, seatId, issue: issueReadAccessWhere(userId) },
      select: { state: true, endedAt: true, ask: true, userId: true,
        issue: { select: { projectId: true, assigneeId: true } },
        seat: { select: { retiredAt: true, projectId: true, owner: { select: { id: true, email: true, agentSeat: { select: { id: true } } } } } } } });
    if (!current) throw new HandoffError('not_found', 'Run not found', 404);
    const owner = current.seat?.owner;
    if (userId !== owner?.id || !owner.email || owner.agentSeat) {
      throw new HandoffError('seat_owner_required', "Only the seat's owner can answer", 403);
    }
    const history = questionsOf(current.ask);
    const question = history.at(-1);
    if (current.state !== 'waiting' || current.endedAt || current.userId !== current.issue.assigneeId
      || current.seat?.retiredAt || current.seat?.projectId !== current.issue.projectId
      || question?.id !== input.questionId || question.answer !== null) throw questionNotOpen();

    const now = new Date();
    const answer = { decision: input.decision, text: input.text ?? null, userId, at: now.toISOString() };
    const changed = await tx.agentRun.updateMany({ where: { id: runId, state: 'waiting', endedAt: null, leaseUntil: { gte: now } },
      data: { state: 'running', ask: [...history.slice(0, -1), { ...question, answer }] } });
    if (!changed.count) throw questionNotOpen();
    await tx.issueActivity.create({ data: { action: 'AGENT_RUN_ANSWERED', itemType: 'ISSUE', itemId: issueId, userId,
      workspaceId, projectId: current.issue.projectId, createdAt: now,
      details: JSON.stringify({ runId, questionId: question.id, decision: answer.decision, answerText: answer.text }) } });
    return { questionId: question.id, answer };
  });
}

type Finish = z.infer<typeof finishSchema>;
const PULL_REQUEST = /^[\w.-]{1,100}\/[\w.-]{1,100}#[1-9]\d{0,9}$/, COMMIT = /^[0-9a-f]{40}$/;
const FACTS = ['pullRequest', 'headCommit', 'nextStep'] as const;

/**
 * Rule 6, the checked part of the note: the facts the next session reads as fields, not out of its text. A pull request
 * (`owner/repository#number`) comes with the full commit it was left at, and neither without the other. A run that
 * finishes in review or blocked says the first thing to do next, in one line; done may leave it out. Anything else is
 * refused like a missing heading, with the fields to correct. The state of the pull request is not taken: it changes
 * after the session ends.
 */
function exitFacts(input: Finish) {
  // A CLI before 0.12.0 cannot send the field: for it the first line under `## Next` is the next step, so its finish is not stranded.
  // A list mark is taken off before a line counts, so an empty list item is not a next step.
  const written = input.outcome === 'done' ? undefined : input.note.split(/^## Next[ \t]*$/m)[1]?.split('\n')
    .map(line => line.trim().replace(/^(?:[-*+]|\d+[.)])(?:\s+|$)/, '')).find(Boolean);
  const nextStep = input.nextStep ?? (written && !/^#+(?:\s|$)/.test(written) ? written.slice(0, 300) : undefined);
  const missing: string[] = [];
  if (input.pullRequest !== undefined ? !PULL_REQUEST.test(input.pullRequest) : input.headCommit !== undefined) missing.push('pullRequest');
  if (input.headCommit !== undefined ? !COMMIT.test(input.headCommit) : input.pullRequest !== undefined) missing.push('headCommit');
  if (nextStep !== undefined ? !nextStep || nextStep.length > 300 || /[\r\n\u2028\u2029]/.test(nextStep) : input.outcome !== 'done') missing.push('nextStep');
  if (missing.length) throw incomplete('exit_note_required', 'The exit note\'s fields are incomplete: pullRequest is owner/repository#number and comes with headCommit, '
    + `the full 40-character commit it was left at; a run that finishes ${input.outcome === 'done' ? 'in review or blocked' : input.outcome} gives nextStep, the first thing to do next, in one line`, missing);
  return { ...(input.pullRequest && { pullRequest: input.pullRequest, headCommit: input.headCommit }), ...(nextStep && { nextStep }) };
}

/** A word a person sends back as a comment: short enough for a button, and one word of a choice, not the choice itself. */
const replyWord = text(40).regex(/^[^\r\n\u2028\u2029/]+$/);
const askSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('decision'), questions: z.array(z.object({ question: text(2000), options: z.array(replyWord).min(2).max(4), suggested: replyWord.optional() }).strict()
    .refine(({ options }) => new Set(options).size === options.length, { path: ['options'] })
    .refine(({ options, suggested }) => suggested === undefined || options.includes(suggested), { path: ['suggested'] })).min(1).max(5) }).strict(),
  z.object({ kind: z.literal('hands'), steps: text(4000), doneWord: replyWord }).strict(),
]);
export type Ask = z.infer<typeof askSchema>;

/**
 * Declared stops: what a finish that names a person asks of them, so Home shows it from fields and not out of a comment.
 * A decision has its questions, each with the reply words to choose from; work for the person's hands has its steps and
 * the word that says they are done. It comes only with `askedUser`. A finish that names a person without it is refused
 * once the deployment sets `COLLAB_STOP_ASK_REQUIRED=true`: set before the seats and the CLI send `ask`, that would
 * refuse every seat that names a person.
 */
function askOf(input: Finish) {
  if (input.ask === undefined) {
    if (input.askedUser && process.env.COLLAB_STOP_ASK_REQUIRED === 'true') throw incomplete('exit_state_required', 'A run that names a person says what it asks of them: '
      + 'ask is a decision with its questions and their reply words, or hands with the steps and the word that says they are done', ['ask']);
    return undefined;
  }
  if (!input.askedUser) throw incomplete('exit_state_required', 'ask is what a person is asked: it comes with askedUser', ['askedUser']);
  const parsed = askSchema.safeParse(input.ask);
  if (!parsed.success) throw incomplete('exit_note_required', 'ask is incomplete: its kind is decision, with 1 to 5 questions of at most 2,000 characters, each with 2 to 4 different options '
    + 'and at most one of them as suggested, or hands, with steps of at most 4,000 characters and doneWord; an option and doneWord have at most 40 characters, no line break and no slash',
  [...new Set(parsed.error.issues.map(issue => ['ask', ...issue.path].join('.')))]);
  return parsed.data;
}
const ISSUE = { id: true, issueKey: true, projectId: true, assigneeId: true, statusId: true, agentRequestRole: true, projectStatus: { select: { name: true, ...statusSelect.select } } } as const;

/**
 * Rule 6: a run finishes `done`, `in_review` or `blocked` with an exit note that has all four headings and the facts
 * `exitFacts` checks, and says what an issue in review or blocked waits for. It is accepted from the session that
 * holds the run (its account and generation) while the run is not lost and the issue is still the caller's. Anything else is fenced and changes
 * neither the run nor the issue; the note of a run that had not finished is kept on the timeline, so the work is
 * not lost. A security request finishes done only with its verdict, passed or failed, and what was reviewed (a commit
 * or a pull request); the verdict is written to the request's timeline and to that of the issue it was filed for.
 * Returns whether the project had no status to move the issue to.
 */
async function finish(context: Caller, run: { id: string; issueId: string; seatId: string | null; runner: string; seat: { role: string } | null }, input: Finish) {
  const me = context.user.id, workspaceId = context.workspace.id;
  const absent = NOTE_HEADINGS.filter(heading => !new RegExp(`^## ${heading}[ \\t]*$`, 'm').test(input.note));
  if (absent.length) throw incomplete('exit_note_required', `The exit note needs each of these as a heading on its own line: ${absent.map(heading => `## ${heading}`).join(', ')}`, absent);
  const facts = exitFacts(input);
  const waitsFor: readonly string[] = WAITS_FOR[input.outcome];
  const given = (['reviewRequest', 'askedUser', 'blockedBy'] as const).filter(name => input[name]);
  const stray = given.filter(name => !waitsFor.includes(name));
  if (stray.length) throw new HandoffError('invalid_request', `A run that finishes ${input.outcome} does not take ${stray.join(' or ')}`);
  if (input.outcome !== 'done' && (input.verdict || input.reviewed)) throw new HandoffError('invalid_request', 'Only a security request that finishes done takes a verdict');
  const ask = askOf(input);
  // A lead waits for the children of its issue: blocked with nothing named. Whether one of them is open is decided with the finish, below.
  const forChildren = input.outcome === 'blocked' && !given.length && run.seat?.role === 'lead';
  if (waitsFor.length && !given.length && !forChildren) throw incomplete('exit_state_required', `A run that finishes ${input.outcome} names ${waitsFor.join(' or ')}`, waitsFor);
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
      userId: me, workspaceId, projectId: target.projectId, details: JSON.stringify({ seatId: run.seatId, outcome: input.outcome, content: input.note, ...facts, ...details }) } });
    if (!ended) {
      // Lost, stopped, or the issue went to someone else: the session did the work, so what it wrote is kept.
      if (await tx.agentRun.findFirst({ where: { ...holds, state: { not: 'finished' } }, select: { id: true } })) await entry(issue, 'AGENT_RUN_LATE', { runId: run.id });
      return null;
    }
    if (forChildren) {
      // The children of the lead's project, as its inbox reads them. One that finishes right after this count still
      // brings the issue back: the inbox measures children from when this run started, not from when it ends.
      if (!await tx.issue.count({ where: { workspaceId, parentId: issue.id, projectId: issue.projectId, ...NOT_DONE } })) {
        throw incomplete('exit_state_required', `A run that finishes ${input.outcome} names ${waitsFor.join(' or ')}; a lead names neither only while a child issue is not done`, waitsFor);
      }
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

    const security = issue.agentRequestRole === 'security' && input.outcome === 'done';
    const lacking = security ? (['verdict', 'reviewed'] as const).filter(name => !input[name]) : [];
    if (lacking.length) throw incomplete('exit_state_required', 'A security request is finished done with a verdict, passed or failed, and reviewed: the commit or pull request that was read', lacking);
    if (!security && (input.verdict || input.reviewed)) throw new HandoffError('invalid_request', 'Only a security request that finishes done takes a verdict');

    // Every issue here is in one project: when it has no status for the outcome, the first issue already says so.
    const unmapped = await settle(tx, me, workspaceId, issue, input, now);
    await entry(issue, 'AGENT_RUN_FINISHED', { runId: run.id, ...waits, ...(ask && { ask }) });
    if (security) {
      // The issue the request was filed for is read from what filing wrote, never from the request's links: a link
      // somebody added later would put a verdict on an issue nobody reviewed. A request that asked for a review of
      // its own has a second such entry, which names that request and no issue it is for.
      const filedFor = (await tx.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: issue.id, action: 'SECURITY_REQUESTED' }, select: { details: true } }))
        .map(row => JSON.parse(row.details ?? '{}')).find(details => typeof details.forIssueId === 'string');
      const source = filedFor ? await tx.issue.findFirst({ where: { id: filedFor.forIssueId, workspaceId }, select: { id: true, projectId: true } }) : null;
      // The request's own entry also names the issue it was filed for, so each timeline links to the other side.
      await tx.issueActivity.createMany({ data: [issue, ...(source ? [source] : [])].map(target => ({ action: 'SECURITY_VERDICT', itemType: 'ISSUE', itemId: target.id,
        userId: me, workspaceId, projectId: target.projectId, details: JSON.stringify({ verdict: input.verdict, reviewed: input.reviewed,
          requestId: issue.id, requestKey: issue.issueKey ?? issue.id, runId: run.id, seatId: run.seatId, ...(target === issue && source && { forIssueKey: filedFor.forIssueKey }) }) })) });
    }
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
  // The person is told once the finish is committed and the issues are no longer held: an email in the lock would hold them for as long as the mail provider takes.
  if (ask && input.askedUser) await emailDeclaredStop({ runId: run.id, userId: input.askedUser, ask });
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
 * What a fresh session needs to work an issue, in one read: the issue, the repository of its project (null when none is
 * worked out or the assignee's role needs none), the exit note of the last run that finished and
 * its checked facts (the pull request, the commit it was left at, the next step; null where it gave none), the
 * comments made after that run ended (all of them when no run has finished), the issues linked as blocking it, the
 * requests linked to it (a security request with its verdict, once it has one), and for a request the issues it was
 * filed for (the ones it blocks or relates to from its own side, which is how filing links it). An issue with child issues
 * lists them, each with its assignee and how its last run ended; when the issue is a lead seat's, the project's other
 * seats come with it, each with the open issues it holds from the lead, and the limit. The lead itself gets each seat's
 * owner, room and the owner's open runs too, and the seats of one role in the order to prefer (`byRoom`); room is its
 * owner's figure, so no other reader is given it or the order that would say it. When the last run that finished was
 * another account's, `movedFrom` names that seat, what its last run pushed and what to do before anything else (CLB-809). A run that ended without a note moves nothing:
 * what was said since the last note is still what the next session lacks. `instructions` are the three layers of the
 * assigned seat's instructions, platform, organisation and seat, each present and empty when it has nothing (CLB-607).
 * A read like any other: a token gets it for an issue of the workspace its account may read (the issue read rule), and
 * the linked issues and children it lists are those the account may read; any other issue is not found.
 */
export async function runContext(context: Caller, issueIdOrKey: string) {
  const readable = tokenIssueReadWhere(context);
  const issue = await prisma.issue.findFirst({ where: { ...readable, OR: [{ id: issueIdOrKey }, { issueKey: issueIdOrKey }] }, select: {
    ...REF, description: true, type: true, priority: true, assigneeId: true,
    agentRuns: { where: { state: 'finished' }, orderBy: { endedAt: 'desc' }, take: 1, select: { id: true, note: true, startedAt: true, endedAt: true, userId: true, seat: { select: { name: true } } } },
    sourceRelations: { where: { targetIssue: readable }, select: { relationType: true, targetIssue: { select: REF } } },
    targetRelations: { where: { sourceIssue: readable }, select: { relationType: true, sourceIssue: { select: REF } } },
    // shortcut: the first 100 children, oldest first; page them when an epic outgrows that.
    children: { where: readable, orderBy: { createdAt: 'asc' }, take: 100, select: { ...REF, assigneeId: true, assignee: { select: { name: true } },
      agentRuns: { orderBy: { startedAt: 'desc' }, take: 1, select: { outcome: true, endedAt: true } } } },
  } });
  if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
  const lead = issue.assigneeId ? await prisma.agentSeat.findFirst({ where: { userId: issue.assigneeId, projectId: issue.projectId, role: 'lead', retiredAt: null }, select: { userId: true } }) : null;
  const listed = lead ? (await seatsWithRoom(prisma, issue.projectId)).filter(seat => seat.userId !== lead.userId) : [];
  const asLead = lead?.userId === context.user.id;
  // Each role in its own order, in the places its seats had in the list: with nothing known the list is the one it was.
  const queues = new Map([...new Set(listed.map(seat => seat.role))].map(role => [role, byRoom(listed.filter(seat => seat.role === role))]));
  const seats = asLead ? listed.map(seat => queues.get(seat.role)!.shift()!) : listed;
  const last = issue.agentRuns[0];
  // The checked facts of that run's note are where finishing wrote them: in its entry on the timeline.
  const entry = last && await prisma.issueActivity.findFirst({ where: { itemType: 'ISSUE', itemId: issue.id, action: 'AGENT_RUN_FINISHED' }, orderBy: { createdAt: 'desc' }, select: { details: true } });
  const facts = JSON.parse(entry?.details ?? '{}');
  // CLB-809: the last finished run was another account's, so the issue came here from another seat. A runner that never
  // had the issue starts from its pushed branch; one that had it before starts from what it holds, so the session brings
  // the pushed work in first.
  const pushed = last && last.userId !== issue.assigneeId && facts.runId === last.id && typeof facts.pullRequest === 'string' && typeof facts.headCommit === 'string'
    ? { pullRequest: facts.pullRequest as string, headCommit: facts.headCommit as string } : null;
  const [, repo, number] = pushed?.pullRequest.match(/^(.+)#(\d+)$/) ?? [];
  const from = last?.seat?.name ?? 'another account';
  const repository = await repositoryOfIssue(prisma, issue.projectId, issue.assigneeId);
  // The instructions are those of the seat that works the issue: its role's, then what this workspace adds for the role (CLB-608),
  // then the seat's own, saved on its page (CLB-610). A seat with the workspace's own role has its base role in `role`, and
  // that role's instructions come before the seat's (CLB-626), also when the role is retired.
  const worker = issue.assigneeId ? await prisma.agentSeat.findFirst({ where: { userId: issue.assigneeId, workspaceId: context.workspace.id, retiredAt: null },
    select: { role: true, ownerId: true, instructions: true, customRole: { select: { instructions: true } } } }) : null;
  const organisation = worker ? (await prisma.agentRoleInstructions.findUnique({ where: { workspaceId_role: { workspaceId: context.workspace.id, role: worker.role } }, select: { text: true } }))?.text ?? '' : '';
  // A system admin's edit of the role's prompt (CLB-916): the version in force when the open run started, so a run keeps
  // what it received; with no run open, the latest. None, or one with no text, means the repository's text.
  const open = worker ? await prisma.agentRun.findFirst({ where: { issueId: issue.id, endedAt: null, state: { in: LIVE } }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }) : null;
  const platform = worker ? (await prisma.agentPlatformPrompt.findFirst({ where: { role: worker.role, createdAt: { lte: open?.startedAt ?? new Date() } }, orderBy: { version: 'desc' }, select: { text: true } }))?.text : null;
  const matches = repo ? (await connectedRepositories(prisma, issue.projectId)).filter(row => row.name.toLowerCase() === repo.toLowerCase()) : [];
  const elsewhere = !!pushed && (matches.length !== 1 || matches[0].id !== repository?.id);
  const branch = !elsewhere && repo ? (await prisma.pullRequest.findFirst({ where: { githubPrId: Number(number), repository: { id: matches[0].id, projectId: issue.projectId, isActive: true } },
    select: { headBranchName: true } }))?.headBranchName ?? null : null;
  // A run that named a person may have been answered before it finished (`earlyAnswers`): the session that answer brings
  // back finds it here, with what was said from then on. The seat itself wrote nothing between that answer and its finish.
  const answer = last?.seat && last.endedAt && facts.runId === last.id && typeof facts.askedUser === 'string'
    ? (await earlyAnswers(prisma, [{ issueId: issue.id, seatUserId: last.userId, startedAt: last.startedAt, endedAt: last.endedAt }])).get(issue.id) : undefined;
  const commentsSince = await prisma.issueComment.findMany({ where: { issueId: issue.id, ...(last?.endedAt && { createdAt: answer ? { gte: answer } : { gt: last.endedAt } }) },
    orderBy: { createdAt: 'asc' }, select: { id: true, content: true, createdAt: true, parentId: true, author: { select: { id: true, name: true } } } });
  const others = [
    ...issue.sourceRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKED_BY', filedFor: relation.relationType === 'BLOCKS' || relation.relationType === 'RELATES_TO', issue: relation.targetIssue })),
    ...issue.targetRelations.map(relation => ({ blocksMe: relation.relationType === 'BLOCKS', filedFor: false, issue: relation.sourceIssue })),
  ];
  const key = issue.issueKey ?? issue.id;
  const reviewed = others.filter(other => other.issue.agentRequestRole === 'security').map(other => other.issue.id);
  // Oldest first, so a request that was reopened and judged again shows its last verdict.
  const verdicts = new Map<string, { verdict: string; reviewed: string }>();
  for (const row of reviewed.length ? await prisma.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: { in: reviewed }, action: 'SECURITY_VERDICT' },
    orderBy: { createdAt: 'asc' }, select: { itemId: true, details: true } }) : []) {
    const details = JSON.parse(row.details ?? '{}');
    if (details.requestId === row.itemId) verdicts.set(row.itemId, details);
  }
  const history = asLead ? await prisma.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: { in: issue.children.map(child => child.id) }, action: { in: ['LEAD_ASSIGNED', 'STORY_MOVED'] }, oldValue: { not: '' } }, select: { itemId: true, oldValue: true } }) : [];
  const security = issue.agentRequestRole === 'security';
  return {
    issue: { id: issue.id, issueKey: issue.issueKey, title: issue.title, description: issue.description, type: issue.type, priority: issue.priority, projectId: issue.projectId,
      status: issue.projectStatus?.name ?? null, category: categoryOf(issue.projectStatus), assigneeId: issue.assigneeId, agentRequestRole: issue.agentRequestRole },
    repository,
    instructions: ROLE_CATALOGUE.instructionLayers(worker?.role ?? null, { ownerId: worker?.ownerId ?? null, platform, organisation,
      customRole: worker?.customRole?.instructions, seat: worker?.instructions ?? '' }),
    lastExitNote: last?.note ?? null,
    lastExitFacts: last ? Object.fromEntries(FACTS.map(name => [name, facts.runId === last.id && typeof facts[name] === 'string' ? facts[name] : null])) : null,
    movedFrom: last && last.userId !== issue.assigneeId ? { seat: last.seat?.name ?? null, pullRequest: pushed?.pullRequest ?? null, headCommit: pushed?.headCommit ?? null, branch,
      first: elsewhere ? `This issue was moved here from ${from}, and its last run recorded ${pushed!.pullRequest}, which cannot be safely matched to the repository this seat works in. `
        + 'Do not merge anything: finish the run blocked and ask a person where the work continues.'
        : pushed ? `This issue was moved here from ${from}. Before anything else: git fetch origin, then git merge ${branch ? `origin/${branch}` : pushed.headCommit}`
        + ` (the branch of ${pushed.pullRequest}, left at ${pushed.headCommit}). Continue from there and from the last exit note. What ${from} did not push is not part of the work any more.`
        : `This issue was moved here from ${from}, and its last run recorded no pull request: Collab cannot tell what was pushed. Read the last exit note and find the issue's branch before you change anything.` } : null,
    commentsSince,
    blockers: others.filter(other => other.blocksMe).map(other => toRef(other.issue)),
    requests: others.filter(other => other.issue.agentRequestRole).map(other => {
      const judged = verdicts.get(other.issue.id);
      return { ...toRef(other.issue), ...(judged && { verdict: judged.verdict, reviewed: judged.reviewed }) };
    }),
    // Filing a request links it to its source from the request's side: it blocks the source or relates to it.
    requestFor: issue.agentRequestRole ? others.filter(other => other.filedFor && !other.issue.agentRequestRole).map(other => toRef(other.issue)) : [],
    ...(issue.children.length && { children: issue.children.map(child => ({ ...toRef(child), assigneeId: child.assigneeId, assignee: child.assignee?.name ?? null,
      ...(asLead && { movedOff: history.filter(row => row.itemId === child.id).map(row => row.oldValue).filter(Boolean) }),
      lastRun: child.agentRuns[0] ? child.agentRuns[0].endedAt ? child.agentRuns[0].outcome ?? 'stopped' : 'running' : null })) }),
    ...(lead && { lead: { cap: LEAD_CAP, seats: await Promise.all(seats.map(async seat => ({ userId: seat.userId, name: seat.name, role: seat.role,
      openFromLead: await prisma.issue.count({ where: fromLead(issue.projectId, lead.userId, seat.userId) }),
      ...(asLead && { owner: seat.owner, room: seat.room, openRuns: seat.openRuns }) }))) } }),
    // Where the rest is: the project's context, what was said before the last note, and the timeline, which holds a late exit note.
    commands: [`collab context get --project-id ${issue.projectId}`, `collab comments list ${key}`, `collab issues activity ${key}`,
      `collab seat request --from-issue ${key} --role review|release|security|developer --title TITLE --body-file FILE`,
      ...(lead ? ['collab issues update CHILD_KEY --assignee-id SEAT_USER_ID'] : []),
      `collab run finish RUN_ID --generation GENERATION --outcome done|in_review|blocked --note-file FILE --next-step 'ONE LINE' [--pull-request OWNER/REPO#NUMBER --head-commit FULL_HASH]${security ? ' --verdict passed|failed --reviewed COMMIT_OR_PULL_REQUEST' : ''}`],
  };
}

/**
 * The security requests filed for an issue, oldest first, each where it stands: `open`, `passed` or `failed` with what
 * was reviewed and by whom, or `closed` when it was closed without a verdict (a person moved it to done by hand).
 * Read from what filing and finishing wrote on the issue's timeline.
 */
export async function securityReviews(issue: { id: string; workspaceId: string }) {
  const rows = await prisma.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: issue.id, action: { in: ['SECURITY_REQUESTED', 'SECURITY_VERDICT'] } },
    orderBy: { createdAt: 'asc' }, select: { action: true, details: true, user: { select: { name: true } } } });
  const reviews = new Map<string, { requestKey: string; state: string; reviewed?: string; by?: string | null }>();
  for (const row of rows) {
    const details = JSON.parse(row.details ?? '{}');
    // A request's own "asked" entry names the issue it is for, not a request, and its own verdict is of no request
    // filed for it: only what was filed for this issue is listed.
    if (typeof details.requestId !== 'string' || (row.action === 'SECURITY_VERDICT' && !reviews.has(details.requestId))) continue;
    reviews.set(details.requestId, row.action === 'SECURITY_VERDICT'
      ? { requestKey: details.requestKey, state: details.verdict, reviewed: details.reviewed, by: row.user.name }
      : { requestKey: details.requestKey, state: 'open' });
  }
  const waiting = [...reviews].filter(([, review]) => review.state === 'open').map(([id]) => id);
  const open = new Set((waiting.length ? await prisma.issue.findMany({ where: { id: { in: waiting }, workspaceId: issue.workspaceId, ...NOT_DONE }, select: { id: true } }) : []).map(row => row.id));
  return [...reviews].map(([id, review]) => review.state === 'open' && !open.has(id) ? { ...review, state: 'closed' } : review);
}

/**
 * For an issue's page: the run that is open on it (who holds it, since when, and whether this person may clear it
 * now) and its security reviews.
 */
export async function openRun(userId: string, issueIdOrKey: string, browserSession: boolean) {
  const issue = await findIssueByIdOrKey<{ id: string; workspaceId: string }>(issueIdOrKey, { userId, select: { id: true, workspaceId: true } });
  if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
  await markLost(issue.workspaceId);
  const security = await securityReviews(issue);
  const run = await prisma.agentRun.findFirst({ where: { issueId: issue.id, endedAt: null }, select: { id: true, state: true, startedAt: true, leaseUntil: true, ask: true, userId: true, user: { select: { name: true } },
    seat: { select: { ownerId: true } }, issue: { select: { assigneeId: true } } } });
  if (!run) return { run: null, security };
  // What `clearRun` accepts: a lost run, or a run without a lease, from a person who may assign issues.
  const clearable = (run.state === 'lost' || !run.leaseUntil) && (await checkUserPermission(userId, issue.workspaceId, Permission.ASSIGN_TASK)).hasPermission;
  const question = browserSession && run.state === 'waiting' && run.seat?.ownerId === userId && run.issue.assigneeId === run.userId
    ? questionsOf(run.ask).at(-1) : undefined;
  return { run: { id: run.id, state: run.state, startedAt: run.startedAt, by: run.user.name, clearable,
    ...(question?.answer === null && { question: { id: question.id, text: question.text } }) }, security };
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
    return { run: { ...await tx.agentRun.findFirstOrThrow({ where: { id: runId }, select: RUN }), ask: null } };
  });
}

/**
 * Declared stops: a person's answer from Home is a comment on the issue, posted only while the stop its row showed is
 * still open. Open: that run is the issue's latest, a seat's, and finished in review or blocked naming a person; the
 * seat still holds the issue and was not given it again since, the issue is not done, nobody but the seat has commented
 * since the run ended, and no person answered before it ended (`earlyAnswers`). Anyone who may read the issue may answer,
 * as with a comment on its page. It is checked and written under the issue's lock, which a checkout and a second answer
 * take too: two presses post one comment, and a press on an old row posts none.
 */
export async function answerStop(userId: string, issueIdOrKey: string, runId: string, input: z.infer<typeof stopAnswerSchema>) {
  const issue = await findIssueByIdOrKey<{ id: string; workspaceId: string; issueKey: string | null }>(issueIdOrKey, { userId, select: { id: true, workspaceId: true, issueKey: true } });
  if (!issue) throw new HandoffError('not_found', 'Issue not found', 404);
  await forgeGuard(issue.id);
  const comment = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${issue.id} FOR UPDATE`;
    const current = await tx.issue.findFirst({ where: { id: issue.id, ...issueReadAccessWhere(userId) }, select: { assigneeId: true, createdAt: true, status: true, statusValue: true, projectStatus: statusSelect,
      helpers: { select: { userId: true, approvedAt: true, assignedAt: true } },
      agentRuns: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, userId: true, seatId: true, state: true, outcome: true, startedAt: true, endedAt: true } } } });
    const run = current?.agentRuns[0];
    if (!current || run?.id !== runId || !run.seatId || !run.endedAt || run.state !== 'finished' || run.outcome === 'done' || run.userId !== current.assigneeId || isStopIssueDone(current)
      || run.endedAt < lastAssigned(current) || (await runsNamingPerson(tx, [issue.id])).get(issue.id) !== runId
      || (await earlyAnswers(tx, [{ issueId: issue.id, seatUserId: run.userId, startedAt: run.startedAt, endedAt: run.endedAt }])).size
      || await tx.issueComment.count({ where: { issueId: issue.id, authorId: { not: run.userId }, createdAt: { gt: run.endedAt } } })) {
      throw new HandoffError('stop_closed', 'Nothing was posted: this is no longer waiting for an answer. Someone has answered it, the issue is done, or its seat has started on it again', 409);
    }
    return tx.issueComment.create({ data: { issueId: issue.id, authorId: userId, content: input.content }, select: { id: true, issueId: true, authorId: true, content: true, createdAt: true } });
  });
  return { workspaceId: issue.workspaceId, issueKey: issue.issueKey, comment };
}
