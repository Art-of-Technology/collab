import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DEFAULT_STATUS_ORDER } from '@/constants/project-statuses';
import { NOT_DONE, pushedWork, waitsPushed, type Pushed } from '@/lib/agent-runs';
import { ASSIGN_CAP, byRoom, countSeatHandoff, fromLead, HandoffError, IDLE_MS, LEAD_CAP, NO_ROOM_MOVE_MS, noRoomDue, STARTED_MOVE_MS, requireSeat, seatFor, seatHandoffCapReached, seatsWithRoom, seatWriteGuard, type SeatRoom } from '@/lib/agent-seats';
import { AGENT_APP_SLUG } from '@/lib/agent-tokens';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { emitIssueCreated, emitIssueUpdated } from '@/lib/event-bus';
import { assertLegacyIssueWriteAllowed, assertLegacyProjectWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { assertAssignable } from '@/lib/issue-assignee';
import { allocateIssueKey } from '@/lib/issue-key-allocation';
import { createRefusal, issueShape } from '@/lib/issue-template-enforcement';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';

/** Open requests one project may have in another. */
export const REQUEST_CAP = 5;
/** Per request role: the seat role that takes it, and the label people know it by. */
const REQUESTS = {
  developer: { seat: 'developer', label: null },
  review: { seat: 'reviewer', label: 'Review request' },
  release: { seat: 'release', label: 'Release request' },
  security: { seat: 'security', label: null },
} as const;
type RequestRole = keyof typeof REQUESTS;

const text = (max: number) => z.string().trim().min(1).max(max);
export const requestSchema = z.object({
  project: text(128).optional(), role: z.enum(['developer', 'review', 'release', 'security']), title: text(200), body: text(32_000),
  fromIssue: text(128), blocks: z.boolean().optional(),
}).strict();

/**
 * Rule 8: a seat asks a seat of a role for work on one of its project's issues. The request is a new Task in the target
 * project (the seat's own when none is named, which is how review and release are asked for), its body held to the
 * workspace's issue template, reported by the asking seat, assigned to a seat of the role in the target project (see
 * `placeRequest`), and linked to the issue it came from: it blocks that issue when `blocks`, else it relates to it. A security request
 * always blocks, whatever the caller says, and the reply says so. It takes its source's priority.
 * `agentRequestRole` is what makes it a request; the role's label is added for people to see and hands it to nobody.
 * One project has at most five open requests in another; inside a project there is no cap. A request to a release
 * seat that is away still succeeds, with a warning and a comment that says so. Where Collab chose between seats, the
 * reply says which seat got the request and why, as the request's timeline does.
 */
export async function fileRequest(context: Pick<AppAuthContext, 'user' | 'workspace'>, input: z.infer<typeof requestSchema>) {
  const me = context.user.id, workspaceId = context.workspace.id;
  const seat = await requireSeat(prisma, context);
  const source = await prisma.issue.findFirst({ where: { workspaceId, OR: [{ id: input.fromIssue }, { issueKey: input.fromIssue }] },
    select: { id: true, projectId: true, priority: true } });
  if (!source) throw new HandoffError('not_found', 'Issue not found', 404);
  await seatWriteGuard(prisma, context, source.projectId);
  const target = input.project
    ? await prisma.project.findFirst({ where: { workspaceId, OR: [{ id: input.project }, { issuePrefix: input.project }] }, select: { id: true } })
    : { id: seat.projectId };
  if (!target) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
  // As on every other issue write: a Forge-connected project's issues change through its Forge board.
  await Promise.all([assertLegacyProjectWriteAllowed(target.id), assertLegacyIssueWriteAllowed(source.id)]).catch(error => {
    throw error instanceof ForgeProjectWriteError ? new HandoffError('forge_connected_project', error.message, 409) : error;
  });

  const kind = REQUESTS[input.role];
  const label = kind.label ? await prisma.taskLabel.findFirst({ where: { workspaceId, name: kind.label }, select: { id: true } }) : null;
  // Only the body is held to the template. A request's fields are the server's (its source's priority, its role's
  // label, its assignee) and the asking seat can state no other, so a required field could only refuse every request.
  const { enforced, templates } = await getWorkspaceTemplates(workspaceId);
  const sections = { ...templates, TASK: { ...templates.TASK, requiredFields: [] } };
  const made = await prisma.$transaction(async tx => {
    // The lock that creating and retiring a seat take: the target project's seats stay as they are until this ends,
    // and requests into the project are counted and written one at a time.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${target.id}`}))`;
    await tx.$queryRaw`SELECT "id" FROM "AgentSeat" WHERE "userId" = ${me} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${source.id} FOR UPDATE`;
    const currentSource = await tx.issue.findFirst({ where: { id: source.id, workspaceId }, select: { id: true, issueKey: true, projectId: true, priority: true } });
    if (!currentSource) throw new HandoffError('not_found', 'Issue not found', 404);
    await seatWriteGuard(tx, context, currentSource.projectId);
    const currentSeat = await requireSeat(tx, context);
    if (currentSeat.projectId !== seat.projectId) throw new HandoffError('wrong_project', "A seat writes only to its own project's issues", 403);
    const refusal = enforced && createRefusal(sections, issueShape({ type: 'TASK', description: input.body }));
    if (refusal) throw Object.assign(new HandoffError(refusal.error, refusal.error_description, 422), { body: refusal });
    return writeRequest(tx, { workspaceId, me, projectId: target.id, from: currentSeat.projectId, role: input.role, title: input.title, body: input.body,
      source: currentSource, blocks: input.blocks, labelId: label?.id });
  });

  // Fire-and-forget, as for every new issue: this is what makes it searchable.
  emitIssueCreated(made.issue, { userId: me, workspaceId, workspaceName: context.workspace.name || '', workspaceSlug: context.workspace.slug || '', source: 'agent-request' },
    { async: true }).catch(() => {});
  return { issue: { id: made.issue.id, issueKey: made.issue.issueKey }, ...(input.role === 'security' && { blocks: true as const }), ...(made.idle && { warning: 'seat_idle' as const }),
    ...(made.placed && { placed: made.placed }) };
}

/**
 * Which of a role's seats a request goes to, and why. `seats` hold the default seat, `fallback`, and at least one other.
 * The seat with the most room; equal room, the owner with the fewest open runs, then the default seat. With no number
 * among them it is the default seat, as before room, unless Collab knows that seat has no room: then the first seat
 * whose room is unknown. When every seat is known to have no room the request waits at the default seat, `full`.
 * The reason names no figure: room is its owner's to see, and a request's timeline is read by the whole project.
 */
function placeRequest<T extends { room: SeatRoom; openRuns: number; isDefault: boolean }>(seats: T[], fallback: T): { seat: T; why: string; full?: true } {
  const order = byRoom(seats), [top, next] = order;
  if (top.room.kind === 'room') {
    const tied = next.room.kind === 'room' && next.room.room === top.room.room;
    return { seat: top, why: !tied ? 'most room' : top.openRuns < next.openRuns ? 'equal room, fewer open runs'
      : `equal room and open runs: ${top.isDefault ? 'the default seat first' : 'the older seat first'}` };
  }
  const unknown = order.find(seat => seat.room.kind === 'unknown');
  if (!unknown) return { seat: fallback, why: 'no seat can start now: it waits at the default seat', full: true };
  if (fallback.room.kind === 'unknown') return { seat: fallback, why: 'no fresh figure: the default seat' };
  return { seat: unknown, why: 'no fresh figure and the default seat cannot start: the next seat whose figure is unknown' };
}

/**
 * What every request has, however it was asked for: a Task in `projectId`, reported by `me`, assigned to a seat of the
 * role in that project and linked to its source. The seat it goes to cannot be retired until the caller's transaction
 * ends: its row is held here.
 */
async function writeRequest(tx: Prisma.TransactionClient, input: { workspaceId: string; me: string; projectId: string; from?: string; role: RequestRole;
  title: string; body: string; source: { id: string; issueKey: string | null; projectId: string; priority: string }; blocks?: boolean; labelId?: string }) {
  const { workspaceId, me, projectId } = input, kind = REQUESTS[input.role];
  const now = new Date();
  const place = async () => {
    const seats = await seatsWithRoom(tx, projectId, kind.seat, now), fallback = seats.find(seat => seat.isDefault);
    if (!fallback) throw new HandoffError('no_default_seat', `The project has no ${kind.seat} seat to take this request`, 409);
    // Work reaches a seat by someone else's hand: a request to itself would be a seat assigning its own work.
    if (fallback.userId === me) throw new HandoffError('invalid_request', 'This request would go to the seat that files it');
    // Developer work is the lead's to place, and a role with one seat to give it to leaves nothing to choose: both go to
    // the default seat with nothing said, as before room.
    const able = input.role === 'developer' ? [] : seats.filter(seat => seat.userId !== me);
    const placed = able.length > 1 ? placeRequest(able, fallback) : null;
    return { placed, to: placed?.seat ?? fallback };
  };
  let { placed, to } = await place();
  // The row of the seat that gets the request, and only that one: retiring a seat takes its row first and waits, and
  // holding the role's other rows would deadlock with a retirement that makes one of them the default. `fileRequest`
  // holds the project's seat lock besides; a label does not, because it already holds its issue, and the other order
  // could deadlock. The row is asked again for what the seat was placed as: retired meanwhile, or made again for another
  // person, project or role, it is not that seat any more, and the seats are read again. Its room or the time it was
  // last seen changing is no reason to: that would place again on every report of a runner.
  while (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentSeat" WHERE "id" = ${to.id} AND "projectId" = ${projectId} AND "role" = ${kind.seat}
    AND "ownerId" IS NOT DISTINCT FROM ${to.ownerId} AND "retiredAt" IS NULL FOR SHARE`).length) ({ placed, to } = await place());
  await assertAssignable(tx, { workspaceId, projectId, agentRequestRole: input.role }, to.userId);
  if (input.from && input.from !== projectId) {
    // A request is from a project when a seat of that project reported it.
    const open = await tx.issue.count({ where: { projectId, agentRequestRole: { not: null }, reporter: { agentSeat: { projectId: input.from } }, ...NOT_DONE } });
    if (open >= REQUEST_CAP) throw new HandoffError('request_cap', `This project has ${REQUEST_CAP} open requests in that project; one of them has to be done first`, 429);
  }

  const issueKey = await allocateIssueKey(tx, projectId);
  const status = await tx.projectStatus.findFirst({ where: { projectId, isDefault: true }, orderBy: DEFAULT_STATUS_ORDER, select: { id: true, name: true } });
  const issue = await tx.issue.create({ data: {
    workspaceId, projectId, issueKey, type: 'TASK', title: input.title, description: input.body, priority: input.source.priority,
    statusId: status?.id, statusValue: status?.name, status: status?.name, reporterId: me, assigneeId: to.userId, agentRequestRole: input.role,
    ...(input.labelId && { labels: { connect: { id: input.labelId } } }),
  } });
  await tx.issueAssignee.create({ data: { issueId: issue.id, userId: to.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: now, approvedAt: now, approvedBy: me } });
  const security = input.role === 'security';
  await tx.issueRelation.create({ data: { sourceIssueId: issue.id, targetIssueId: input.source.id, relationType: input.blocks || security ? 'BLOCKS' : 'RELATES_TO', createdBy: me } });
  if (security) {
    // On both timelines. The request's entry is what its verdict is later written from: the issue it was filed for,
    // kept where a link added afterwards cannot change it.
    const asked = (target: { id: string; projectId: string }, details: object) => ({ action: 'SECURITY_REQUESTED', itemType: 'ISSUE', itemId: target.id, userId: me,
      workspaceId, projectId: target.projectId, details: JSON.stringify(details) });
    await tx.issueActivity.createMany({ data: [asked(issue, { forIssueId: input.source.id, forIssueKey: input.source.issueKey ?? input.source.id }),
      asked(input.source, { requestId: issue.id, requestKey: issue.issueKey ?? issue.id })] });
  }
  if (placed) {
    await tx.issueActivity.create({ data: { action: 'REQUEST_PLACED', itemType: 'ISSUE', itemId: issue.id, userId: me, workspaceId, projectId,
      details: JSON.stringify({ toSeatId: to.id, to: to.name, why: placed.why }) } });
  }
  // Only a release seat is expected to be there all the time: a project has one, and a release waits on it.
  const idle = kind.seat === 'release' && !(to.lastSeenAt && to.lastSeenAt.getTime() > now.getTime() - IDLE_MS);
  if (idle) {
    await tx.issueComment.create({ data: { issueId: issue.id, authorId: me, content: `${to.name}, this project's release seat, ${to.lastSeenAt
      ? `last read its inbox at ${to.lastSeenAt.toISOString()}` : 'has never read its inbox'}. This request waits until it does. If the release seat is not running, a person has to start it.` } });
  }
  // A seat a runner runs works only while a runner holds a usable token for it: before the first fetch, and again
  // once the last token it fetched has run out, which is what a runner that stayed away through the renewal window leaves.
  const fetched = to.byRunner ? await tx.appToken.findFirst({ where: { userId: to.userId, runnerId: { not: null }, isRevoked: false },
    orderBy: { createdAt: 'desc' }, select: { tokenExpiresAt: true } }) : null;
  const waits = to.byRunner && !(fetched?.tokenExpiresAt && fetched.tokenExpiresAt > now);
  if (waits) {
    await tx.issueComment.create({ data: { issueId: issue.id, authorId: me, content: fetched?.tokenExpiresAt
      ? `${to.name} is run by a runner, and the last token a runner fetched for it ran out at ${fetched.tokenExpiresAt.toISOString()}. A token is renewed when its runner asks, so this one has not asked for a week or more. This request waits until a runner fetches a token again.`
      : `${to.name} is run by a runner, and no runner has fetched its token yet. This request waits until one has: the seat's owner connects a runner under Agents, Runners.` } });
  }
  return { issue, idle: idle || waits || !!placed?.full, placed: placed && { seat: to.name, why: placed.why } };
}

