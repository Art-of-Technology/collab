import type { Prisma } from '@prisma/client';

export function postAccessWhere(postId: string, userId: string): Prisma.PostWhereInput {
  if (!postId || !userId) return { id: { in: [] } };
  return {
    id: postId,
    workspace: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId, status: true } } },
      ],
    },
  };
}
