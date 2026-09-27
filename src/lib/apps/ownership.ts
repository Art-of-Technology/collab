import type { Prisma } from '@prisma/client';

export function appOwnerWhere(userId: string): Prisma.AppWhereInput {
  return userId ? { userId } : { id: { in: [] } };
}
