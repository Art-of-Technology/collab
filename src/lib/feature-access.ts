import type { Prisma } from '@prisma/client';

export function featureAccessWhere(userId: string): Prisma.FeatureRequestWhereInput {
  const workspace = { OR: [
    { ownerId: userId },
    { members: { some: { userId, status: true } } },
  ] };
  return { AND: [
    { OR: [{ workspaceId: null }, { workspace }] },
    { OR: [{ projectId: null }, { project: { workspace } }] },
  ] };
}
