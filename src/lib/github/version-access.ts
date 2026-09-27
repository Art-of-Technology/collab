import type { Prisma } from '@prisma/client';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { repositoryAccessWhere } from './access';

export function versionAccessWhere(userId: string) {
  return {
    repository: repositoryAccessWhere(userId),
    issueAccessInvalidated: false,
    issues: { every: { issue: issueReadAccessWhere(userId) } },
  } satisfies Prisma.VersionWhereInput;
}
