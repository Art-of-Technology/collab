import type { Prisma } from '@prisma/client';

export class InvalidMilestone extends Error {
  constructor(message = 'Choose a milestone in this project') {
    super(message);
  }
}

type MilestoneDates = { type: string; startDate: string | Date | null; dueDate: string | Date | null };

export function milestoneDateError(current: MilestoneDates, patch: Partial<MilestoneDates>) {
  if ((patch.type ?? current.type) !== 'MILESTONE' ||
      (current.type === 'MILESTONE' && patch.startDate === undefined && patch.dueDate === undefined)) return;

  const start = patch.startDate === undefined ? current.startDate : patch.startDate;
  const due = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
  if (start && due && new Date(due).toISOString().slice(0, 10) < new Date(start).toISOString().slice(0, 10)) {
    return 'The due date is before the start.';
  }
}

export async function validateMilestone(
  tx: Prisma.TransactionClient,
  scope: { projectId: string; workspaceId: string },
  milestoneId: string | null | undefined,
  issueId?: string,
) {
  if (milestoneId && (milestoneId === issueId || !await tx.issue.findFirst({
    where: { projectId: scope.projectId, workspaceId: scope.workspaceId, id: milestoneId, type: 'MILESTONE', deletedAt: null },
    select: { id: true },
  }))) throw new InvalidMilestone();
}

export async function assertMilestoneHasNoIssues(tx: Prisma.TransactionClient, milestoneId: string) {
  // Include Trash so that restoring an issue cannot revive an invalid association.
  const linked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Issue" WHERE "milestoneId" = ${milestoneId} LIMIT 1
  `;
  if (linked.length) throw new InvalidMilestone('Clear this milestone from its linked issues before changing its type or project');
}
