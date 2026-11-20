import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { issueAccessWhere } from '@/lib/issue-finder';
import { checkUserPermissions, Permission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...issueAccessWhere(user.id) },
    select: { workspaceId: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const permissions = await checkUserPermissions(user.id, project.workspaceId, [Permission.EDIT_ANY_TASK]);
  if (!permissions[Permission.EDIT_ANY_TASK].hasPermission) {
    return NextResponse.json({ error: 'No permission to set a project baseline' }, { status: 403 });
  }

  const baseline = await prisma.$transaction(async tx => {
    const milestones = await tx.$queryRaw<{ id: string; startDate: Date | null; dueDate: Date | null }[]>`
      UPDATE "Issue"
      SET "baselineStartDate" = "startDate", "baselineDueDate" = "dueDate"
      WHERE "projectId" = ${projectId} AND "workspaceId" = ${project.workspaceId}
        AND "type" = 'MILESTONE' AND "deletedAt" IS NULL
      RETURNING "id", "startDate", "dueDate"
    `;
    const dates = milestones.map(({ id, startDate, dueDate }) => ({
      issueId: id, startDate: startDate?.toISOString() ?? null, dueDate: dueDate?.toISOString() ?? null,
    }));
    return tx.projectBaseline.create({ data: { projectId, setById: user.id, dates } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return null;
    throw error;
  });
  if (!baseline) return NextResponse.json({ error: 'Project changed; retry setting the baseline' }, { status: 409 });

  return NextResponse.json(baseline, { status: 201 });
}
