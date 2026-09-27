import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { readForgeBindings } from './reader';

export class ForgeProjectWriteError extends Error {
  constructor() { super('This operation affects a Forge-connected project. Use its Forge board or disconnect it before deleting its workspace.'); }
}

export async function assertLegacyWorkspaceDeleteAllowed(workspaceId: string) {
  const bindings = await readForgeBindings();
  if (bindings.some(binding => binding.workspaceId === workspaceId)) {
    throw new ForgeProjectWriteError();
  }
  await assertIssueDeletionAllowed(
    { OR: [{ workspaceId }, { project: { workspaceId } }] },
    bindings.map(binding => binding.projectId),
  );
}

export async function assertLegacyIssueDeleteAllowed(issueId: string) {
  const bindings = await readForgeBindings();
  await assertIssueDeletionAllowed({ id: issueId }, bindings.map(binding => binding.projectId));
}

async function assertIssueDeletionAllowed(deleted: Prisma.IssueWhereInput, projectIds: string[]) {
  if (!projectIds.length) return;
  const affected = await prisma.issue.findFirst({
    where: {
      projectId: { in: projectIds },
      OR: [
        deleted,
        { parent: deleted },
        { sourceRelations: { some: { targetIssue: deleted } } },
        { targetRelations: { some: { sourceIssue: deleted } } },
      ],
    },
    select: { id: true },
  });
  if (affected) throw new ForgeProjectWriteError();
}

// Call after tenant authorization, before any mutation or transaction.
export async function assertLegacyProjectWriteAllowed(...projectIds: string[]) {
  const bindings = await readForgeBindings();
  if (bindings.some(binding => projectIds.includes(binding.projectId))) {
    throw new ForgeProjectWriteError();
  }
}

export async function assertLegacyIssueWriteAllowed(...issueIds: string[]) {
  const bindings = await readForgeBindings();
  if (!bindings.length) return;
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds } }, select: { projectId: true },
  });
  if (issues.some(issue => bindings.some(binding => binding.projectId === issue.projectId))) {
    throw new ForgeProjectWriteError();
  }
}
