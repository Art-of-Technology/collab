import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';

const DONE_STATUSES = [
  'DONE', 'Done', 'done', 'DONE ✅',
  'CLOSED', 'Closed', 'closed',
  'RESOLVED', 'Resolved', 'resolved',
  'COMPLETED', 'Completed', 'completed',
  'CANCELLED', 'Cancelled', 'cancelled',
  'CANCELED', 'Canceled', 'canceled',
];

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId } = await params;
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Verify access: user is owner or active member
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: (session.user as any).id },
          { members: { some: { userId: (session.user as any).id, status: true } } }
        ]
      },
      select: { id: true }
    });
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch active members
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, status: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true
          }
        }
      }
    });
    const memberUserIds = members.map(m => m.user.id);

    // Build common completion filter (unified status or legacy)
    const completionWhere = {
      workspaceId,
      OR: [
        { projectStatus: { is: { isFinal: true } } },
        { status: { in: DONE_STATUSES } },
        { statusValue: { in: DONE_STATUSES } }
      ]
    };

    // Parallel aggregations
    const [completedByAssignee, completedByAssigneeAndType, reporterCounts] = await Promise.all([
      prisma.issue.groupBy({
        by: ['assigneeId'],
        where: {
          ...(completionWhere as any),
          assigneeId: { in: memberUserIds }
        },
        _count: { _all: true }
      }),
      prisma.issue.groupBy({
        by: ['assigneeId', 'type'],
        where: {
          ...(completionWhere as any),
          assigneeId: { in: memberUserIds }
        },
        _count: { _all: true }
      }),
      prisma.issue.groupBy({
        by: ['reporterId'],
        where: {
          workspaceId,
          reporterId: { in: memberUserIds }
        },
        _count: { _all: true }
      })
    ]);

    // Index aggregations for quick lookup
    const completedTotalMap = new Map<string, number>();
    for (const row of completedByAssignee) {
      if (row.assigneeId) {
        completedTotalMap.set(row.assigneeId, row._count._all);
      }
    }

    const completedByTypeMap = new Map<string, Record<string, number>>();
    for (const row of completedByAssigneeAndType) {
      if (!row.assigneeId) continue;
      const key = row.assigneeId;
      const type = row.type || 'TASK';
      const current = completedByTypeMap.get(key) || {};
      current[type] = (current[type] || 0) + row._count._all;
      completedByTypeMap.set(key, current);
    }

    const reporterTotalMap = new Map<string, number>();
    for (const row of reporterCounts) {
      if (row.reporterId) {
        reporterTotalMap.set(row.reporterId, row._count._all);
      }
    }

    const users = members.map(m => {
      const u = m.user;
      const completedTotal = completedTotalMap.get(u.id) || 0;
      const completedByType = completedByTypeMap.get(u.id) || {};
      const reporterTotal = reporterTotalMap.get(u.id) || 0;
      return {
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          image: u.image,
          useCustomAvatar: (u as any).useCustomAvatar ?? false
        },
        metrics: {
          completedTotal,
          reporterTotal,
          completedByType
        }
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error generating user task report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


