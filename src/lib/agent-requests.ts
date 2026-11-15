import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { NOT_DONE } from '@/lib/agent-runs';
import { HandoffError, requireSeat, seatWriteGuard } from '@/lib/agent-seats';
import type { AppAuthContext } from '@/lib/apps/auth-middleware';
import { emitIssueCreated } from '@/lib/event-bus';
import { assertLegacyIssueWriteAllowed, assertLegacyProjectWriteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { assertAssignable } from '@/lib/issue-assignee';
import { allocateIssueKey } from '@/lib/issue-key-allocation';
import { createRefusal, issueShape } from '@/lib/issue-template-enforcement';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';

/** Open requests one project may have in another. */
export const REQUEST_CAP = 5;
/** A release seat that has not read its inbox for this long is taken to be away. */
const IDLE_MS = 10 * 60_000;
/** Per request role: the seat role that takes it, and the label people know it by. */
const REQUESTS = {
  developer: { seat: 'developer', label: null },
  review: { seat: 'reviewer', label: 'Review request' },
  release: { seat: 'release', label: 'Release request' },
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
export const requestSchema = z.object({
  project: text(128).optional(), role: z.enum(['developer', 'review', 'release']), title: text(200), body: text(32_000),
  fromIssue: text(128), blocks: z.boolean().optional(),
}).strict();

/**
 * Rule 8: a seat asks a seat of a role for work on one of its project's issues. The request is a new Task in the target
 * project (the seat's own when none is named, which is how review and release are asked for), held to the workspace's
 * issue template, reported by the asking seat, assigned to the target project's default seat for the role, and linked
 * to the issue it came from: it blocks that issue when `blocks`, else it relates to it. It takes its source's priority.
 * `agentRequestRole` is what makes it a request; the role's label is added for people to see and hands it to nobody.
 * One project has at most five open requests in another; inside a project there is no cap. A request to a release
 * seat that is away still succeeds, with a warning and a comment that says so.
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
  // The fields a request states are the ones it sets itself: its source's priority, its role's label, and an assignee,
  // which a request always has or it is refused below.
  const { enforced, templates } = await getWorkspaceTemplates(workspaceId);
  const refusal = enforced && createRefusal(templates, issueShape({ type: 'TASK', description: input.body, priority: source.priority,
    assigneeId: kind.seat, labels: label ? [label] : [] }));
  if (refusal) throw Object.assign(new HandoffError(refusal.error, refusal.error_description, 422), { body: refusal });

  const made = await prisma.$transaction(async tx => {
    // The lock that creating and retiring a seat take: the target project's seats stay as they are until this ends,
    // and requests into the project are counted and written one at a time.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${target.id}`}))`;
    const to = await tx.agentSeat.findFirst({ where: { projectId: target.id, role: kind.seat, isDefault: true, retiredAt: null },
      select: { userId: true, name: true, lastSeenAt: true } });
    if (!to) throw new HandoffError('no_default_seat', `The project has no ${kind.seat} seat to take this request`, 409);
    // Work reaches a seat by someone else's hand: a request to itself would be a seat assigning its own work.
    if (to.userId === me) throw new HandoffError('invalid_request', 'This request would go to the seat that files it');
    await assertAssignable(tx, { workspaceId, projectId: target.id, agentRequestRole: input.role }, to.userId);
    if (target.id !== seat.projectId) {
      // A request is from a project when a seat of that project reported it.
      const open = await tx.issue.count({ where: { projectId: target.id, agentRequestRole: { not: null }, reporter: { agentSeat: { projectId: seat.projectId } }, ...NOT_DONE } });
      if (open >= REQUEST_CAP) throw new HandoffError('request_cap', `This project has ${REQUEST_CAP} open requests in that project; one of them has to be done first`, 429);
    }

    const issueKey = await allocateIssueKey(tx, target.id);
    const status = await tx.projectStatus.findFirst({ where: { projectId: target.id, isDefault: true }, select: { id: true, name: true } });
    const now = new Date();
    const issue = await tx.issue.create({ data: {
      workspaceId, projectId: target.id, issueKey, type: 'TASK', title: input.title, description: input.body, priority: source.priority,
      statusId: status?.id, statusValue: status?.name, status: status?.name, reporterId: me, assigneeId: to.userId, agentRequestRole: input.role,
      ...(label && { labels: { connect: { id: label.id } } }),
    } });
    await tx.issueAssignee.create({ data: { issueId: issue.id, userId: to.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: now, approvedAt: now, approvedBy: me } });
    await tx.issueRelation.create({ data: { sourceIssueId: issue.id, targetIssueId: source.id, relationType: input.blocks ? 'BLOCKS' : 'RELATES_TO', createdBy: me } });
    // Only a release seat is expected to be there all the time: a project has one, and a release waits on it.
    const idle = kind.seat === 'release' && !(to.lastSeenAt && to.lastSeenAt.getTime() > now.getTime() - IDLE_MS);
    if (idle) {
      await tx.issueComment.create({ data: { issueId: issue.id, authorId: me, content: `${to.name}, this project's release seat, ${to.lastSeenAt
        ? `last read its inbox at ${to.lastSeenAt.toISOString()}` : 'has never read its inbox'}. This request waits until it does. If the release seat is not running, a person has to start it.` } });
    }
    return { issue, idle };
  });

  // Fire-and-forget, as for every new issue: this is what makes it searchable.
  emitIssueCreated(made.issue, { userId: me, workspaceId, workspaceName: context.workspace.name || '', workspaceSlug: context.workspace.slug || '', source: 'agent-request' },
    { async: true }).catch(() => {});
  return { issue: { id: made.issue.id, issueKey: made.issue.issueKey }, ...(made.idle && { warning: 'seat_idle' as const }) };
}
