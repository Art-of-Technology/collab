import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

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
  { params }: { params: { workspaceId: string; projectSlug: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Verify access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: (session.user as any).id },
          { members: { some: { userId: (session.user as any).id, status: true } } }
        ]
      },
      select: { id: true }
    });
    if (!workspace) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Resolve project by slug within workspace
    const project = await prisma.project.findFirst({
      where: { workspaceId, slug: projectSlug },
      select: { id: true, name: true, slug: true }
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projectId = project.id;

    // Where clause helpers
    const baseWhere = { workspaceId, projectId };
    const completionWhere = {
      workspaceId,
      projectId,
      OR: [
        { projectStatus: { is: { isFinal: true } } },
        { status: { in: DONE_STATUSES } },
        { statusValue: { in: DONE_STATUSES } }
      ]
    };

    // Aggregations
    const [
      createdCount,
      completedCount,
      byType,
      completedByUser
    ] = await Promise.all([
      prisma.issue.count({ where: baseWhere }),
      prisma.issue.count({ where: completionWhere as any }),
      prisma.issue.groupBy({
        by: ['type'],
        where: baseWhere,
        _count: { _all: true }
      }),
      prisma.issue.groupBy({
        by: ['assigneeId'],
        where: {
          ...(completionWhere as any),
          assigneeId: { not: null }
        },
        _count: { _all: true }
      })
    ]);

    // Fetch user details for assignees
    const assigneeIds = completedByUser
      .map(r => r.assigneeId)
      .filter((v): v is string => !!v);

    const users = assigneeIds.length
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, email: true, image: true, useCustomAvatar: true }
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const response = {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug
      },
      totals: {
        created: createdCount,
        completed: completedCount
      },
      countsByType: byType.reduce<Record<string, number>>((acc, row) => {
        const t = row.type || 'TASK';
        acc[t] = (acc[t] || 0) + row._count._all;
        return acc;
      }, {}),
      userCompletions: completedByUser
        .filter(r => !!r.assigneeId)
        .map(r => {
          const u = userMap.get(r.assigneeId!);
          return {
            user: u
              ? {
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  image: u.image,
                  useCustomAvatar: (u as any).useCustomAvatar ?? false
                }
              : { id: r.assigneeId, name: null, email: null, image: null, useCustomAvatar: false },
            completed: r._count._all
          };
        })
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating project report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


