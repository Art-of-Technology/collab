import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { requireRepositoryAccess } from '@/lib/github/repository-access';

export async function regenerateVersion(
  repositoryId: string,
  versionId: string,
  userId: string,
  generate: (issues: { key: string; title: string; type: string }[]) => Promise<{ changelog: string; summary: string }>,
) {
  const read = (db: Pick<typeof prisma, 'version'>) => db.version.findFirst({
    where: {
      id: versionId, repositoryId,
      repository: { project: issueAccessWhere(userId) },
      issues: { some: {}, every: { issue: issueReadAccessWhere(userId) } },
    },
    select: {
      id: true, updatedAt: true, major: true, minor: true, patch: true, releaseType: true, environment: true,
      repository: { select: { projectId: true, project: { select: { workspaceId: true } } } },
      issues: { where: { issue: issueReadAccessWhere(userId) }, orderBy: { issueId: 'asc' }, select: {
        id: true, addedAt: true, issue: { select: {
          id: true, issueKey: true, title: true, type: true, updatedAt: true,
          workspaceId: true, projectId: true, statusId: true,
          project: { select: { workspaceId: true } },
          projectStatus: { select: { projectId: true, project: { select: { workspaceId: true } } } },
        } },
      } },
    },
  });
  if (await requireRepositoryAccess(repositoryId) !== userId) throw new Error('Repository not found');
  const source = await read(prisma);
  if (!source?.issues.length) throw new Error('Version not found');
  const generated = await generate(source.issues.map(({ issue }) => ({ key: issue.issueKey || '', title: issue.title, type: issue.type })));
  if (!generated.changelog.trim() || !generated.summary.trim()) throw new Error('Empty generated content');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Version" WHERE id = ${versionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Repository" WHERE id = ${repositoryId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Account" WHERE "userId" = ${userId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "userId" = ${userId} FOR SHARE`;
    const issues = source.issues.map(({ issue }) => issue);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Issue" WHERE id IN (${Prisma.join(issues.map(i => i.id))}) FOR SHARE`);
    const statuses = issues.flatMap(i => i.statusId ? [i.statusId] : []);
    if (statuses.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "ProjectStatus" WHERE id IN (${Prisma.join(statuses)}) FOR SHARE`);
    const projects = [...new Set([source.repository.projectId, ...issues.flatMap(i => [i.projectId, ...(i.projectStatus ? [i.projectStatus.projectId] : [])])])];
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Project" WHERE id IN (${Prisma.join(projects)}) FOR SHARE`);
    const workspaces = [...new Set([source.repository.project.workspaceId, ...issues.flatMap(i => [i.workspaceId, i.project.workspaceId,
      ...(i.projectStatus ? [i.projectStatus.project.workspaceId] : [])])])];
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Workspace" WHERE id IN (${Prisma.join(workspaces)}) FOR SHARE`);
    if (await requireRepositoryAccess(repositoryId) !== userId || JSON.stringify(await read(tx)) !== JSON.stringify(source)) {
      throw new Error('Recovery inputs changed');
    }
    return tx.version.create({
      data: {
        repositoryId, version: `${source.major}.${source.minor}.${source.patch}-recovery.${randomUUID()}`, major: source.major, minor: source.minor, patch: source.patch,
        releaseType: source.releaseType, environment: 'recovery', status: 'PENDING',
        aiChangelog: generated.changelog, aiSummary: generated.summary,
        issues: { create: issues.map(issue => ({ issueId: issue.id })) },
      },
      select: { id: true, aiChangelog: true, aiSummary: true },
    });
  });
}
