import type { Prisma } from '@prisma/client';
import { prisma } from "@/lib/prisma";

export function issueAccessWhere(userId: string) {
  return { workspace: { OR: [
    { ownerId: userId },
    { members: { some: { userId, status: true } } }
  ] } };
}

export function issueReadAccessWhere(userId: string) {
  return {
    ...issueAccessWhere(userId),
    project: issueAccessWhere(userId),
    OR: [
      { statusId: null },
      { projectStatus: { project: issueAccessWhere(userId) } }
    ]
  } satisfies Prisma.IssueWhereInput;
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
 * Find an issue by ID or issue key within issueReadAccessWhere's scope
 * 
 * @param idOrKey - Stored ID or exact issue key
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
      AND: [{ OR: [{ id: idOrKey }, { issueKey: idOrKey }] }],
      ...(workspaceId && { workspaceId }),
      ...issueReadAccessWhere(userId)
    },
    ...(include && { include }),
    ...(select && { select })
  }) as Promise<T | null>;
}

/**
 * Use only after issueReadAccessWhere authorizes the root issue; root project
 * and workspace projections rely on that check.
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
    where: issueReadAccessWhere(userId),
    select: { id: true, title: true, issueKey: true, type: true }
  },
  children: {
    where: issueReadAccessWhere(userId),
    select: { id: true, title: true, issueKey: true, type: true, status: true }
  },
  projectStatus: {
    where: { project: issueAccessWhere(userId) },
    select: { id: true, name: true, displayName: true, color: true, iconName: true, order: true }
  },
  comments: {
    include: {
      author: { select: { id: true, name: true, email: true, image: true, useCustomAvatar: true } }
    },
    orderBy: { createdAt: 'asc' as const }
  },
  _count: { select: { children: { where: issueReadAccessWhere(userId) }, comments: true } }
} as const satisfies Prisma.IssueInclude);

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

