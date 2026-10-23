import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import type { DashboardScope, WorkspaceIssueOverview } from '@/types/workspace-dashboard';

const projectSelect = { id: true, slug: true, name: true, color: true } as const;
const issueSelect = {
  id: true, issueKey: true, title: true, status: true, statusValue: true,
  dueDate: true, updatedAt: true, project: { select: projectSelect },
  projectStatus: { select: { displayName: true } },
} as const satisfies Prisma.IssueSelect;
const statusFields = ['projectId', 'statusId', 'status', 'statusValue'] as const;
const legacyFinalStatuses = new Set(['done', 'complete', 'completed', 'closed', 'resolved', 'cancelled', 'canceled']);

type StatusGroup = {
  projectId: string;
  statusId: string | null;
  status: string | null;
  statusValue: string | null;
  _count: { id: number };
};

export async function loadWorkspaceIssueOverview({
  actorId, workspaceId, scope, projectSearch, projectPage, now = new Date(),
}: {
  actorId: string;
  workspaceId: string;
  scope: DashboardScope;
  projectSearch: string;
  projectPage: number;
  now?: Date;
}): Promise<WorkspaceIssueOverview> {
  try {
    if (!actorId || !workspaceId) return { kind: 'denied' };
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, ...postWorkspaceAccessWhere(actorId) },
      select: { id: true },
    });
    if (!workspace) return { kind: 'denied' };
    const permission = await checkUserPermission(actorId, workspaceId, Permission.VIEW_TASKS);
    if (permission.reason === 'Internal error') return { kind: 'unavailable' };
    if (!permission.hasPermission) return { kind: 'denied' };

    const activeProjects = {
      workspaceId,
      workspace: postWorkspaceAccessWhere(actorId),
      OR: [{ isArchived: false }, { isArchived: null }],
    } satisfies Prisma.ProjectWhereInput;
    const projects = await prisma.project.findMany({ where: activeProjects, select: projectSelect });
    const projectIds = projects.map(project => project.id);
    const scopedIssues = {
      workspaceId,
      projectId: { in: projectIds },
      project: activeProjects,
      ...(scope === 'mine' ? { assigneeId: actorId } : {}),
      AND: [issueReadAccessWhere(actorId), {
        OR: projects.map(project => ({
          projectId: project.id,
          OR: [{ statusId: null }, { projectStatus: { projectId: project.id } }],
        })),
      }],
    } satisfies Prisma.IssueWhereInput;
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const statuses = projectIds.length ? await prisma.projectStatus.findMany({
      where: { projectId: { in: projectIds }, project: activeProjects },
      select: { id: true, projectId: true, isFinal: true },
    }) : [];
    const finalIds = new Set(statuses.filter(status => status.isFinal).map(status => status.id));
    // A linked project status is authoritative; legacy strings apply only without a statusId.
    const isOpen = (group: StatusGroup) => group.statusId !== null
      ? !finalIds.has(group.statusId)
      : !legacyFinalStatuses.has((group.statusValue?.trim() || group.status?.trim() || '').toLowerCase());

    const [allGroups, overdueGroups, soonGroups, recentIssues] = projectIds.length ? await Promise.all([
      prisma.issue.groupBy({ by: [...statusFields], where: scopedIssues, _count: { id: true }, _max: { updatedAt: true } }),
      prisma.issue.groupBy({ by: [...statusFields], where: { ...scopedIssues, dueDate: { lt: now } }, _count: { id: true } }),
      prisma.issue.groupBy({ by: [...statusFields], where: { ...scopedIssues, dueDate: { gte: now, lte: soon } }, _count: { id: true } }),
      prisma.issue.findMany({ where: scopedIssues, select: issueSelect, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 6 }),
    ]) : [[], [], [], []];
    const openGroups = allGroups.filter(isOpen);
    const attentionIssues = openGroups.length ? await prisma.issue.findMany({
      where: {
        AND: [scopedIssues, { OR: openGroups.map(({ projectId, statusId, status, statusValue }) => ({ projectId, statusId, status, statusValue })) }],
        dueDate: { lte: soon },
      },
      select: issueSelect,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 8,
    }) : [];

    const rows = new Map(projects.map(project => [project.id, {
      ...project, openIssues: 0, overdueIssues: 0, dueSoonIssues: 0, lastIssueUpdatedAt: null as string | null,
    }]));
    for (const group of allGroups) {
      const row = rows.get(group.projectId)!;
      if (isOpen(group)) row.openIssues += group._count.id;
      const updatedAt = group._max.updatedAt?.toISOString();
      if (updatedAt && (!row.lastIssueUpdatedAt || updatedAt > row.lastIssueUpdatedAt)) row.lastIssueUpdatedAt = updatedAt;
    }
    for (const group of overdueGroups) if (isOpen(group)) rows.get(group.projectId)!.overdueIssues += group._count.id;
    for (const group of soonGroups) if (isOpen(group)) rows.get(group.projectId)!.dueSoonIssues += group._count.id;

    const allRows = [...rows.values()];
    const search = projectSearch.trim().slice(0, 120);
    const matchingRows = allRows.filter(project => `${project.name} ${project.slug}`.toLowerCase().includes(search.toLowerCase()));
    matchingRows.sort((a, b) => b.overdueIssues - a.overdueIssues || b.dueSoonIssues - a.dueSoonIssues
      || (b.lastIssueUpdatedAt || '').localeCompare(a.lastIssueUpdatedAt || '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const projectPages = Math.max(1, Math.ceil(matchingRows.length / 10));
    const page = Math.max(1, Math.min(projectPages, Number.isFinite(projectPage) ? Math.floor(projectPage) : 1));
    const serialize = (issue: Prisma.IssueGetPayload<{ select: typeof issueSelect }>) => ({
      id: issue.id, issueKey: issue.issueKey, title: issue.title, project: issue.project,
      status: issue.projectStatus?.displayName || issue.statusValue || issue.status || 'Unknown',
      dueDate: issue.dueDate?.toISOString() || null, updatedAt: issue.updatedAt.toISOString(),
    });
    return {
      kind: 'ready', scope, generatedAt: now.toISOString(),
      summary: {
        visibleProjects: projects.length,
        projectsWithOpenWork: allRows.filter(project => project.openIssues > 0).length,
        openIssues: allRows.reduce((sum, project) => sum + project.openIssues, 0),
        overdueIssues: allRows.reduce((sum, project) => sum + project.overdueIssues, 0),
        dueSoonIssues: allRows.reduce((sum, project) => sum + project.dueSoonIssues, 0),
      },
      attention: attentionIssues.map(serialize), recent: recentIssues.map(serialize),
      projects: matchingRows.slice((page - 1) * 10, page * 10),
      projectSearch: search, projectPage: page, projectPages, matchingProjects: matchingRows.length,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}
