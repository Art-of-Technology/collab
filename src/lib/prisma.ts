import { Prisma, PrismaClient } from '@prisma/client';
import { issueVisibilityExtension } from './issue-visibility';

// Credentials require an explicit select at the authentication/integration boundary.
const options = {
  omit: { user: { hashedPassword: true, githubAccessToken: true }, project: { coordinator: true } }
} as const;
const globalForPrisma = global as unknown as { prisma: PrismaClient<typeof options> };

// Bypass visibility only for the trash lifecycle and retained-relationship integrity guards.
export const issueTrashPrisma = globalForPrisma.prisma || new PrismaClient(options);
// Query rewriting preserves the public model/transaction API and result shape.
export const prisma = issueTrashPrisma.$extends(issueVisibilityExtension(Prisma.dmmf.datamodel.models)) as unknown as typeof issueTrashPrisma;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = issueTrashPrisma;
