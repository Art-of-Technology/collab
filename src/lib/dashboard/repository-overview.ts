import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { repositoryAccessWhere } from '@/lib/github/access';
import { versionAccessWhere } from '@/lib/github/version-access';
import { checkUserPermission, Permission } from '@/lib/permissions';
import type { RepositoryOverview } from '@/types/workspace-dashboard';

const projectSelect = { id: true, slug: true, name: true, color: true } as const;
const connectionSelect = {
  id: true, provider: true, repositoryPath: true, url: true, syncedAt: true,
  project: { select: projectSelect },
} as const;
const repositorySelect = {
  id: true, fullName: true, syncedAt: true, project: { select: projectSelect },
} as const;

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/$/, '');
  if (url.hostname === 'github.com') url.pathname = url.pathname.replace(/^\/[^/]+\/[^/]+/, path => path.toLowerCase());
  return url.href.replace(/\/$/, '');
}

/** Cached repository activity across the workspace; the My work filter does not apply. */
export async function loadWorkspaceRepositoryOverview({ actorId, workspaceId }: {
  actorId: string;
  workspaceId: string;
}): Promise<RepositoryOverview> {
  if (!actorId || !workspaceId) return { kind: 'denied' };
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, ...postWorkspaceAccessWhere(actorId) }, select: { id: true },
    });
    if (!workspace) return { kind: 'denied' };
    const permission = await checkUserPermission(actorId, workspace.id, Permission.VIEW_TASKS);
    if (!permission.hasPermission) return { kind: permission.reason === 'Internal error' ? 'unavailable' : 'denied' };

    const projectWhere = {
      workspaceId: workspace.id,
      workspace: postWorkspaceAccessWhere(actorId),
      OR: [{ isArchived: false }, { isArchived: null }],
    } satisfies Prisma.ProjectWhereInput;
    const connectionWhere = { isActive: true, project: projectWhere };
    const repositoryWhere = {
      AND: [repositoryAccessWhere(actorId), { isActive: true, project: projectWhere }],
    } satisfies Prisma.RepositoryWhereInput;
    const sources = new Map<string, boolean>();
    const addSource = (projectId: string, identity: string, syncedAt: Date | null) => {
      const key = `${projectId}:${identity}`;
      sources.set(key, !!syncedAt || sources.get(key) === true);
    };

    const [connections, repositories] = await Promise.all([
      prisma.gitConnection.findMany({ where: connectionWhere, select: connectionSelect }),
      prisma.repository.findMany({ where: repositoryWhere, select: repositorySelect }),
    ]);
    for (const row of connections) {
      const url = safeUrl(row.url);
      addSource(row.project.id, url ? canonicalUrl(url) : `connection:${row.id}`, row.syncedAt);
    }
    for (const row of repositories) addSource(row.project.id, canonicalUrl(`https://github.com/${row.fullName}`), row.syncedAt);

    const [activity, pulls, releases] = await Promise.all([
      prisma.gitConnectionActivity.findMany({
        where: { kind: 'pull_request', connection: connectionWhere }, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: 6,
        select: { id: true, title: true, url: true, state: true, date: true, connection: { select: connectionSelect } },
      }),
      prisma.pullRequest.findMany({
        where: { repository: repositoryWhere, githubUpdatedAt: { not: null } }, orderBy: [{ githubUpdatedAt: 'desc' }, { id: 'asc' }], take: 6,
        select: { id: true, githubPrId: true, title: true, state: true, githubUpdatedAt: true, repository: { select: repositorySelect } },
      }),
      prisma.release.findMany({
        where: { repository: repositoryWhere, version: versionAccessWhere(actorId), isDraft: false, publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: 6,
        select: { id: true, name: true, tagName: true, githubUrl: true, publishedAt: true, repository: { select: repositorySelect } },
      }),
    ]);
    type Item = Extract<RepositoryOverview, { kind: 'ready' }>['items'][number];
    const items: Item[] = [
      ...activity.map(row => ({
        id: `connection:${row.id}`, project: row.connection.project, provider: row.connection.provider,
        repository: row.connection.repositoryPath, kind: 'pull_request' as const, title: row.title,
        url: safeUrl(row.url), state: row.state, date: row.date.toISOString(),
        refreshedAt: row.connection.syncedAt?.toISOString() ?? null, refreshIsAttempt: false,
      })),
      ...pulls.map(row => ({
        id: `github:${row.id}`, project: row.repository.project, provider: 'github',
        repository: row.repository.fullName, kind: 'pull_request' as const, title: row.title,
        url: safeUrl(`https://github.com/${row.repository.fullName}/pull/${row.githubPrId}`),
        state: row.state, date: row.githubUpdatedAt!.toISOString(),
        refreshedAt: row.repository.syncedAt?.toISOString() ?? null, refreshIsAttempt: true,
      })),
      ...releases.map(row => ({
        id: `release:${row.id}`, project: row.repository.project, provider: 'github',
        repository: row.repository.fullName, kind: 'release' as const, title: row.name || row.tagName,
        url: safeUrl(row.githubUrl), state: null, date: row.publishedAt!.toISOString(),
        refreshedAt: row.repository.syncedAt?.toISOString() ?? null, refreshIsAttempt: true,
      })),
    ];
    const seen = new Set<string>();
    const recent = items.sort((a, b) => b.date.localeCompare(a.date)).filter(item => {
      const key = `${item.project.id}:${item.kind}:${item.url ? canonicalUrl(item.url) : item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
    return { kind: 'ready', connectionCount: sources.size, neverRefreshedCount: [...sources.values()].filter(value => !value).length, items: recent };
  } catch {
    console.error('Workspace repository overview unavailable');
    return { kind: 'unavailable' };
  }
}
