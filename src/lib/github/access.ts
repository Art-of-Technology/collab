import type { Prisma } from '@prisma/client';
import { postWorkspaceAccessWhere } from '@/lib/post-access';

export function repositoryAccessWhere(userId: string): Prisma.RepositoryWhereInput {
  return { project: { workspace: postWorkspaceAccessWhere(userId) } };
}
