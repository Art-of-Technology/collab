import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { issueAccessWhere } from '@/lib/issue-finder';

export function viewReadAccessWhere(userId: string) {
  return {
    workspace: postWorkspaceAccessWhere(userId),
    OR: [
      { ownerId: userId },
      { visibility: 'WORKSPACE' },
      { visibility: 'SHARED', sharedWith: { has: userId } },
    ],
  } satisfies Prisma.ViewWhereInput;
}

export function viewEditAccessWhere(userId: string) {
  return {
    workspace: postWorkspaceAccessWhere(userId),
    OR: [{ ownerId: userId }, { visibility: 'WORKSPACE' }],
  } satisfies Prisma.ViewWhereInput;
}

/** Validate supplied references; cross-workspace configuration still requires current access. */
export async function viewReferencesAllowed(userId: string, workspaceId: string, input: {
  projectIds?: unknown; workspaceIds?: unknown; sharedWith?: unknown; ownerId?: unknown;
}): Promise<boolean> {
  for (const value of [input.projectIds, input.workspaceIds, input.sharedWith]) {
    if (value !== undefined && (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id))) return false;
  }
  if (input.projectIds !== undefined) {
    const ids = [...new Set(input.projectIds as string[])];
    const projects = await prisma.project.findMany({ where: { id: { in: ids }, ...issueAccessWhere(userId) }, select: { id: true } });
    if (projects.length !== ids.length) return false;
  }
  if (input.workspaceIds !== undefined) {
    const ids = [...new Set(input.workspaceIds as string[])];
    const workspaces = await prisma.workspace.findMany({ where: { id: { in: ids }, ...postWorkspaceAccessWhere(userId) }, select: { id: true } });
    if (workspaces.length !== ids.length) return false;
  }
  if (input.sharedWith !== undefined) {
    const ids = [...new Set(input.sharedWith as string[])];
    const users = await prisma.user.findMany({ where: { id: { in: ids }, OR: [
      { ownedWorkspaces: { some: { id: workspaceId } } },
      { workspaceMemberships: { some: { workspaceId, status: true } } },
    ] }, select: { id: true } });
    if (users.length !== ids.length) return false;
  }
  if (input.ownerId !== undefined) {
    if (typeof input.ownerId !== 'string' || !input.ownerId) return false;
    if (!await prisma.workspace.findFirst({ where: { id: workspaceId, ...postWorkspaceAccessWhere(input.ownerId) }, select: { id: true } })) return false;
  }
  return true;
}
