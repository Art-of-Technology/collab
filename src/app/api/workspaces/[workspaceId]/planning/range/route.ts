import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { eachDayOfInterval, format, parseISO, startOfDay, endOfDay } from 'date-fns';
import type { TeamSyncRangeData, TeamMemberRangeSync, DayActivity, IssueMovement, IssueActivity } from '@/utils/teamSyncAnalyzer';
import { getMovementType } from '@/utils/teamSyncAnalyzer';

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

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const startDate = startOfDay(parseISO(startDateStr));
    const endDate = endOfDay(parseISO(endDateStr));
    const projectIds = projectIdsStr ? projectIdsStr.split(',').filter(Boolean) : undefined;
    const userIds = userIdsStr ? userIdsStr.split(',').filter(Boolean) : undefined;

    // Fetch activities in the date range
    const activities = await prisma.issueActivity.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
        ...(userIds?.length ? { userId: { in: userIds } } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Fetch related issues for the activities
    const issueIds = [...new Set(activities.map((a) => a.itemId))];
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
        projectId: true,
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

    // Get all unique users from activities
    const uniqueUserIds = [...new Set(activities.map((a) => a.userId))];

    // Fetch assigned issues for each user
    const assignedIssuesMap = new Map<string, any[]>();
    if (uniqueUserIds.length > 0) {
      const assignedIssues = await prisma.issue.findMany({
        where: {
          workspaceId,
          assigneeId: { in: uniqueUserIds },
          ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
        },
        select: {
          id: true,
          title: true,
          issueKey: true,
          type: true,
          priority: true,
          status: true,
          assigneeId: true,
          dueDate: true,
          projectStatus: {
            select: {
              displayName: true,
            },
          },
        },
      });

      for (const issue of assignedIssues) {
        if (issue.assigneeId) {
          const existing = assignedIssuesMap.get(issue.assigneeId) || [];
          existing.push(issue);
          assignedIssuesMap.set(issue.assigneeId, existing);
        }
      }
    }

    // Build activity data per user per day
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const totalDays = days.length;

    // Group activities by user
    const activitiesByUser = new Map<string, typeof activities>();
    for (const activity of activities) {
      const existing = activitiesByUser.get(activity.userId) || [];
      existing.push(activity);
      activitiesByUser.set(activity.userId, existing);
    }

    // Build member data
    const members: TeamMemberRangeSync[] = [];
    let totalCompleted = 0;
    let totalStarted = 0;
    let totalMoved = 0;
    let totalCreated = 0;

    for (const userId of uniqueUserIds) {
      const userActivities = activitiesByUser.get(userId) || [];
      const user = userActivities[0]?.user;

      if (!user) continue;

      // Group by date
      const daysData: Record<string, DayActivity> = {};
      let memberCompleted = 0;
      let memberStarted = 0;
      let memberMoved = 0;
      let memberCreated = 0;

      for (const day of days) {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        const dayActivities = userActivities.filter((a) => {
          const actDate = new Date(a.createdAt);
          return actDate >= dayStart && actDate <= dayEnd;
        });

        const movements: IssueMovement[] = [];
        let issuesCompleted = 0;
        let issuesStarted = 0;
        let issuesMoved = 0;
        let issuesCreated = 0;
        const completed: IssueActivity[] = [];
        const started: IssueActivity[] = [];
        const inProgress: IssueActivity[] = [];
        const inReview: IssueActivity[] = [];
        const movedToReview: IssueActivity[] = [];
        const blocked: IssueActivity[] = [];

        for (const activity of dayActivities) {
          const issue = issueMap.get(activity.itemId);

          const issueActivity: IssueActivity = {
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
            user: {
              id: user.id,
              name: user.name,
              image: user.image,
            },
          };

          if (activity.action === 'CREATED') {
            issuesCreated++;
            memberCreated++;
          } else if (activity.action === 'STATUS_CHANGED' && activity.fieldName === 'status') {
            issuesMoved++;
            memberMoved++;

            const newStatus = activity.newValue?.toLowerCase() || '';
            const oldStatus = activity.oldValue?.toLowerCase() || '';

            if (newStatus.includes('done') || newStatus.includes('complete')) {
              issuesCompleted++;
              memberCompleted++;
              completed.push(issueActivity);
            }
            if (newStatus.includes('progress') && !oldStatus.includes('progress')) {
              issuesStarted++;
              memberStarted++;
              started.push(issueActivity);
            }
            if (newStatus.includes('progress')) {
              inProgress.push(issueActivity);
            }
            if (newStatus.includes('review')) {
              inReview.push(issueActivity);
              movedToReview.push(issueActivity);
            }
            if (newStatus.includes('block')) {
              blocked.push(issueActivity);
            }

            if (issue) {
              movements.push({
                issueId: issue.id,
                issueKey: issue.issueKey,
                title: issue.title,
                type: issue.type,
                priority: issue.priority,
                fromStatus: activity.oldValue || '',
                toStatus: activity.newValue || '',
                movementType: getMovementType(activity.oldValue || '', activity.newValue || ''),
                timestamp: activity.createdAt,
                movedAt: activity.createdAt,
                userId: activity.userId,
                userName: user.name || undefined,
                userImage: user.image || undefined,
                projectId: issue.projectId || undefined,
                projectName: issue.project?.name,
              });
            }
          }
        }

        daysData[dateKey] = {
          date: day,
          issuesCompleted,
          issuesStarted,
          issuesMoved,
          issuesCreated,
          movements,
          activities: dayActivities.map((a) => {
            const issue = issueMap.get(a.itemId);
            return {
              id: a.id,
              issueId: a.itemId,
              action: a.action,
              fieldName: a.fieldName || undefined,
              oldValue: a.oldValue || undefined,
              newValue: a.newValue || undefined,
              userId: a.userId,
              createdAt: a.createdAt,
              issueKey: issue?.issueKey,
              title: issue?.title,
              type: issue?.type,
              priority: issue?.priority,
              status: issue?.status,
              statusText: issue?.status,
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
              user: {
                id: user.id,
                name: user.name,
                image: user.image,
              },
            };
          }),
          completed,
          started,
          inProgress,
          inReview,
          movedToReview,
          blocked,
          planned: [],
        };
      }

      totalCompleted += memberCompleted;
      totalStarted += memberStarted;
      totalMoved += memberMoved;
      totalCreated += memberCreated;

      const activeDays = Object.values(daysData).filter(
        (d) => d.issuesCompleted > 0 || d.issuesStarted > 0 || d.issuesMoved > 0 || d.issuesCreated > 0
      ).length;

      members.push({
        userId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          useCustomAvatar: user.useCustomAvatar,
        },
        days: daysData,
        summary: {
          totalCompleted: memberCompleted,
          totalStarted: memberStarted,
          totalMoved: memberMoved,
          totalCreated: memberCreated,
          avgPerDay: activeDays > 0 ? (memberCompleted + memberStarted + memberMoved) / activeDays : 0,
        },
        assignedIssues: assignedIssuesMap.get(userId) || [],
      });
    }

    const response: TeamSyncRangeData = {
      members,
      summary: {
        totalCompleted,
        totalStarted,
        totalMoved,
        totalCreated,
        avgPerMember: members.length > 0 ? (totalCompleted + totalStarted + totalMoved) / members.length : 0,
        dateRange: {
          startDate,
          endDate,
          totalDays,
        },
      },
      dateRange: {
        startDate,
        endDate,
        totalDays,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching team sync range:', error);
    return NextResponse.json({ error: 'Failed to fetch team sync data' }, { status: 500 });
  }
}
