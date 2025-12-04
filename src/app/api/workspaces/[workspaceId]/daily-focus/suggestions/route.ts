import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';

/**
 * Smart suggestions API for Daily Focus
 * Analyzes BoardItemActivity to suggest:
 * - Yesterday: Issues worked on based on status changes, assignments
 * - Today: Issues that should be continued, overdue items, high priority items
 */
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
    const userId = searchParams.get('userId') || session.user.id;
    const dateParam = searchParams.get('date');
    
    // Target date (default: today)
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    // Yesterday boundaries
    const yesterdayStart = new Date(targetDate);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Get activities from yesterday for this user
    const yesterdayActivities = await prisma.boardItemActivity.findMany({
      where: {
        workspaceId,
        userId,
        itemType: 'ISSUE',
        createdAt: {
          gte: yesterdayStart,
          lte: yesterdayEnd,
        },
        action: {
          in: ['STATUS_CHANGED', 'ASSIGNED', 'UPDATED', 'CREATED', 'MOVED'],
        },
      },
      select: {
        itemId: true,
        action: true,
        fieldName: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Extract unique issue IDs from yesterday
    const yesterdayIssueIds = [...new Set(yesterdayActivities.map(a => a.itemId))];

    // Get issues the user is currently assigned to
    const assignedIssues = await prisma.issue.findMany({
      where: {
        workspaceId,
        assigneeId: userId,
        // Exclude completed/cancelled
        OR: [
          { statusValue: { not: 'done', mode: 'insensitive' } },
          { projectStatus: { isFinal: false } },
        ],
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        priority: true,
        dueDate: true,
        statusId: true,
        statusValue: true,
        projectStatus: {
          select: {
            name: true,
            displayName: true,
            color: true,
            isFinal: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      take: 50,
    });

    // Get previously paused issues from older reflections
    const previousReflections = await prisma.dailyFocusReflection.findMany({
      where: {
        entry: {
          userId,
          workspaceId,
          date: {
            lt: targetDate,
          },
        },
        status: {
          in: ['PAUSED', 'PENDING_INPUT', 'COULD_NOT_COMPLETE'],
        },
      },
      include: {
        issue: {
          include: {
            project: true,
            assignee: true,
            projectStatus: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    // Filter out completed issues from paused items
    const pausedIssues = previousReflections
      .filter(r => {
        const issue = r.issue;
        if (!issue) return false;
        const statusLower = (issue.projectStatus?.name || issue.statusValue || '').toLowerCase();
        return statusLower !== 'done' && statusLower !== 'cancelled';
      })
      .map(r => r.issue);

    // Fetch full details for yesterday's issues
    const yesterdayIssues = yesterdayIssueIds.length > 0
      ? await prisma.issue.findMany({
          where: {
            id: { in: yesterdayIssueIds },
            workspaceId,
          },
          include: {
            project: true,
            assignee: true,
            projectStatus: true,
          },
        })
      : [];

    // Analyze for today's suggestions
    const now = new Date();
    const overdueIssues = assignedIssues.filter(issue => {
      if (!issue.dueDate) return false;
      const dueDate = new Date(issue.dueDate);
      return dueDate < now;
    });

    const highPriorityIssues = assignedIssues.filter(issue => 
      issue.priority === 'URGENT' || issue.priority === 'HIGH'
    );

    // Issues moved to "In Progress" status recently
    const inProgressActivities = await prisma.boardItemActivity.findMany({
      where: {
        workspaceId,
        userId,
        itemType: 'ISSUE',
        action: 'STATUS_CHANGED',
        fieldName: 'status',
        newValue: {
          contains: 'in_progress',
          mode: 'insensitive',
        },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      select: {
        itemId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const inProgressIssueIds = inProgressActivities.map(a => a.itemId);
    const inProgressIssues = inProgressIssueIds.length > 0
      ? await prisma.issue.findMany({
          where: {
            id: { in: inProgressIssueIds },
            workspaceId,
            OR: [
              { statusValue: { not: 'done', mode: 'insensitive' } },
              { projectStatus: { isFinal: false } },
            ],
          },
          include: {
            project: true,
            assignee: true,
            projectStatus: true,
          },
        })
      : [];

    return NextResponse.json({
      suggestions: {
        yesterday: {
          workedOn: yesterdayIssues,
          activities: yesterdayActivities,
        },
        today: {
          overdue: overdueIssues,
          highPriority: highPriorityIssues,
          inProgress: inProgressIssues,
          paused: pausedIssues,
          assigned: assignedIssues.slice(0, 20),
        },
        metadata: {
          date: targetDate.toISOString(),
          userId,
          workspaceId,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching daily focus suggestions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}


