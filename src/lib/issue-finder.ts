import { prisma } from "@/lib/prisma";
import { isIssueKey } from "@/lib/shared-issue-key-utils";

export function issueAccessWhere(userId: string) {
  return { workspace: { OR: [
    { ownerId: userId },
    { members: { some: { userId, status: true } } }
  ] } };
}

/**
 * Options for finding issues
 */
export interface FindIssueOptions {
  /** Include related data in the result */
  include?: any;
  /** Select specific fields only */
  select?: any;
  /** Specific workspace ID to search in (optional) */
  workspaceId?: string;
  /** Authenticated user ID for workspace access scoping */
  userId: string;
}

/**
 * Find an issue by ID or issue key with proper workspace scoping
 * 
 * @param idOrKey - Either a UUID (direct ID) or issue key (e.g., "DEF-1")
 * @param options - Options for the search
 * @returns Promise<Issue | null>
 */
export async function findIssueByIdOrKey<T = any>(
  idOrKey: string, 
  options: FindIssueOptions
): Promise<T | null> {
  const { include, select, workspaceId, userId } = options;

  if (!userId || !idOrKey) return null;

  return prisma.issue.findFirst({
    where: {
      ...(isIssueKey(idOrKey) ? { issueKey: idOrKey } : { id: idOrKey }),
      ...(workspaceId && { workspaceId }),
      ...issueAccessWhere(userId)
    },
    ...(include && { include }),
    ...(select && { select })
  }) as Promise<T | null>;
}

/**
 * Standard issue include object commonly used across API routes
 */
export const getStandardIssueInclude = (userId: string) => ({
  assignee: {
    select: { id: true, name: true, email: true, image: true, useCustomAvatar: true }
  },
  reporter: {
    select: { id: true, name: true, email: true, image: true, useCustomAvatar: true }
  },
  project: {
    select: { id: true, name: true, slug: true, issuePrefix: true, description: true }
  },
  workspace: {
    select: { id: true, name: true, slug: true }
  },
  labels: {
    where: issueAccessWhere(userId),
    select: { id: true, name: true, color: true }
  },
  parent: {
    where: issueAccessWhere(userId),
    select: { id: true, title: true, issueKey: true, type: true }
  },
  children: {
    where: issueAccessWhere(userId),
    select: { id: true, title: true, issueKey: true, type: true, status: true }
  },
  projectStatus: {
    select: { id: true, name: true, displayName: true, color: true, iconName: true, order: true }
  },
  comments: {
    include: {
      author: { select: { id: true, name: true, email: true, image: true, useCustomAvatar: true } }
    },
    orderBy: { createdAt: 'asc' as const }
  },
  _count: { select: { children: { where: issueAccessWhere(userId) }, comments: true } }
} as const);

/**
 * Helper function to check if a user has access to a workspace
 */
export async function userHasWorkspaceAccess(userId: string, workspaceId: string | null): Promise<boolean> {
  if (!userId || !workspaceId) return false;

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, status: true } } }
      ]
    }
  });
  return !!workspace;
}

