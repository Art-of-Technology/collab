import { prisma } from "@/lib/prisma";
import { isIssueKey } from "@/lib/shared-issue-key-utils";

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
  /** User ID for workspace access scoping (required for issue key searches without workspaceId) */
  userId?: string;
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
  options: FindIssueOptions = {}
): Promise<T | null> {
  const { include, select, workspaceId, userId } = options;

  if (isIssueKey(idOrKey)) {
    // Issue key format - requires workspace scoping
    const whereClause: any = { issueKey: idOrKey };
    
    if (workspaceId) {
      // If workspaceId is provided, use it directly
      whereClause.workspaceId = workspaceId;
    } else if (userId) {
      // If no workspaceId but userId is provided, scope to user's accessible workspaces
      whereClause.workspace = {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      };
    } else {
      // No workspace scoping - this could be dangerous but we allow it for backward compatibility
      console.warn(`Finding issue by key "${idOrKey}" without workspace scoping. This may return unexpected results.`);
    }
    
    return prisma.issue.findFirst({ 
      where: whereClause,
      ...(include && { include }),
      ...(select && { select })
    }) as Promise<T | null>;
  } else {
    // Direct ID format - no workspace scoping needed
    return prisma.issue.findUnique({ 
      where: { id: idOrKey },
      ...(include && { include }),
      ...(select && { select })
    }) as Promise<T | null>;
  }
}

/**
 * Standard issue include object commonly used across API routes
 */
export const STANDARD_ISSUE_INCLUDE = {
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
    select: { id: true, name: true, color: true }
  },
  parent: {
    select: { id: true, title: true, issueKey: true, type: true }
  },
  children: {
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
  _count: { select: { children: true, comments: true } }
} as const;

/**
 * Helper function to check if a user has access to a workspace
 */
export async function userHasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    }
  });
  return !!workspace;
}

