import type { Prisma } from '@prisma/client';
import type { prisma } from './prisma';
import { HandoffError } from './agent-handoffs';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;

/** The request roles each seat role takes; null is an ordinary issue. An issue's request role is `review` where the seat's role is `reviewer`. A lead takes the epic it works from, and no request. */
export const SEAT_TAKES: Record<string, (string | null)[]> = { developer: [null, 'developer'], reviewer: ['review'], release: ['release'], security: ['security'], lead: [null] };

/**
 * The one place that decides who may be assigned an issue. Every path that sets an assignee calls it,
 * so a rule added here holds everywhere: the workspace's owner, or a member whose membership is on; and when
 * that member is a seat, only issues of the seat's project and role. A request is known by the field that only
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

  const seat = await db.agentSeat.findUnique({ where: { userId }, select: { projectId: true, role: true, retiredAt: true } });
  if (!seat) return;
  if (seat.retiredAt) throw new HandoffError('assignee_not_found', 'This seat is retired');
  if (seat.projectId !== issue.projectId) throw new HandoffError('wrong_project', 'A seat can be assigned only issues of its own project', 403);
  if (!SEAT_TAKES[seat.role]?.includes(issue.agentRequestRole)) {
    throw new HandoffError('role_mismatch', seat.role === 'lead' ? 'A lead seat takes no requests' : seat.role === 'developer'
      ? 'A developer seat does not take review, release or security requests'
      : `A ${seat.role} seat takes only ${seat.role === 'reviewer' ? 'review' : seat.role} requests`, 422);
  }
}
