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

export function activityStatusAccessWhere(userId: string) {
  const nonStatusChange = { action: { not: 'STATUS_CHANGED' }, OR: [{ fieldName: null }, { fieldName: { notIn: ['status', 'statusId'] } }] };
  return {
    AND: [
      { OR: [
        { oldStatusId: null, OR: [nonStatusChange, { oldValue: null, details: null }] },
        { oldStatus: { project: issueAccessWhere(userId) } },
      ] },
      { OR: [
        { newStatusId: null, OR: [nonStatusChange, { newValue: null, details: null }] },
        { newStatus: { project: issueAccessWhere(userId) } },
      ] },
    ],
  } satisfies Prisma.IssueActivityWhereInput;
}

export async function activityReadAccessWhere(userId: string, where: Prisma.IssueActivityWhereInput): Promise<Prisma.IssueActivityWhereInput> {
  const scoped = { AND: [where, activityStatusAccessWhere(userId)] };
  const references = await prisma.issueActivity.findMany({
    where: scoped,
    select: { itemId: true, workspaceId: true, projectId: true },
    distinct: ['itemId', 'workspaceId', 'projectId'],
  });
  const issueIds = [...new Set(references.map(row => row.itemId))];
  const [accessible, workspaces, projects] = await Promise.all([
    prisma.issue.findMany({ where: { id: { in: issueIds }, ...issueReadAccessWhere(userId) }, select: { id: true } }),
    prisma.workspace.findMany({ where: { id: { in: references.map(row => row.workspaceId) }, ...issueAccessWhere(userId).workspace }, select: { id: true } }),
    prisma.project.findMany({ where: { id: { in: references.flatMap(row => row.projectId ? [row.projectId] : []) }, ...issueAccessWhere(userId) }, select: { id: true } }),
  ]);
  const projectIds = projects.map(project => project.id);
  return {
    AND: [
      scoped,
      { workspaceId: { in: workspaces.map(workspace => workspace.id) } },
      { OR: [{ projectId: null }, { projectId: { in: projectIds } }] },
      { itemId: { in: accessible.map(issue => issue.id) } },
    ],
  };
}

export async function canDeleteProjectStatuses(userId: string, statusIds: string[]): Promise<boolean> {
  if (!statusIds.length) return true;
  if (await prisma.issue.findFirst({
    where: { statusId: { in: statusIds }, NOT: issueReadAccessWhere(userId) }, select: { id: true },
  })) return false;
  const references = { OR: [{ oldStatusId: { in: statusIds } }, { newStatusId: { in: statusIds } }] };
  const accessible = await activityReadAccessWhere(userId, references);
  return !await prisma.issueActivity.findFirst({
    where: { AND: [references, { NOT: accessible }] }, select: { id: true },
  });
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
      AND: [{ OR: [{ id: idOrKey }, { issueKey: idOrKey }] }],
      ...(workspaceId && { workspaceId }),
      ...issueReadAccessWhere(userId)
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