/**
 * CLB-809: started work moves between runs only. Behind the locks the issue is as it was when its move was decided: still
 * unstarted, or with the same last run, which pushed its work and so is not open, and still offered in its seat's inbox
 * (a blocker reopened meanwhile keeps it). A run that started meanwhile wins.
 */
const asDecided = async (tx: Prisma.TransactionClient, issue: { id: string; workspaceId: string; projectId: string }, pushed: Pushed | undefined,
  from: { userId: string; role: string }) => pushed
  ? (await pushedWork(tx, issue.id))?.runId === pushed.runId && (await waitsPushed(issue.workspaceId, issue.projectId, from, tx)).has(issue.id)
  : !await tx.agentRun.count({ where: { issueId: issue.id } });
/** What the timeline says of started work that moved: it goes on from the branch its last run pushed. */
const continues = (pushed: Pushed | undefined) => pushed ? `; the work continues from the branch its last run pushed (${pushed.pullRequest})` : '';

/**
 * CLB-780: a request no run has started on leaves a seat that has had no room for `NO_ROOM_MOVE_MS`. Called before a
 * seat's inbox is read; there is no scheduler, and the seat that could take such a request is one that reads its
 * inbox, so the read that moves a request already lists it. It looks only for a reader whose role takes requests
 * Collab places (a developer request is the lead's to move, never Collab's), and only at the unstarted requests of
 * that role in the reader's project: most reads cost one read of the seat and one of those requests. A request is
 * placed again by the rule every request is placed by, and only on a seat with a number: with none, with the figure
 * unknown, or inside the time, it waits where it is. It never returns to a seat it was moved off. The timeline says
 * from which seat and why, and names no figure. Started means a run exists on the issue, whatever became of it.
 * Nothing is moved in a Forge-connected project. The caller answers the inbox whether or not this fails.
 * CLB-809: a request a run has started on moves the same way between runs, after `STARTED_MOVE_MS`, when its seat's
 * inbox offers it for its next run and its last run pushed its work (`waitsPushed`).
 */
