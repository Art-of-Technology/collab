import { NextResponse } from 'next/server';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const milestones = await prisma.issue.findMany({
    where: { ...issueReadAccessWhere(user.id), projectId, type: 'MILESTONE' },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    select: { id: true, issueKey: true, title: true },
  });
  return NextResponse.json({ milestones });
}
