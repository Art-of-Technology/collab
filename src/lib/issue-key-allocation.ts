import type { Prisma } from '@prisma/client';

export async function allocateIssueKey(tx: Prisma.TransactionClient, projectId: string): Promise<string> {
  const [project] = await tx.$queryRaw<Array<{ issuePrefix: string; nextIssueNumbers: Prisma.JsonValue }>>`
    SELECT "issuePrefix", "nextIssueNumbers" FROM "Project" WHERE id = ${projectId} FOR UPDATE
  `;
  if (!project) throw new Error('Project not found');

  const counters = (project.nextIssueNumbers as Record<string, number>) || {};
  let nextNum = counters.TASK || 1;
  let issueKey: string;
  for (;;) {
    issueKey = `${project.issuePrefix}-${nextNum}`;
    const [existing] = await tx.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM "Issue" WHERE "projectId" = ${projectId} AND "issueKey" = ${issueKey})
    `;
    if (!existing.exists) break;
    nextNum++;
  }
  await tx.project.update({
    where: { id: projectId },
    data: { nextIssueNumbers: { ...counters, TASK: nextNum + 1 } },
  });
  return issueKey;
}
