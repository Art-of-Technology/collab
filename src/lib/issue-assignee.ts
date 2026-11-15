import type { Prisma } from '@prisma/client';
import type { prisma } from './prisma';
import { HandoffError } from './agent-handoffs';

export { HandoffError };
type DB = Prisma.TransactionClient | typeof prisma;

/**
 * The one place that decides who may be assigned an issue. Every path that sets an assignee calls it,
 * so a rule added here holds everywhere. Today: the workspace's owner, or a member whose membership is on.
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
}
