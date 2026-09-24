import 'server-only';
import type { Prisma } from '@prisma/client';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function requireRepositoryAccess(repositoryId: string): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  if (typeof repositoryId !== 'string' || !repositoryId) throw new Error('Repository not found');
  const repository = await prisma.repository.findFirst({
    where: {
      id: repositoryId,
      project: { workspace: { OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id, status: true } } },
      ] } },
    },
    select: { id: true },
  });
  if (!repository) throw new Error('Repository not found');
  return user.id;
}

export function versionAccessWhere(userId: string) {
  return { issues: { every: { issue: issueReadAccessWhere(userId) } } } satisfies Prisma.VersionWhereInput;
}

export function releaseAccessWhere(userId: string) {
  return { version: versionAccessWhere(userId) } satisfies Prisma.ReleaseWhereInput;
}
