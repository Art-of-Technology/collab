import 'server-only';
import semver from 'semver';
import { prisma } from '@/lib/prisma';
import { releaseAccessWhere, versionAccessWhere } from '@/lib/github/repository-access';

type GitHubRelease = {
  id: number; tag_name: string; name: string | null; body: string | null;
  draft: boolean; prerelease: boolean; published_at: string | null; html_url: string;
};

export async function syncAccessibleReleases(repositoryId: string, userId: string, releases: GitHubRelease[]) {
  const ids: string[] = [];
  for (const release of releases) {
    const versionString = release.tag_name.replace(/^v/, '');
    const parsed = semver.parse(versionString);
    let version = await prisma.version.findFirst({
      where: { repositoryId, version: versionString }, select: { id: true },
    });
    if (version && !await prisma.version.findFirst({
      where: { id: version.id, ...versionAccessWhere(userId) }, select: { id: true },
    })) continue;
    const existing = await prisma.release.findFirst({
      where: { repositoryId, tagName: release.tag_name }, select: { id: true },
    });
    if (existing && !await prisma.release.findFirst({
      where: { id: existing.id, ...releaseAccessWhere(userId) }, select: { id: true },
    })) continue;
    if (!version && parsed) {
      version = await prisma.version.create({
        data: {
          repositoryId, version: versionString, major: parsed.major, minor: parsed.minor, patch: parsed.patch,
          releaseType: 'MINOR', status: release.draft ? 'PENDING' : 'RELEASED',
          environment: release.prerelease ? 'staging' : 'production',
          releasedAt: release.published_at ? new Date(release.published_at) : null,
        },
        select: { id: true },
      });
    }
    if (!version) continue;
    const data = {
      name: release.name || release.tag_name, description: release.body, isDraft: release.draft,
      isPrerelease: release.prerelease, publishedAt: release.published_at ? new Date(release.published_at) : null,
      githubUrl: release.html_url,
    };
    const synced = await prisma.release.upsert({
      where: { repositoryId_tagName: { repositoryId, tagName: release.tag_name } },
      update: data,
      create: { ...data, repositoryId, versionId: version.id, githubReleaseId: release.id.toString(), tagName: release.tag_name },
      select: { id: true },
    });
    ids.push(synced.id);
  }
  return prisma.release.findMany({ where: { repositoryId, id: { in: ids }, ...releaseAccessWhere(userId) } });
}
