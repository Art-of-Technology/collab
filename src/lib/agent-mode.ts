import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { HandoffError } from '@/lib/agent-handoffs';
import { NOT_DONE } from '@/lib/agent-runs';
import { assertAssignable } from '@/lib/issue-assignee';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;

export const STATUS_GROUPS = ['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const;
/** A claim touched within this many days moves to a seat when its project switches; older ones follow the issue's status. */
const CARRY_DAYS = 7;

const id = z.string().min(1).max(128);
export const agentModeSchema = z.object({
  mode: z.enum(['handoffs', 'seats']).optional(),
  /** Status id to group. */
  categories: z.record(id, z.enum(STATUS_GROUPS)).optional(),
  /** Issues from `claims` to assign to the project's default developer seat. */
  carryOver: z.array(id).max(200).optional(),
}).strict();

/**
 * How a project gives agents work, and what a person needs to see before changing it: every status with its group,
 * the claims a switch can carry over (claimed handoffs touched in the last seven days, on issues that are not done,
 * not requests and not a seat's already), the seat they would go to, and the agent names all of whose claims are in
 * this project, which have no further use once it has switched.
 */
export async function agentModeState(db: DB, projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { workspaceId: true, agentMode: true, agentSwitchedAt: true,
    statuses: { where: { isActive: true }, orderBy: { order: 'asc' }, select: { id: true, displayName: true, category: true, isFinal: true } } } });
  const claimed = await db.agentHandoff.findMany({
    where: { workspaceId: project.workspaceId, status: 'claimed', updatedAt: { gte: new Date(Date.now() - CARRY_DAYS * 86_400_000) },
      issue: { projectId, agentRequestRole: null, ...NOT_DONE } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, updatedAt: true, claimedBy: { select: { name: true } }, issue: { select: { id: true, issueKey: true, title: true, assigneeId: true,
      assignee: { select: { name: true, agentSeat: { select: { retiredAt: true } } } } } } },
  });
  const seen = new Set<string>();
  const claims = claimed.filter(({ issue }) => !(issue.assignee?.agentSeat && !issue.assignee.agentSeat.retiredAt) && !seen.has(issue.id) && seen.add(issue.id))
    .map(({ id: handoffId, updatedAt, claimedBy, issue }) => ({ issueId: issue.id, issueKey: issue.issueKey, title: issue.title, handoffId,
      agent: claimedBy?.name ?? null, touchedAt: updatedAt, assigneeId: issue.assigneeId, assignee: issue.assignee?.name ?? null }));
  const seat = await db.agentSeat.findFirst({ where: { projectId, role: 'developer', isDefault: true, retiredAt: null }, select: { userId: true, name: true } });
  const retire = await db.agentRegistration.findMany({ where: { workspaceId: project.workspaceId,
    claimed: { some: { status: 'claimed' }, every: { OR: [{ status: { not: 'claimed' } }, { issue: { projectId } }] } } }, orderBy: { name: 'asc' }, select: { name: true } });
  return {
    mode: project.agentMode, switchedAt: project.agentSwitchedAt,
    // A status nobody grouped counts as the runs read it: done when it is final, else to do.
    statuses: project.statuses.map(status => ({ id: status.id, name: status.displayName, category: status.category ?? (status.isFinal ? 'done' : 'todo') })),
    claims, carryTo: seat, retire: retire.map(agent => agent.name),
  };
}

/**
 * Rule 9: a person regroups statuses, switches the project between handoffs and seats, and carries recent claims over,
 * in one step. Switching to seats needs a status in the in progress group and one in the done group, or a run could
 * neither start nor finish on the board. Switching back is refused while a run is open in the project. Seats and runs
 * work in either mode; the mode decides only whether handoffs do. Carrying over assigns the chosen issues to the
 * default developer seat, each with a timeline entry, and leaves the old claim to be released when its agent is retired.
 */
