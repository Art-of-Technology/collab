import type { Prisma } from '@prisma/client';
import type { prisma } from './prisma';
import { HandoffError } from './agent-handoffs';
import { ROLE_CATALOGUE } from '@/lib/agent-role-catalogue';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;

/**
 * The one place that decides who may be assigned an issue. Every path that sets an assignee calls it,
 * so a rule added here holds everywhere: the workspace's owner, or a member whose membership is on; and when
 * that member is a seat, only issues of the seat's project and role. A seat of the whole workspace (CLB-615) takes issues
 * of its role in any project of its workspace; its Lead, only in a project without a lead of its own (CLB-952). A request is known by the field that only
 * filing a request sets, never by a label.
 */
export async function assertAssignable(
  db: DB,
  issue: { workspaceId: string; projectId: string; agentRequestRole: string | null },
  userId: string,
): Promise<void> {
  const workspace = await db.workspace.findFirst({
    where: { id: issue.workspaceId, OR: [{ ownerId: userId }, { members: { some: { userId, status: true } } }] },
    select: { id: true },
  });
  if (!workspace) throw new HandoffError('assignee_not_found', 'The assignee is not an active member of this workspace');

  const seat = await db.agentSeat.findUnique({ where: { userId }, select: { workspaceId: true, projectId: true, role: true, retiredAt: true } });
  if (!seat) return;
  if (seat.retiredAt) throw new HandoffError('assignee_not_found', 'This seat is retired');
  if (seat.projectId === null ? seat.workspaceId !== issue.workspaceId : seat.projectId !== issue.projectId) throw new HandoffError('wrong_project', 'A seat can be assigned only issues of its own project', 403);
  const role = ROLE_CATALOGUE.getRole(seat.role);
  if (!role?.issueKinds.includes(issue.agentRequestRole)) {
    throw new HandoffError('role_mismatch', seat.role === 'lead' ? 'A lead seat takes no requests' : seat.role === 'developer'
      ? 'A developer seat does not take review, release or security requests'
      : role?.requests.length ? `A ${seat.role} seat takes only ${role.requests.map(request => request.id).join(', ')} requests`
        : `A ${seat.role} seat does not take this kind of issue`, 422);
  }
  if (seat.role === 'lead' && seat.projectId === null) await assertNoProjectLead(db, issue.projectId);
}

/**
 * The workspace's Lead (CLB-952) leads only the projects that have no active lead seat of their own, so a project never
 * has two assigners: it is not given an issue of such a project, and places none there. The refusal names that lead.
 */
export async function assertNoProjectLead(db: DB, projectId: string): Promise<void> {
  const own = await db.agentSeat.findFirst({ where: { projectId, role: 'lead', retiredAt: null }, select: { name: true, project: { select: { name: true } } } });
  if (own) throw new HandoffError('project_has_lead', `${own.project?.name ?? 'This project'} has its own lead seat, ${own.name}: the workspace's Lead leads only the projects that have no lead`, 409);
}
