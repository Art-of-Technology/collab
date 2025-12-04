import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    await verifyWorkspaceAccess(session.user, workspaceId);

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean) || [];
    const userIds = searchParams.get('userIds')?.split(',').filter(Boolean) || [];
    const statusFilter = searchParams.get('status');

    // Default to today if no dates provided
    const startDate = startDateParam ? new Date(startDateParam) : new Date();
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = endDateParam ? new Date(endDateParam) : new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    const where: any = {
      workspaceId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      status: 'SUBMITTED', // Only show submitted entries
    };

    if (userIds.length > 0) {
      where.userId = { in: userIds };
    }

    const entries = await prisma.dailyFocusEntry.findMany({
      where,
      include: {
        reflections: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
          },
          ...(projectIds.length > 0 ? {
            where: {
              issue: {
                projectId: { in: projectIds },
              },
            },
          } : {}),
        },
        plans: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
          },
          ...(projectIds.length > 0 ? {
            where: {
              issue: {
                projectId: { in: projectIds },
              },
            },
          } : {}),
        },
        assignments: {
          include: {
            issue: {
              include: {
                assignee: true,
                reporter: true,
                project: true,
                projectStatus: true,
              },
            },
            assignedTo: true,
            assignedBy: true,
          },
          ...(projectIds.length > 0 ? {
            where: {
              issue: {
                projectId: { in: projectIds },
              },
            },
          } : {}),
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Filter by reflection status if provided
    let filteredEntries = entries;
    if (statusFilter) {
      filteredEntries = entries.map(entry => ({
        ...entry,
        reflections: entry.reflections.filter(r => r.status === statusFilter),
      })).filter(entry => entry.reflections.length > 0 || entry.plans.length > 0);
    }

    // Calculate summary statistics
    const stats = {
      totalEntries: filteredEntries.length,
      totalCompleted: filteredEntries.reduce(
        (sum, e) => sum + e.reflections.filter(r => r.status === 'COMPLETED').length,
        0
      ),
      totalOngoing: filteredEntries.reduce(
        (sum, e) => sum + e.reflections.filter(r => r.status === 'PAUSED').length,
        0
      ),
      totalPlanned: filteredEntries.reduce((sum, e) => sum + e.plans.length, 0),
    };

    return NextResponse.json({ entries: filteredEntries, stats });
  } catch (error: any) {
    console.error('Error fetching team daily focus:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch team daily focus' },
      { status: 500 }
    );
  }
}

