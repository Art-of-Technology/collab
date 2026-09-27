import type { Prisma } from '@prisma/client';

export function appOwnerWhere(userId: string): Prisma.AppWhereInput {
  return userId ? { userId } : { id: { in: [] } };
}

export function appReadAccessWhere(userId?: string): Prisma.AppWhereInput {
  return userId ? { OR: [{ status: 'PUBLISHED' }, appOwnerWhere(userId)] } : { status: 'PUBLISHED' };
}
