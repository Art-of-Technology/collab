import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseISO, startOfDay, endOfDay } from 'date-fns';
import type { ActivityFeedData, IssueActivity } from '@/utils/teamSyncAnalyzer';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const _params = await params;
  const { workspaceId } = _params;

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const projectIdsStr = searchParams.get('projectIds');
    const userIdsStr = searchParams.get('userIds');
    const limitStr = searchParams.get('limit');
    const cursor = searchParams.get('cursor');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const startDate = startOfDay(parseISO(startDateStr));
    const endDate = endOfDay(parseISO(endDateStr));
    const projectIds = projectIdsStr ? projectIdsStr.split(',').filter(Boolean) : undefined;
    const userIds = userIdsStr ? userIdsStr.split(',').filter(Boolean) : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    // Fetch activities
    const activities = await prisma.issueActivity.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
        ...(userIds?.length ? { userId: { in: userIds } } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit + 1, // Fetch one extra to check if there are more
    });

    // Check if there are more results
    const hasMore = activities.length > limit;
    const resultsToReturn = hasMore ? activities.slice(0, limit) : activities;

    // Fetch related issues
    const issueIds = [...new Set(resultsToReturn.map((a) => a.itemId))];
    const issues = await prisma.issue.findMany({
      where: {
        id: { in: issueIds },
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        type: true,
        priority: true,
        status: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        projectStatus: {
          select: {
            displayName: true,
          },
        },
      },
    });

    type IssueData = typeof issues[number];
    const issueMap = new Map<string, IssueData>(issues.map((i) => [i.id, i]));

    // Transform to IssueActivity format
    const feed: IssueActivity[] = resultsToReturn.map((activity) => {
      const issue = issueMap.get(activity.itemId);

      return {
        id: activity.id,
        issueId: activity.itemId,
        action: activity.action,
        fieldName: activity.fieldName || undefined,
        oldValue: activity.oldValue || undefined,
        newValue: activity.newValue || undefined,
        userId: activity.userId,
        createdAt: activity.createdAt,
        issueKey: issue?.issueKey,
        title: issue?.title,
        type: issue?.type,
        priority: issue?.priority,
        status: issue?.status,
        statusText: issue?.status, // Alias for component compatibility
        statusDisplayName: issue?.projectStatus?.displayName || issue?.status,
        projectName: issue?.project?.name,
        issue: issue
          ? {
              id: issue.id,
              title: issue.title,
              issueKey: issue.issueKey,
              type: issue.type,
              priority: issue.priority,
              status: issue.status,
            }
          : undefined,
        user: activity.user
          ? {
              id: activity.user.id,
              name: activity.user.name,
              image: activity.user.image,
            }
          : undefined,
      };
    });

    const response: ActivityFeedData = {
      feed,
      hasMore,
      nextCursor: hasMore && resultsToReturn.length > 0 ? resultsToReturn[resultsToReturn.length - 1].id : undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 });
  }
}
