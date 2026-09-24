import { PrismaClient } from '@prisma/client';

// Credentials require an explicit select at the authentication/integration boundary.
const options = {
  omit: { user: { hashedPassword: true, githubAccessToken: true } }
} as const;
const globalForPrisma = global as unknown as { prisma: PrismaClient<typeof options> };

export const prisma = globalForPrisma.prisma || new PrismaClient(options);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
