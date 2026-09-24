import type { Prisma } from '@prisma/client';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';

export async function validateIssueReferences(
  db: Prisma.TransactionClient,
  workspaceId: string,
  projectId: string,
  refs: { id?: string; parentId?: string | null; labels?: string[]; assigneeId?: string | null; reporterId?: string | null }
): Promise<string | null> {
  for (const userId of [refs.assigneeId, refs.reporterId]) {
    if (userId != null && (typeof userId !== 'string' || !userId || !await userHasWorkspaceAccess(userId, workspaceId))) {
      return 'Invalid issue participant';
    }
  }
  if (refs.parentId != null && (typeof refs.parentId !== 'string' || !refs.parentId || refs.parentId === refs.id ||
      !await db.issue.findFirst({ where: { id: refs.parentId, workspaceId, projectId }, select: { id: true } }))) {
    return 'Invalid parent issue';
  }
  if (refs.labels !== undefined) {
    if (!Array.isArray(refs.labels) || refs.labels.some(id => typeof id !== 'string' || !id)) return 'Invalid issue labels';
    const ids = [...new Set(refs.labels)];
    if (ids.length && await db.taskLabel.count({ where: { id: { in: ids }, workspaceId } }) !== ids.length) {
      return 'Invalid issue labels';
    }
  }
  return null;
}
