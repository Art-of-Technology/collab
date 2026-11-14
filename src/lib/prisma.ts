import { Prisma, PrismaClient } from '@prisma/client';
import { databaseDiagnosticsExtension, withTransactionDiagnostics } from './database-diagnostics';
import { issueVisibilityExtension } from './issue-visibility';

// Credentials require an explicit select at the authentication/integration boundary.
const options = {
  omit: { user: { hashedPassword: true, githubAccessToken: true }, project: { coordinator: true }, agentHandoff: { claimedOnce: true } }
} as const;
const globalForPrisma = global as unknown as { prisma: PrismaClient<typeof options> };

// Bypass visibility only for the trash lifecycle and retained-relationship integrity guards.
const basePrisma = globalForPrisma.prisma || new PrismaClient(options);
const diagnosticPrisma = basePrisma.$extends(databaseDiagnosticsExtension);
const visiblePrisma = diagnosticPrisma.$extends(issueVisibilityExtension(Prisma.dmmf.datamodel.models));
export const issueTrashPrisma = withTransactionDiagnostics(diagnosticPrisma) as unknown as typeof basePrisma;
// Query rewriting preserves the public model/transaction API and result shape.
export const prisma = withTransactionDiagnostics(visiblePrisma) as unknown as typeof issueTrashPrisma;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;