export async function moveUnstarted(context: Pick<AppAuthContext, 'user' | 'workspace'>) {
  const reader = await seatFor(prisma, context);
  if (reader?.role === 'developer') return moveStories(context, reader);
  const role = reader && (Object.keys(REQUESTS) as RequestRole[]).find(name => name !== 'developer' && REQUESTS[name].seat === reader.role);
  if (!reader || !role) return;
  const requests = { projectId: reader.projectId, agentRequestRole: role, ...NOT_DONE };
  const waiting = await prisma.issue.findMany({ where: { ...requests, workspaceId: context.workspace.id, assigneeId: { not: null } }, orderBy: { createdAt: 'asc' },
    select: { id: true, assigneeId: true, reporterId: true, agentRuns: { take: 1, select: { id: true } } } });
  if (!waiting.length) return;
  const now = new Date();
  const seats = await seatsWithRoom(prisma, reader.projectId, reader.role, now);
  if (!seats.some(seat => seat.room.kind === 'room')) return;
  // A Forge-connected project's issues change through its Forge board: nothing is moved there, and that is no failure.
  if (await assertLegacyProjectWriteAllowed(reader.projectId).then(() => false, error => { if (error instanceof ForgeProjectWriteError) return true; throw error; })) return;
  const dues = new Map<string, Date | null>(), offered = new Map<string, Map<string, Pushed>>();
  // Each request on its own: one that fails is logged and the next one is still tried; the next read tries it again.
  for (const request of waiting) try {
    const from = seats.find(seat => seat.userId === request.assigneeId);
    if (from?.room.kind !== 'no_room') continue;
    const wait = request.agentRuns.length ? STARTED_MOVE_MS : NO_ROOM_MOVE_MS;
    if (!dues.has(`${from.id}:${wait}`)) dues.set(`${from.id}:${wait}`, await noRoomDue(prisma, from, now, wait));
    const due = dues.get(`${from.id}:${wait}`);
    if (!due || due > now) continue;
    if (request.agentRuns.length && !offered.has(from.id)) offered.set(from.id, await waitsPushed(context.workspace.id, reader.projectId, from));
    const pushed = offered.get(from.id)?.get(request.id);
    if (request.agentRuns.length && !pushed) continue;
    const updated = await prisma.$transaction(async tx => {
      const placements = await tx.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: request.id, action: 'REQUEST_PLACED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { details: true, userId: true } });
      const links = await tx.issueRelation.findMany({ where: { sourceIssueId: request.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { createdBy: true } });
      // Who filed it is read from what filing wrote, the surest first: the entry of its first placing, the link to its
      // source, then its reporter, because a person can change a request's reporter and remove its link. Any of them
      // may be the filer, so none of them is given the request; with no trace left it is moved all the same.
      const filers = [placements[0]?.userId, ...links.map(link => link.createdBy), request.reporterId].filter((id): id is string => !!id);
      const left = placements.map(entry => JSON.parse(entry.details ?? '{}').fromSeatId);
      // As when it was filed: never the seat that asked.
      const others = seats.filter(seat => seat.id !== from.id && !filers.includes(seat.userId) && !left.includes(seat.id));
      const to = others.length ? placeRequest([from, ...others], from).seat : from;
      if (to.room.kind !== 'room') return;
      // The seat's row, then the issue's: the order a checkout and a retirement take them in. Whichever of a checkout
      // and this gets the issue first decides: the other reads what it left, a run or another assignee, and gives way.
      if (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentSeat" WHERE "id" = ${to.id} AND "projectId" = ${reader.projectId} AND "role" = ${reader.role}
        AND "ownerId" IS NOT DISTINCT FROM ${to.ownerId} AND "retiredAt" IS NULL FOR SHARE`).length) return;
      await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ${request.id} FOR UPDATE`;
      const issue = await tx.issue.findFirst({ where: { ...requests, id: request.id, assigneeId: from.userId }, select: { id: true, workspaceId: true, projectId: true, reporterId: true } });
      if (!issue || !await asDecided(tx, issue, pushed, from)) return;
      const currentPlacements = await tx.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: request.id, action: 'REQUEST_PLACED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { details: true, userId: true } });
      const currentLinks = await tx.issueRelation.findMany({ where: { sourceIssueId: request.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { createdBy: true } });
      const currentFilers = [currentPlacements[0]?.userId, ...currentLinks.map(link => link.createdBy), issue.reporterId].filter((id): id is string => !!id);
      if (currentFilers.includes(to.userId) || currentPlacements.some(entry => JSON.parse(entry.details ?? '{}').fromSeatId === to.id)) return;
      // What was read before the locks chose the seats; whether it still holds is read again behind them. A seat that
      // got room back while this waited keeps its work, and a seat that lost its room is given none: the next read looks again.
      const at = new Date(), current = await seatsWithRoom(tx, reader.projectId, reader.role, at);
      const source = current.find(seat => seat.id === from.id);
      if (source?.room.kind !== 'no_room' || current.find(seat => seat.id === to.id)?.room.kind !== 'room') return;
      const since = await noRoomDue(tx, source, at, wait);
      if (!since || since > at) return;
      const why = `${from.name} had no room for ${wait / 60_000} minutes (${source.room.reason})${continues(pushed)}`;
      await assertAssignable(tx, { ...issue, agentRequestRole: role }, to.userId);
      const updated = await tx.issue.update({ where: { id: issue.id }, data: { assigneeId: to.userId } });
      // The row that makes a seat the assignee goes with the request, stamped now: the new seat's inbox counts from it.
      const attributedTo = currentFilers[0] ?? to.userId;
      const row = { role: 'ASSIGNEE', status: 'APPROVED', assignedAt: at, approvedAt: at, approvedBy: attributedTo } as const;
      await tx.issueAssignee.deleteMany({ where: { issueId: issue.id, userId: from.userId } });
      await tx.issueAssignee.upsert({ where: { issueId_userId: { issueId: issue.id, userId: to.userId } }, create: { issueId: issue.id, userId: to.userId, ...row }, update: row });
      // Under the name of whoever filed the request, as its placing is: Collab has no account of its own.
      await tx.issueActivity.create({ data: { action: 'REQUEST_PLACED', itemType: 'ISSUE', itemId: issue.id, userId: attributedTo, workspaceId: issue.workspaceId,
        projectId: issue.projectId, fieldName: 'assignee', oldValue: from.userId, newValue: to.userId,
        details: JSON.stringify({ fromSeatId: from.id, from: from.name, toSeatId: to.id, to: to.name, why, ...(pushed && { pullRequest: pushed.pullRequest, headCommit: pushed.headCommit }) }) } });
      // Started work in review or blocked is offered only for something said after its new assignment: this comment, as
      // a moved story's is, so the new seat's inbox offers what was ready on the seat it left.
      if (pushed) await tx.issueComment.create({ data: { issueId: issue.id, authorId: attributedTo, createdAt: new Date(at.getTime() + 1),
        content: `Collab moved this request from ${from.name} to ${to.name}, because ${why}. What ${from.name} did not push stays behind.` } });
      return updated;
    });
    if (updated) emitIssueUpdated(updated, [{ fieldName: 'assigneeId', oldValue: from.userId, newValue: updated.assigneeId }],
      { userId: context.user.id, workspaceId: context.workspace.id, workspaceName: context.workspace.name || '', workspaceSlug: context.workspace.slug || '', source: 'agent-request' },
      { async: true }).catch(() => {});
  } catch (error) {
    console.error('Moving an unstarted request failed', request.id, error);
  }
}

/**
 * CLB-793: the one case where Collab assigns developer work. A story the lead placed (its hand is on the row that made
 * the seat the assignee), under an issue the lead holds and has no run open on, on which no run ever started, leaves a
 * developer seat that has had no room for `NO_ROOM_MOVE_MS`, but only while the lead's own seat has had none for as
 * long: a lead that can run moves its stories itself (`child_no_room`). It goes to the developer seat `byRoom` puts
 * first among those with a number and under `LEAD_CAP` issues from the lead, never back to a seat it was moved off,
 * and stays the lead's to place. Called on a developer seat's inbox read, the seat that could take it; most reads
 * cost the read of the lead seat and one indexed read of such stories, which finds none. One comment on the story and
 * one on the lead's issue say from which seat, to which, and why, under the lead's name: Collab has no account of its
 * own, and the lead's own comment does not wake it (it cannot run now; a child's progress wakes it later).
 * CLB-809: a story a run has started on moves the same way between runs, after `STARTED_MOVE_MS` on its seat, when that
 * seat's inbox offers it for its next run and its last run pushed its work (`waitsPushed`); the lead's own seat still
 * counts `NO_ROOM_MOVE_MS`.
 * shortcut: two moves onto one seat are held apart by its row; a lead's own assignment, already refused while it has
 * no room, is held to the limit by its serializable read only, so it could pass the limit by one in that moment.
 */
async function moveStories(context: Pick<AppAuthContext, 'user' | 'workspace'>, reader: { projectId: string }) {
  const { projectId } = reader;
  const lead = await prisma.agentSeat.findFirst({ where: { projectId, role: 'lead', retiredAt: null }, select: { userId: true } });
  if (!lead) return;
  const stories = { workspaceId: context.workspace.id, projectId, agentRequestRole: null, ...NOT_DONE,
    parent: { assigneeId: lead.userId, agentRuns: { none: { endedAt: null } }, ...NOT_DONE }, helpers: { some: { approvedBy: lead.userId } } };
  const placedByLead = (issue: { assigneeId: string | null; helpers: { userId: string }[] }) => issue.helpers.some(row => row.userId === issue.assigneeId);
  const helpers = { where: { approvedBy: lead.userId }, select: { userId: true } };
  const parent = { select: { createdAt: true, helpers: { where: { userId: lead.userId }, select: { approvedAt: true, assignedAt: true } },
    agentRuns: { orderBy: { startedAt: 'desc' as const }, take: 1, select: { startedAt: true, endedAt: true, outcome: true } } } };
  const unseen = (parent: { createdAt: Date; helpers: { approvedAt: Date | null; assignedAt: Date }[]; agentRuns: { startedAt: Date; endedAt: Date | null; outcome: string | null }[] } | null, due: Date) => {
    const run = parent?.agentRuns[0], assigned = parent?.helpers[0]?.approvedAt ?? parent?.helpers[0]?.assignedAt ?? parent?.createdAt;
    return !!run?.endedAt && !!assigned && run.endedAt >= assigned && run.outcome === 'blocked' && due > run.startedAt;
  };
  const waiting = (await prisma.issue.findMany({ where: { ...stories, assignee: { agentSeat: { role: 'developer' } } }, orderBy: { createdAt: 'asc' },
    select: { id: true, parentId: true, parent, assigneeId: true, helpers, agentRuns: { take: 1, select: { id: true } } } })).filter(placedByLead);
  if (!waiting.length) return;
  const now = new Date();
  const leadDue = async (db: Prisma.TransactionClient | typeof prisma, at: Date) => {
    const [seat] = await seatsWithRoom(db, projectId, 'lead', at);
    if (seat?.room.kind !== 'no_room') return null;
    const due = await noRoomDue(db, seat, at);
    return due && due <= at ? seat : null;
  };
  const leadSeat = await leadDue(prisma, now);
  if (!leadSeat) return;
  const seats = await seatsWithRoom(prisma, projectId, 'developer', now);
  if (!seats.some(seat => seat.room.kind === 'room')) return;
  if (await assertLegacyProjectWriteAllowed(projectId).then(() => false, error => { if (error instanceof ForgeProjectWriteError) return true; throw error; })) return;
  const dues = new Map<string, Date | null>(), offered = new Map<string, Map<string, Pushed>>();
  for (const story of waiting) try {
    const from = seats.find(seat => seat.userId === story.assigneeId);
    if (from?.room.kind !== 'no_room') continue;
    const wait = story.agentRuns.length ? STARTED_MOVE_MS : NO_ROOM_MOVE_MS;
    if (!dues.has(`${from.id}:${wait}`)) dues.set(`${from.id}:${wait}`, await noRoomDue(prisma, from, now, wait));
    const due = dues.get(`${from.id}:${wait}`);
    if (!due || due > now || !unseen(story.parent, due)) continue;
    if (story.agentRuns.length && !offered.has(from.id)) offered.set(from.id, await waitsPushed(context.workspace.id, projectId, from));
    const pushed = offered.get(from.id)?.get(story.id);
    if (story.agentRuns.length && !pushed) continue;
    for (const to of byRoom(seats.filter(seat => seat.id !== from.id && seat.room.kind === 'room'))) {
      const updated = await prisma.$transaction(async tx => {
        const leftOf = async () => (await tx.issueActivity.findMany({ where: { itemType: 'ISSUE', itemId: story.id, action: { in: ['STORY_MOVED', 'LEAD_ASSIGNED'] } }, select: { details: true, oldValue: true } }))
          .flatMap(entry => [JSON.parse(entry.details ?? '{}').fromSeatId, entry.oldValue]);
        if ((await leftOf()).some(id => id === to.id || id === to.userId) || await tx.issue.count({ where: fromLead(projectId, lead.userId, to.userId) }) >= LEAD_CAP) return null;
        // As a request moves: the seat's row, then the issue's, the order a checkout takes them in, and whichever gets the
        // issue first decides. The seat's row is held for update, so two moves onto one seat count its limit in turn.
        if (!(await tx.$queryRaw<unknown[]>`SELECT 1 FROM "AgentSeat" WHERE "id" = ${to.id} AND "projectId" = ${projectId} AND "role" = 'developer'
          AND "ownerId" IS NOT DISTINCT FROM ${to.ownerId} AND "retiredAt" IS NULL FOR UPDATE`).length) return null;
        await tx.$queryRaw`SELECT "id" FROM "Issue" WHERE "id" = ANY(${[story.id, story.parentId]}) ORDER BY "id" FOR UPDATE`;
        const issue = await tx.issue.findFirst({ where: { ...stories, id: story.id, parentId: story.parentId, assigneeId: from.userId },
          select: { id: true, workspaceId: true, projectId: true, issueKey: true, parentId: true, parent, assigneeId: true, helpers } });
        if (!issue || !placedByLead(issue) || !await asDecided(tx, issue, pushed, from)) return;
        if ((await leftOf()).some(id => id === to.id || id === to.userId)) return null;
        // Read again behind the locks: a seat that got room back keeps its work, and a lead that got room back moves it itself.
        const at = new Date(), current = await seatsWithRoom(tx, projectId, 'developer', at);
        const source = current.find(seat => seat.id === from.id);
        if (source?.room.kind !== 'no_room') return;
        if (current.find(seat => seat.id === to.id)?.room.kind !== 'room') return null;
        const since = await noRoomDue(tx, source, at, wait);
        if (!since || since > at || !unseen(issue.parent, since)) return;
        const stuck = await leadDue(tx, at);
        if (!stuck || stuck.room.kind !== 'no_room') return;
        if (await tx.issue.count({ where: fromLead(projectId, lead.userId, to.userId) }) >= LEAD_CAP) return null;
        await assertAssignable(tx, { ...issue, agentRequestRole: null }, to.userId);
        const updated = await tx.issue.update({ where: { id: issue.id }, data: { assigneeId: to.userId } });
        // The lead's hand stays on the row, stamped now: the story counts toward its limit, the lead may still move it,
        // and the new seat's inbox offers it as `assigned`.
        const row = { role: 'ASSIGNEE', status: 'APPROVED', assignedAt: at, approvedAt: at, approvedBy: lead.userId } as const;
        await tx.issueAssignee.deleteMany({ where: { issueId: issue.id, userId: from.userId } });
        await tx.issueAssignee.upsert({ where: { issueId_userId: { issueId: issue.id, userId: to.userId } }, create: { issueId: issue.id, userId: to.userId, ...row }, update: row });
        const why = `${from.name} had no room for ${wait / 60_000} minutes (${source.room.reason}), and so had the lead seat ${stuck.name} (${stuck.room.reason})${continues(pushed)}`;
        await tx.issueActivity.create({ data: { action: 'STORY_MOVED', itemType: 'ISSUE', itemId: issue.id, userId: lead.userId, workspaceId: issue.workspaceId,
          projectId, fieldName: 'assignee', oldValue: from.userId, newValue: to.userId, details: JSON.stringify({ fromSeatId: from.id, from: from.name, toSeatId: to.id, to: to.name, why,
            ...(pushed && { pullRequest: pushed.pullRequest, headCommit: pushed.headCommit }) }) } });
        // After the assignment's stamp, so a started story in review or blocked is offered to its new seat for it.
        await tx.issueComment.create({ data: { issueId: issue.id, authorId: lead.userId, createdAt: new Date(at.getTime() + 1),
          content: `Collab moved this story from ${from.name} to ${to.name}, because ${why}. ${pushed ? `What ${from.name} did not push stays behind.` : 'No run had started on it.'}` } });
        await tx.issueComment.create({ data: { issueId: issue.parentId!, authorId: lead.userId,
          content: `Collab moved ${issue.issueKey ?? issue.id} from ${from.name} to ${to.name}, because ${why}. Collab chose by room alone. `
            + 'Lead, when you run again: check whether a seat now holds two stories that change the same files, whether the order this epic gives still holds, and the lanes.' } });
        return updated;
      });
      if (updated) emitIssueUpdated(updated, [{ fieldName: 'assigneeId', oldValue: from.userId, newValue: updated.assigneeId }],
        { userId: context.user.id, workspaceId: context.workspace.id, workspaceName: context.workspace.name || '', workspaceSlug: context.workspace.slug || '', source: 'agent-request' },
        { async: true }).catch(() => {});
      if (updated !== null) break;
    }
  } catch (error) {
    console.error('Moving an unstarted story failed', story.id, error);
  }
}

/**
 * Rule 9, for labels added to an issue; call inside the issue's write transaction. False for a project that uses
 * handoffs, where the caller hands the labels to their subscribers. In a project that uses seats a label hands work to
 * nobody, and the label of a request role asks for that request: one Task for a seat of the role in the project, placed
 * as any request is, reported by whoever added the label and related to the issue. Nothing is filed while a request of that role for the
 * issue is still open, so adding the label twice asks once, nor for an issue that is itself a request. With no seat to
 * take it the refusal undoes the whole edit, so the label never sits there asking nobody. The text is the server's
 * and points at the issue, so it is not held to the issue template. An agent token that is not a seat asks for a
 * release this way and for nothing else (decided 16 Nov 2026, CLB-527): a review it asks for only as a seat. Its
 * release request is a new issue for a seat, so rule 7's daily cap counts it with the issues the token creates for seats.
 */
export async function labelRequests(tx: Prisma.TransactionClient, me: string, issue: { id: string; workspaceId: string; projectId: string },
  added: { id: string; name: string }[]) {
  const project = await tx.project.findUnique({ where: { id: issue.projectId }, select: { agentMode: true } });
  if (project?.agentMode !== 'seats') return false;
  const source = await tx.issue.findUnique({ where: { id: issue.id }, select: { id: true, issueKey: true, title: true, priority: true, agentRequestRole: true } });
  if (!source || source.agentRequestRole) return true;
  let agent: boolean | undefined;
  for (const role of ['review', 'release'] as const) {
    const kind = REQUESTS[role], label = added.find(candidate => candidate.name === kind.label);
    if (!label) continue;
    // An agent token that is not a seat.
    agent ??= !await tx.agentSeat.findFirst({ where: { userId: me, retiredAt: null }, select: { id: true } }) && !!await tx.appToken.findFirst({ where: { userId: me, app: { slug: AGENT_APP_SLUG } }, select: { id: true } });
    if (role !== 'release' && agent) {
      throw new HandoffError('assign_by_person', `An agent token that is not a seat does not ask for a ${role} by label; a person or a seat of the project adds it`, 403);
    }
    if (await tx.issue.count({ where: { projectId: issue.projectId, agentRequestRole: role,
      sourceRelations: { some: { targetIssueId: issue.id, relationType: { in: ['RELATES_TO', 'BLOCKS'] } } }, ...NOT_DONE } })) continue;
    // shortcut: an issue edit is serializable, so it does not see an issue the same token created for a seat after the edit
    // began; in that instant the count can end one over the cap. A counter row per account closes it if that matters.
    if (agent && await seatHandoffCapReached(tx, me)) {
      throw new HandoffError('assign_cap', `An agent token that is not a seat gives seats ${ASSIGN_CAP} new issues a day (UTC), release requests by label among them; a person or a seat of the project asks for this one`, 429);
    }
    const name = source.issueKey ?? source.id;
    // shortcut: no issue.created event, so semantic search learns of this request only when it is next edited; emit after commit if that matters.
    const made = await writeRequest(tx, { workspaceId: issue.workspaceId, me, projectId: issue.projectId, role, source: { ...source, projectId: issue.projectId }, labelId: label.id,
      title: `${kind.label}: ${name} ${source.title}`.slice(0, 200),
      body: `Asked for by adding the "${kind.label}" label to ${name}.\n\nRead ${name}, its comments and its timeline for what is asked.` });
    if (agent) await countSeatHandoff(tx, issue.workspaceId, me, made.issue.id, made.issue.assigneeId!);
  }
  return true;
}
