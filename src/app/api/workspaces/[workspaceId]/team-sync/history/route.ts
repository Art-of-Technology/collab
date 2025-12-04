import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyWorkspaceAccess } from '@/lib/workspace-helpers';
import { calculateIssueLifecycle } from '@/utils/teamSyncAnalyzer';

/**
 * Historical lifecycle data for issues
 * Shows how long issues have been in each status, patterns, etc.
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
    
    const issueId = searchParams.get('issueId');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const userId = searchParams.get('userId');
    
    // If requesting specific issue lifecycle
    if (issueId) {
      const lifecycle = await calculateIssueLifecycle(issueId);
      
      return NextResponse.json({
        issueId,
        lifecycle,
      });
    }

    // Otherwise, get historical patterns for workspace/user
    const startDate = startDateParam ? new Date(startDateParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = endDateParam ? new Date(endDateParam) : new Date();

    // Get all status change activities in date range
    const activities = await prisma.boardItemActivity.findMany({
      where: {
        workspaceId,
        itemType: 'ISSUE',
        action: 'STATUS_CHANGED',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(userId ? { userId } : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate patterns
    const patterns = {
      totalStatusChanges: activities.length,
      completedIssues: activities.filter(
        a => a.newValue?.toLowerCase().includes('done')
      ).length,
      averageChangesPerIssue: 0,
      mostActiveDay: '',
      statusDistribution: {} as Record<string, number>,
    };

    // Group by issue to calculate average changes
    const issueGroups = new Map<string, number>();
    for (const activity of activities) {
      issueGroups.set(activity.itemId, (issueGroups.get(activity.itemId) || 0) + 1);
    }
    
    if (issueGroups.size > 0) {
      patterns.averageChangesPerIssue = 
        Array.from(issueGroups.values()).reduce((a, b) => a + b, 0) / issueGroups.size;
    }

    // Find most active day
    const dayGroups = new Map<string, number>();
    for (const activity of activities) {
      const day = activity.createdAt.toISOString().split('T')[0];
      dayGroups.set(day, (dayGroups.get(day) || 0) + 1);
    }
    
    if (dayGroups.size > 0) {
      const mostActive = Array.from(dayGroups.entries()).reduce((a, b) =>
        a[1] > b[1] ? a : b
      );
      patterns.mostActiveDay = mostActive[0];
    }

    // Status distribution
    for (const activity of activities) {
      const status = activity.newValue || 'unknown';
      patterns.statusDistribution[status] = (patterns.statusDistribution[status] || 0) + 1;
    }

    // Get longest in-progress issues
    const inProgressIssues = await prisma.issue.findMany({
      where: {
        workspaceId,
        ...(userId ? { assigneeId: userId } : {}),
        OR: [
          {
            projectStatus: {
              name: { contains: 'in_progress', mode: 'insensitive' },
            },
          },
          {
            statusValue: { contains: 'in_progress', mode: 'insensitive' },
          },
        ],
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: 10,
    });

    const longestInProgress = [];
    for (const issue of inProgressIssues) {
      const firstInProgress = await prisma.boardItemActivity.findFirst({
        where: {
          itemId: issue.id,
          action: 'STATUS_CHANGED',
          newValue: { contains: 'in_progress', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (firstInProgress) {
        const days = Math.floor(
          (Date.now() - firstInProgress.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        longestInProgress.push({
          issueId: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          assignee: issue.assignee?.name,
          projectName: issue.project?.name,
          daysInProgress: days,
          startedAt: firstInProgress.createdAt,
        });
      }
    }

    longestInProgress.sort((a, b) => b.daysInProgress - a.daysInProgress);

    return NextResponse.json({
      patterns,
      longestInProgress: longestInProgress.slice(0, 10),
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}