export async function setAgentMode(input: { workspaceId: string; projectId: string; actorId: string } & z.infer<typeof agentModeSchema>) {
  const { workspaceId, projectId, actorId } = input;
  return prisma.$transaction(async tx => {
    // The lock that creating and retiring a seat take, so two switches, or a switch and a seat change, go one at a time.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-seat:${projectId}`}))`;
    const project = await tx.project.findFirst({ where: { id: projectId, workspaceId }, select: { agentMode: true } });
    if (!project) throw new HandoffError('project_not_found', 'Project not found in this workspace', 404);
    for (const [statusId, category] of Object.entries(input.categories ?? {})) {
      const changed = await tx.projectStatus.updateMany({ where: { id: statusId, projectId }, data: { category } });
      if (!changed.count) throw new HandoffError('invalid_request', 'A status in this request is not one of this project');
    }
    const mode = input.mode ?? project.agentMode;
    if (mode !== project.agentMode) {
      if (mode === 'seats') {
        const groups = (await agentModeState(tx, projectId)).statuses.map(status => status.category);
        const missing = (['in_progress', 'done'] as const).filter(group => !groups.includes(group));
        if (missing.length) {
          throw Object.assign(new HandoffError('status_groups_required', `Before this project uses seats, put a status in ${missing.map(group => `the ${group.replace('_', ' ')} group`).join(' and in ')}: a run moves its issue there when it starts and when it is done`, 422), { body: { missing } });
        }
      } else if (await tx.agentRun.count({ where: { endedAt: null, issue: { projectId } } })) {
        throw new HandoffError('run_open', 'A run is open in this project. Let it finish, or clear it on its issue, before switching back to handoffs', 409);
      }
      await tx.project.update({ where: { id: projectId }, data: { agentMode: mode, agentSwitchedAt: mode === 'seats' ? new Date() : null } });
      await tx.appAuditLog.create({ data: { workspaceId, actorId, action: 'project.agent_mode', details: { projectId, from: project.agentMode, to: mode } } });
    }
    if (input.carryOver?.length) {
      // While handoffs work, an issue with a claim that also went to a seat would have two owners.
      if (mode !== 'seats') throw new HandoffError('invalid_request', 'Claims are carried over only in a project that uses seats');
      const { claims, carryTo } = await agentModeState(tx, projectId);
      if (!carryTo) throw new HandoffError('no_default_seat', 'The project has no developer seat to carry claims over to', 409);
      for (const issueId of new Set(input.carryOver)) {
        const claim = claims.find(candidate => candidate.issueId === issueId);
        if (!claim) throw new HandoffError('invalid_request', 'An issue in this request has no recent claim to carry over');
        await assertAssignable(tx, { workspaceId, projectId, agentRequestRole: null }, carryTo.userId);
        const now = new Date();
        await tx.issue.update({ where: { id: issueId }, data: { assigneeId: carryTo.userId } });
        if (claim.assigneeId) await tx.issueAssignee.deleteMany({ where: { issueId, userId: claim.assigneeId, role: 'ASSIGNEE' } });
        await tx.issueAssignee.upsert({ where: { issueId_userId: { issueId, userId: carryTo.userId } },
          create: { issueId, userId: carryTo.userId, role: 'ASSIGNEE', status: 'APPROVED', assignedAt: now, approvedAt: now, approvedBy: actorId },
          update: { role: 'ASSIGNEE', status: 'APPROVED', assignedAt: now, approvedAt: now, approvedBy: actorId } });
        await tx.issueActivity.create({ data: { action: 'ASSIGNED', itemType: 'ISSUE', itemId: issueId, userId: actorId, workspaceId, projectId,
          fieldName: 'assignee', oldValue: claim.assigneeId ?? '', newValue: carryTo.userId,
          details: JSON.stringify({ reason: 'seat_carry_over', agent: claim.agent, handoffId: claim.handoffId }) } });
      }
    }
    return agentModeState(tx, projectId);
  });
}
