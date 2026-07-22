import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { eachDayOfInterval, format, parseISO, startOfDay, endOfDay } from 'date-fns';
import type {
  TeamSyncRangeData,
  TeamMemberRangeSync,
  DayActivity,
  IssueMovement,
  IssueActivity,
  PlannedIssue,
  MemberSummary,
  TeamRangeSummary,
} from '@/utils/teamSyncAnalyzer';
import {
  getMovementType,
  classifyStatus,
  createEmptyDayActivity,
  createEmptyMemberSummary,
  findMostActiveDay,
  findMostProductiveMember,
  calculateCompletionRate,
} from '@/utils/teamSyncAnalyzer';

// Helper to convert a database issue to IssueActivity format
function issueToActivity(
  issue: {
    id: string;
    title: string;
    issueKey: string | null;
    type: string;
    priority: string;
    status: string;
    assigneeId: string | null;
    dueDate: Date | null;
    createdAt: Date;
    projectId: string;
    project?: { id: string; name: string } | null;
    projectStatus?: { name: string; displayName: string | null } | null;
  },
  user: { id: string; name: string | null; image: string | null } | null,
  extra?: { daysInProgress?: number; isCarryOver?: boolean }
): IssueActivity {
  return {
    id: issue.id,
    issueId: issue.id,
    action: 'CURRENT_STATE',
    userId: issue.assigneeId || '',
    createdAt: issue.createdAt,
    issueKey: issue.issueKey,
    title: issue.title,
    type: issue.type,
    priority: issue.priority,
    status: issue.status,
    statusText: issue.projectStatus?.name || issue.status,
    statusDisplayName: issue.projectStatus?.displayName || issue.status,
    daysInProgress: extra?.daysInProgress,
    isCarryOver: extra?.isCarryOver,
    projectName: issue.project?.name,
    issue: {
      id: issue.id,
      title: issue.title,
      issueKey: issue.issueKey,
      type: issue.type,
      priority: issue.priority,
      status: issue.status,
      assigneeId: issue.assigneeId,
    },
    user: user
      ? {
          id: user.id,
          name: user.name,
          image: user.image,
        }
      : undefined,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

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
        assigneeId: true,
        dueDate: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        projectStatus: {
          select: {
            name: true,
            displayName: true,
          },
        },
      },
    });

    type IssueData = (typeof issues)[number];
    const issueMap = new Map<string, IssueData>(issues.map((i) => [i.id, i]));

    // Get all unique users from activities OR from userIds filter
    let uniqueUserIds = [...new Set(activities.map((a) => a.userId))];

    // If userIds filter is provided, ensure we include all of them even if they have no activities
    if (userIds?.length) {
      uniqueUserIds = [...new Set([...uniqueUserIds, ...userIds])];
    }

    // Fetch all users info
    const usersInfo = await prisma.user.findMany({
      where: {
        id: { in: uniqueUserIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        useCustomAvatar: true,
      },
    });
    const userMap = new Map(usersInfo.map((u) => [u.id, u]));

    // Fetch ALL assigned issues for each user (current state - not completed)
    const allAssignedIssues = await prisma.issue.findMany({
      where: {
        workspaceId,
        assigneeId: { in: uniqueUserIds },
        ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
        // Exclude completed issues
        projectStatus: {
          isFinal: false,
        },
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
        createdAt: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        projectStatus: {
          select: {
            name: true,
            displayName: true,
          },
        },
        // Include blocker relations
        targetRelations: {
          where: {
            relationType: 'BLOCKED_BY',
          },
          select: {
            id: true,
            sourceIssue: {
              select: {
                issueKey: true,
                title: true,
              },
            },
          },
        },
      },
    });

    // Get active issue IDs for carry-over detection
    const activeIssueIds = allAssignedIssues
      .filter((issue) => {
        const category = classifyStatus(issue.projectStatus?.name || issue.status);
        return category === 'in_progress' || category === 'in_review';
      })
      .map((issue) => issue.id);

    // Find when each issue was first moved to in_progress
    const firstInProgressActivities = await prisma.issueActivity.findMany({
      where: {
        itemId: { in: activeIssueIds.length > 0 ? activeIssueIds : ['none'] },
        action: 'STATUS_CHANGED',
        fieldName: 'status',
        OR: [
          { newValue: { contains: 'progress', mode: 'insensitive' } },
          { newValue: { contains: 'doing', mode: 'insensitive' } },
          { newValue: { contains: 'development', mode: 'insensitive' } },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        itemId: true,
        userId: true,
        createdAt: true,
      },
    });

    // Get the FIRST time each issue was moved to in_progress
    const firstStartDateMap = new Map<string, Date>();
    for (const activity of firstInProgressActivities) {
      if (!firstStartDateMap.has(activity.itemId)) {
        firstStartDateMap.set(activity.itemId, activity.createdAt);
      }
    }

    // Group assigned issues by user and category (as IssueActivity)
    const userCurrentIssues = new Map<
      string,
      {
        inProgress: IssueActivity[];
        inReview: IssueActivity[];
        blocked: IssueActivity[];
        planned: IssueActivity[];
        all: PlannedIssue[];
      }
    >();

    const carryOverMap = new Map<string, IssueActivity[]>();

    for (const issue of allAssignedIssues) {
      if (!issue.assigneeId) continue;

      const user = userMap.get(issue.assigneeId);
      const statusName = issue.projectStatus?.name || issue.status;
      const category = classifyStatus(statusName);
      const isBlocked = issue.targetRelations && issue.targetRelations.length > 0;

      // Calculate days in progress for in_progress/in_review issues
      let daysInProgress: number | undefined;
      const firstStart = firstStartDateMap.get(issue.id);
      if (firstStart && (category === 'in_progress' || category === 'in_review')) {
        daysInProgress = Math.floor((Date.now() - firstStart.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Check if carry-over
      const isCarryOver =
        (category === 'in_progress' || category === 'in_review') &&
        (firstStart ? firstStart < startDate : issue.createdAt < startDate);

      const issueActivity = issueToActivity(issue, user || null, { daysInProgress, isCarryOver });

      // Initialize user's issue lists
      if (!userCurrentIssues.has(issue.assigneeId)) {
        userCurrentIssues.set(issue.assigneeId, {
          inProgress: [],
          inReview: [],
          blocked: [],
          planned: [],
          all: [],
        });
      }

      const userIssues = userCurrentIssues.get(issue.assigneeId)!;

      // Add to all (as PlannedIssue)
      userIssues.all.push({
        id: issue.id,
        issueKey: issue.issueKey,
        title: issue.title,
        type: issue.type,
        priority: issue.priority,
        status: issue.status,
        statusDisplayName: issue.projectStatus?.displayName || issue.status,
        assigneeId: issue.assigneeId,
        dueDate: issue.dueDate,
        createdAt: issue.createdAt,
        projectId: issue.projectId,
        projectName: issue.project?.name,
        daysInStatus: daysInProgress,
        isCarryOver,
      });

      // Categorize
      if (isBlocked || category === 'blocked') {
        userIssues.blocked.push(issueActivity);
      } else if (category === 'in_progress') {
        userIssues.inProgress.push(issueActivity);
      } else if (category === 'in_review') {
        userIssues.inReview.push(issueActivity);
      } else if (category === 'planned') {
        userIssues.planned.push(issueActivity);
      }

      // Add to carry-over map
      if (isCarryOver) {
        if (!carryOverMap.has(issue.assigneeId)) {
          carryOverMap.set(issue.assigneeId, []);
        }
        carryOverMap.get(issue.assigneeId)!.push(issueActivity);
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
    let globalTotalCompleted = 0;
    let globalTotalStarted = 0;
    let globalTotalMoved = 0;
    let globalTotalCreated = 0;
    let globalTotalInProgress = 0;
    let globalTotalInReview = 0;
    let globalTotalPlanned = 0;
    let globalTotalBlocked = 0;
    let globalTotalCarryOver = 0;

    for (const userId of uniqueUserIds) {
      const userActivities = activitiesByUser.get(userId) || [];
      const user = userMap.get(userId);

      if (!user) continue;

      const userIssues = userCurrentIssues.get(userId) || {
        inProgress: [],
        inReview: [],
        blocked: [],
        planned: [],
        all: [],
      };
      const userCarryOver = carryOverMap.get(userId) || [];

      // Group by date
      const daysData: Record<string, DayActivity> = {};
      const memberSummary = createEmptyMemberSummary();

      for (const day of days) {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        const dayActivities = userActivities.filter((a) => {
          const actDate = new Date(a.createdAt);
          return actDate >= dayStart && actDate <= dayEnd;
        });

        const dayData = createEmptyDayActivity(day);
        const movements: IssueMovement[] = [];

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
            statusText: issue?.projectStatus?.name || issue?.status,
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
                  assigneeId: issue.assigneeId,
                }
              : undefined,
            user: {
              id: user.id,
              name: user.name,
              image: user.image,
            },
          };

          dayData.activities.push(issueActivity);

          if (activity.action === 'CREATED') {
            dayData.issuesCreated++;
            memberSummary.totalCreated++;
          } else if (activity.action === 'STATUS_CHANGED' && activity.fieldName === 'status') {
            dayData.issuesMoved++;
            memberSummary.totalMoved++;

            const newCategory = classifyStatus(activity.newValue);
            const oldCategory = classifyStatus(activity.oldValue);

            if (newCategory === 'completed') {
              dayData.issuesCompleted++;
              memberSummary.totalCompleted++;
              dayData.completed.push(issueActivity);
            }

            if (newCategory === 'in_progress' && oldCategory !== 'in_progress') {
              dayData.issuesStarted++;
              memberSummary.totalStarted++;
              dayData.started.push(issueActivity);
            }

            if (newCategory === 'in_progress') {
              dayData.inProgress.push(issueActivity);
            }

            if (newCategory === 'in_review') {
              dayData.inReview.push(issueActivity);
              dayData.movedToReview.push(issueActivity);
            }

            if (newCategory === 'blocked') {
              dayData.blocked.push(issueActivity);
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
                fromStatusDisplayName: activity.oldValue || '',
                toStatusDisplayName: issue.projectStatus?.displayName || activity.newValue || '',
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

        dayData.movements = movements;

        // Add current state issues (from user's current assigned issues)
        // Only add if there was no activity for that status transition today
        // This ensures we show current in_progress, in_review, blocked, planned issues

        // For inProgress - add current in-progress issues not already in the day's list
        const dayInProgressIds = new Set(dayData.inProgress.map((i) => i.issueId));
        for (const issue of userIssues.inProgress) {
          if (!dayInProgressIds.has(issue.issueId)) {
            dayData.inProgress.push(issue);
          }
        }

        // For inReview - add current in-review issues not already in the day's list
        const dayInReviewIds = new Set(dayData.inReview.map((i) => i.issueId));
        for (const issue of userIssues.inReview) {
          if (!dayInReviewIds.has(issue.issueId)) {
            dayData.inReview.push(issue);
          }
        }

        // For blocked - add current blocked issues not already in the day's list
        const dayBlockedIds = new Set(dayData.blocked.map((i) => i.issueId));
        for (const issue of userIssues.blocked) {
          if (!dayBlockedIds.has(issue.issueId)) {
            dayData.blocked.push(issue);
          }
        }

        // For planned - add all planned issues
        dayData.planned = [...userIssues.planned];

        // Add carry-over issues - filter out any completed today
        const completedIssueIds = new Set(dayData.completed.map((c) => c.issueId));
        dayData.carryOver = userCarryOver.filter((co) => !completedIssueIds.has(co.issueId));

        daysData[dateKey] = dayData;
      }

      // Update member summary with current state
      memberSummary.totalInProgress = userIssues.inProgress.length;
      memberSummary.totalInReview = userIssues.inReview.length;
      memberSummary.totalPlanned = userIssues.planned.length;
      memberSummary.totalBlocked = userIssues.blocked.length;
      memberSummary.totalCarryOver = userCarryOver.length;
      memberSummary.currentWorkload =
        userIssues.inProgress.length + userIssues.inReview.length + userIssues.blocked.length;

      const activeDays = Object.values(daysData).filter(
        (d) =>
          d.issuesCompleted > 0 || d.issuesStarted > 0 || d.issuesMoved > 0 || d.issuesCreated > 0
      ).length;

      memberSummary.avgPerDay =
        activeDays > 0
          ? (memberSummary.totalCompleted + memberSummary.totalStarted + memberSummary.totalMoved) /
            activeDays
          : 0;

      memberSummary.completionRate = calculateCompletionRate(
        memberSummary.totalCompleted,
        memberSummary.totalCompleted + memberSummary.totalInProgress + memberSummary.totalInReview
      );

      // Accumulate global totals
      globalTotalCompleted += memberSummary.totalCompleted;
      globalTotalStarted += memberSummary.totalStarted;
      globalTotalMoved += memberSummary.totalMoved;
      globalTotalCreated += memberSummary.totalCreated;
      globalTotalInProgress += memberSummary.totalInProgress;
      globalTotalInReview += memberSummary.totalInReview;
      globalTotalPlanned += memberSummary.totalPlanned;
      globalTotalBlocked += memberSummary.totalBlocked;
      globalTotalCarryOver += memberSummary.totalCarryOver;

      // Generate warnings
      const warnings: string[] = [];
      if (memberSummary.currentWorkload >= 7) {
        warnings.push(`${memberSummary.currentWorkload} tasks active - consider focusing on fewer items`);
      }
      // Check for long-running issues
      for (const issue of userIssues.inProgress) {
        if (issue.daysInProgress && issue.daysInProgress >= 5) {
          warnings.push(`"${issue.title}" has been in progress for ${issue.daysInProgress} days`);
        }
      }

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
        summary: memberSummary,
        assignedIssues: userIssues.all,
        currentInProgress: userIssues.inProgress,
        currentInReview: userIssues.inReview,
        currentBlocked: userIssues.blocked,
        currentPlanned: userIssues.planned,
        // Legacy fields for backwards compatibility
        insights: {
          warnings,
          tasksInProgress: memberSummary.totalInProgress,
          tasksCompletedToday: memberSummary.totalCompleted,
        },
        userName: user.name || 'Unknown',
        userImage: user.image || undefined,
      });
    }

    const teamCompletionRate = calculateCompletionRate(
      globalTotalCompleted,
      globalTotalCompleted + globalTotalInProgress + globalTotalInReview
    );

    const summary: TeamRangeSummary = {
      totalCompleted: globalTotalCompleted,
      totalStarted: globalTotalStarted,
      totalMoved: globalTotalMoved,
      totalCreated: globalTotalCreated,
      totalInProgress: globalTotalInProgress,
      totalInReview: globalTotalInReview,
      totalPlanned: globalTotalPlanned,
      totalBlocked: globalTotalBlocked,
      totalCarryOver: globalTotalCarryOver,
      avgPerMember:
        members.length > 0
          ? (globalTotalCompleted + globalTotalStarted + globalTotalMoved) / members.length
          : 0,
      teamCompletionRate,
      mostActiveDay: findMostActiveDay(members),
      mostProductiveMember: findMostProductiveMember(members),
      dateRange: {
        startDate,
        endDate,
        totalDays,
      },
    };

    const response: TeamSyncRangeData = {
      members,
      summary,
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
