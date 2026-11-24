import 'server-only';
import { Prisma } from '@prisma/client';
import { LEGACY_FINAL_STATUSES } from '@/constants/project-statuses';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import type { DashboardScope, WorkspaceIssueOverview } from '@/types/workspace-dashboard';

const projectSelect = { id: true, slug: true, name: true, color: true } as const;
// ECMAScript trim() whitespace, including non-breaking spaces in legacy status values.
const statusWhitespace = '\u0009\u000a\u000b\u000c\u000d \u00a0\u1680\u2000\u2001\u2002\u2003\u2004'
  + '\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

type IssueTotals = {
  projectId: string;
  openIssues: bigint;
  overdueIssues: bigint;
  dueSoonIssues: bigint;
  lastIssueUpdatedAt: Date;
};

type PreviewIssue = {
  id: string;
  issueKey: string | null;
  title: string;
  projectId: string;
  status: string;
  dueDate: Date | null;
  updatedAt: Date;
};

export async function loadWorkspaceIssueOverview({
  actorId, workspaceId, scope, projectSearch, projectPage, now = new Date(),
}: {
  actorId: string;
  workspaceId: string;
  scope: DashboardScope;
  projectSearch: string;
  projectPage: number;
  dormant?: boolean;
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
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Prisma stores DateTime columns as UTC timestamps without a time zone.
    const nowUtc = Prisma.sql`(${now}::timestamptz AT TIME ZONE 'UTC')`;
    const soonUtc = Prisma.sql`(${soon}::timestamptz AT TIME ZONE 'UTC')`;
    // Raw reads must apply workspace access and Trash visibility themselves.
    // The status join also verifies that a linked status belongs to the issue's project.
    const scopedIssues = Prisma.sql`
      WITH scoped_issues AS (
        SELECT i.id, i."issueKey", i.title, i."projectId", i."dueDate", i."updatedAt",
          COALESCE(NULLIF(s."displayName", ''), NULLIF(i."statusValue", ''), NULLIF(i.status, ''), 'Unknown') AS status,
          CASE WHEN i."statusId" IS NOT NULL THEN NOT s."isFinal"
            ELSE lower(COALESCE(NULLIF(btrim(i."statusValue", ${statusWhitespace}), ''),
              btrim(i.status, ${statusWhitespace}), '') COLLATE "C") NOT IN (${Prisma.join([...LEGACY_FINAL_STATUSES])})
          END AS "isOpen"
        FROM "Issue" i
        JOIN "Project" p ON p.id = i."projectId" AND p."workspaceId" = i."workspaceId"
        JOIN "Workspace" w ON w.id = p."workspaceId"
        LEFT JOIN "ProjectStatus" s ON s.id = i."statusId" AND s."projectId" = p.id
        WHERE w.id = ${workspaceId}
          AND (w."ownerId" = ${actorId} OR EXISTS (
            SELECT 1 FROM "WorkspaceMember" m
            WHERE m."workspaceId" = w.id AND m."userId" = ${actorId} AND m.status
          ))
          AND p.id = ANY(${projectIds}::text[])
          AND p."isArchived" IS NOT TRUE
          AND i."deletedAt" IS NULL
          -- Counts and previews are of work alone, as withoutRequests() filters Prisma reads.
          AND i."agentRequestRole" IS NULL
          AND (i."statusId" IS NULL OR s.id IS NOT NULL)
          AND (${scope !== 'mine'} OR i."assigneeId" = ${actorId})
      )
    `;
    const previewFields = Prisma.sql`id, "issueKey", title, "projectId", status, "dueDate", "updatedAt"`;
    const [totals, attentionIssues, recentIssues] = projects.length ? await Promise.all([
      prisma.$queryRaw<IssueTotals[]>`
        ${scopedIssues}
        SELECT "projectId", COUNT(*) FILTER (WHERE "isOpen") AS "openIssues",
          COUNT(*) FILTER (WHERE "isOpen" AND "dueDate" < ${nowUtc}) AS "overdueIssues",
          COUNT(*) FILTER (WHERE "isOpen" AND "dueDate" BETWEEN ${nowUtc} AND ${soonUtc}) AS "dueSoonIssues",
          MAX("updatedAt") AS "lastIssueUpdatedAt"
        FROM scoped_issues
        GROUP BY "projectId"
      `,
      prisma.$queryRaw<PreviewIssue[]>`
        ${scopedIssues}
        SELECT ${previewFields} FROM scoped_issues
        WHERE "isOpen" AND "dueDate" <= ${soonUtc}
        ORDER BY "dueDate" ASC, id ASC
        LIMIT 8
      `,
      prisma.$queryRaw<PreviewIssue[]>`
        ${scopedIssues}
        SELECT ${previewFields} FROM scoped_issues
        ORDER BY "updatedAt" DESC, id ASC
        LIMIT 6
      `,
    ]) : [[], [], []];

    const projectsById = new Map(projects.map(project => [project.id, project]));
    const totalsByProject = new Map(totals.map(row => [row.projectId, row]));
    const allRows = projects.map(project => {
      const row = totalsByProject.get(project.id);
      return {
        ...project,
        openIssues: Number(row?.openIssues ?? 0),
        overdueIssues: Number(row?.overdueIssues ?? 0),
        dueSoonIssues: Number(row?.dueSoonIssues ?? 0),
        lastIssueUpdatedAt: row?.lastIssueUpdatedAt.toISOString() ?? null,
      };
    });
    const search = projectSearch.trim().slice(0, 120);
    const matchingRows = allRows.filter(project => `${project.name} ${project.slug}`.toLowerCase().includes(search.toLowerCase()));
    matchingRows.sort((a, b) => b.overdueIssues - a.overdueIssues || b.dueSoonIssues - a.dueSoonIssues
      || (b.lastIssueUpdatedAt || '').localeCompare(a.lastIssueUpdatedAt || '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const projectPages = Math.max(1, Math.ceil(matchingRows.length / 10));
    const page = Math.max(1, Math.min(projectPages, Number.isFinite(projectPage) ? Math.floor(projectPage) : 1));
    const serialize = (issue: PreviewIssue) => ({
      id: issue.id, issueKey: issue.issueKey, title: issue.title, project: projectsById.get(issue.projectId)!,
      status: issue.status,
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
