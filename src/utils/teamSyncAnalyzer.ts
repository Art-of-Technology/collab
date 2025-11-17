import { prisma } from '@/lib/prisma';

export interface TeamMemberSync {
  userId: string;
  userName: string;
  userImage?: string;
  yesterday: IssueActivity[];
  today: IssueActivity[];
  blockers: IssueActivity[];
  insights: UserInsights;
}

export interface IssueActivity {
  issueId: string;
  issueKey: string;
  title: string;
  projectName: string;
  projectId: string;
  statusSymbol: '✅' | '⛔️' | '⚡️' | '🔍' | '🎯' | '💼' | '🚫' | '';
  statusText: string;
  daysInProgress?: number;
  notes?: string;
  priority?: string;
  dueDate?: Date;
}

export interface UserInsights {
  tasksInProgress: number;
  tasksCompletedToday: number;
  averageCompletionDays: number;
  longestInProgressIssue?: {
    title: string;
    days: number;
  };
  warnings: string[];
}

/**
 * Helper function to get issue status at a specific date
 */
async function getIssueStatusAtDate(issueId: string, date: Date): Promise<string | null> {
  // Find the last status change before or at this date
  const lastStatusChange = await prisma.boardItemActivity.findFirst({
    where: {
      itemId: issueId,
      itemType: 'ISSUE',
      action: 'STATUS_CHANGED',
      createdAt: { lte: date },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (lastStatusChange) {
    return lastStatusChange.newValue as string;
  }

  // If no status changes, use current status (issue might have been created with this status)
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { projectStatus: { select: { name: true } }, statusValue: true },
  });

  return issue?.projectStatus?.name || issue?.statusValue || null;
}

/**
 * Categorize issue based on status transitions for yesterday's view
 */
function categorizeYesterdayIssue(
  statusStart: string | null,
  statusEnd: string | null,
  statusToday: string | null,
  createdAt: Date,
  yesterdayDate: Date
): IssueActivity['statusSymbol'] {
  const start = statusStart?.toLowerCase() || '';
  const end = statusEnd?.toLowerCase() || '';
  const today = statusToday?.toLowerCase() || '';

  // ✅ Completed - moved to done yesterday
  if (end.includes('done') || end.includes('complete')) {
    return '✅';
  }

  // ⚡️ Unplanned - created yesterday
  const createdYesterday = createdAt >= yesterdayDate && 
    createdAt < new Date(yesterdayDate.getTime() + 24 * 60 * 60 * 1000);
  if (createdYesterday) {
    return '⚡️';
  }

  // 🔍 In Review - ended in review state
  if (end.includes('review') || end.includes('deployment') || end.includes('testing')) {
    return '🔍';
  }

  // ⛔️ Not Completed - was in progress but still not done
  if (start.includes('progress') || end.includes('progress')) {
    if (!today.includes('done')) {
      return '⛔️';
    }
  }

  return '';
}

/**
 * Analyze what team members worked on yesterday
 */
export async function analyzeYesterday(
  workspaceId: string,
  targetDate: Date,
  userIds?: string[],
  projectIds?: string[]
): Promise<Map<string, IssueActivity[]>> {
  const yesterdayStart = new Date(targetDate);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);
  
  const todayStart = new Date(targetDate);
  todayStart.setHours(0, 0, 0, 0);

  // Get all issues that were assigned to users during or before yesterday
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId,
      assigneeId: { not: null },
      ...(userIds?.length ? { assigneeId: { in: userIds } } : {}),
      ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
      // Issue must have been created before end of yesterday
      createdAt: { lte: yesterdayEnd },
    },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      project: { select: { id: true, name: true } },
      projectStatus: { select: { name: true, displayName: true, isFinal: true } },
    },
  });

  // For each issue, check what status changes happened during yesterday
  const userActivitiesMap = new Map<string, IssueActivity[]>();

  for (const issue of issues) {
    if (!issue.assigneeId) continue;

    // Get status changes during yesterday
    const yesterdayStatusChanges = await prisma.boardItemActivity.findMany({
      where: {
        itemId: issue.id,
        itemType: 'ISSUE',
        action: 'STATUS_CHANGED',
        createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Determine status at start and end of yesterday
    let statusAtStartOfYesterday = await getIssueStatusAtDate(issue.id, yesterdayStart);
    let statusAtEndOfYesterday = yesterdayStatusChanges.length > 0
      ? yesterdayStatusChanges[yesterdayStatusChanges.length - 1].newValue
      : statusAtStartOfYesterday;

    // Determine status today for comparison
    let statusToday = issue.projectStatus?.name || issue.statusValue;

    // Check if issue was moved to done during yesterday
    const movedToDoneYesterday = yesterdayStatusChanges.some(
      change => change.newValue?.toLowerCase().includes('done') || 
                change.newValue?.toLowerCase().includes('complete')
    );

    // Only show if issue was in active work states yesterday (but NOT already done)
    const wasInProgressOrReview = 
      statusAtStartOfYesterday?.toLowerCase().includes('progress') ||
      statusAtStartOfYesterday?.toLowerCase().includes('review') ||
      statusAtEndOfYesterday?.toLowerCase().includes('progress') ||
      statusAtEndOfYesterday?.toLowerCase().includes('review');

    // Skip if issue was already done before yesterday or not actively worked on
    if (!wasInProgressOrReview && !movedToDoneYesterday) {
      continue;
    }

    // Categorize based on status transitions
    const symbol = categorizeYesterdayIssue(
      statusAtStartOfYesterday,
      statusAtEndOfYesterday,
      statusToday,
      issue.createdAt,
      yesterdayStart
    );

    // Skip empty symbols (issues that don't fit any category)
    if (!symbol) continue;

    if (!userActivitiesMap.has(issue.assigneeId)) {
      userActivitiesMap.set(issue.assigneeId, []);
    }

    userActivitiesMap.get(issue.assigneeId)!.push({
      issueId: issue.id,
      issueKey: issue.issueKey || '',
      title: issue.title,
      projectName: issue.project?.name || '',
      projectId: issue.projectId,
      statusSymbol: symbol,
      statusText: getStatusText(symbol, statusAtEndOfYesterday),
      priority: issue.priority,
      dueDate: issue.dueDate || undefined,
    });
  }

  return userActivitiesMap;
}

/**
 * Analyze what team members are working on today
 */
export async function analyzeToday(
  workspaceId: string,
  userIds?: string[],
  projectIds?: string[]
): Promise<Map<string, IssueActivity[]>> {
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId,
      assigneeId: { not: null },
      ...(userIds?.length ? { assigneeId: { in: userIds } } : {}),
      ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
      // Only active issues (not done)
      projectStatus: {
        isFinal: false,
      },
    },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      project: { select: { id: true, name: true } },
      projectStatus: { select: { name: true, displayName: true, isFinal: true } },
    },
  });

  const userIssuesMap = new Map<string, IssueActivity[]>();

  for (const issue of issues) {
    if (!issue.assigneeId) continue;

    const status = issue.projectStatus?.name?.toLowerCase() || issue.statusValue?.toLowerCase() || '';
    
    // Categorize current state
    let symbol: IssueActivity['statusSymbol'] = '';
    let statusText = issue.projectStatus?.displayName || issue.statusValue || '';

    if (status.includes('progress')) {
      symbol = '💼'; // Working
      statusText = 'Working';
    } else if (status.includes('review') || status.includes('deployment')) {
      symbol = '🔍'; // In Review
      statusText = 'In Review';
    } else if (status.includes('todo')) {
      symbol = '🎯'; // Planned
      statusText = 'Planned';
    } else if (status.includes('blocked')) {
      symbol = '🚫'; // Blocked
      statusText = 'Blocked';
    }

    if (!userIssuesMap.has(issue.assigneeId)) {
      userIssuesMap.set(issue.assigneeId, []);
    }

    const daysInProgress = await calculateDaysInProgress(issue.id);

    userIssuesMap.get(issue.assigneeId)!.push({
      issueId: issue.id,
      issueKey: issue.issueKey || '',
      title: issue.title,
      projectName: issue.project?.name || '',
      projectId: issue.projectId,
      statusSymbol: symbol,
      statusText,
      daysInProgress,
      priority: issue.priority,
      dueDate: issue.dueDate || undefined,
    });
  }

  return userIssuesMap;
}

/**
 * Detect blocked issues
 */
export async function detectBlockers(
  workspaceId: string,
  userIds?: string[],
  projectIds?: string[]
): Promise<Map<string, IssueActivity[]>> {
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId,
      ...(userIds && userIds.length > 0 ? { assigneeId: { in: userIds } } : {}),
      ...(projectIds && projectIds.length > 0 ? { projectId: { in: projectIds } } : {}),
      OR: [
        {
          // Explicit blocker status
          projectStatus: {
            name: {
              in: ['blocked', 'pending', 'waiting'],
              mode: 'insensitive',
            },
          },
        },
        {
          // Has blocker relation
          targetRelations: {
            some: {
              relationType: 'BLOCKED_BY',
            },
          },
        },
      ],
      // Not done
      projectStatus: {
        isFinal: false,
      },
    },
    include: {
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
          image: true,
        },
      },
      projectStatus: {
        select: {
          name: true,
          displayName: true,
        },
      },
      targetRelations: {
        where: {
          relationType: 'BLOCKED_BY',
        },
        include: {
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

  const userBlockersMap = new Map<string, IssueActivity[]>();

  for (const issue of issues) {
    if (!issue.assigneeId) continue;

    if (!userBlockersMap.has(issue.assigneeId)) {
      userBlockersMap.set(issue.assigneeId, []);
    }

    const blocker = issue.targetRelations[0]?.sourceIssue;
    const notes = blocker ? `Blocked by ${blocker.issueKey}` : undefined;

    userBlockersMap.get(issue.assigneeId)!.push({
      issueId: issue.id,
      issueKey: issue.issueKey || '',
      title: issue.title,
      projectName: issue.project?.name || 'No Project',
      projectId: issue.projectId,
      statusSymbol: '🔀',
      statusText: issue.projectStatus?.displayName || 'Blocked',
      notes,
      priority: issue.priority,
      dueDate: issue.dueDate || undefined,
    });
  }

  return userBlockersMap;
}

/**
 * Calculate how many days an issue has been in progress
 */
export async function calculateDaysInProgress(issueId: string): Promise<number> {
  // Find first time moved to in_progress
  const firstInProgress = await prisma.boardItemActivity.findFirst({
    where: {
      itemId: issueId,
      itemType: 'ISSUE',
      action: 'STATUS_CHANGED',
      newValue: {
        contains: 'in_progress',
        mode: 'insensitive',
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (!firstInProgress) return 0;

  // Count days from first in progress to now
  const daysDiff = Math.floor(
    (Date.now() - firstInProgress.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysDiff;
}

/**
 * Calculate issue lifecycle statistics
 */
export async function calculateIssueLifecycle(issueId: string) {
  const activities = await prisma.boardItemActivity.findMany({
    where: {
      itemId: issueId,
      itemType: 'ISSUE',
      action: 'STATUS_CHANGED',
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const lifecycle = {
    totalDays: 0,
    daysInProgress: 0,
    daysInReview: 0,
    daysBlocked: 0,
    statusChanges: activities.length,
  };

  if (activities.length === 0) return lifecycle;

  const firstActivity = activities[0];
  const lastActivity = activities[activities.length - 1];
  
  lifecycle.totalDays = Math.floor(
    (lastActivity.createdAt.getTime() - firstActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate time in each status
  for (let i = 0; i < activities.length - 1; i++) {
    const current = activities[i];
    const next = activities[i + 1];
    
    const daysInStatus = Math.floor(
      (next.createdAt.getTime() - current.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const status = current.newValue?.toLowerCase() || '';
    
    if (status.includes('in_progress')) {
      lifecycle.daysInProgress += daysInStatus;
    } else if (status.includes('review')) {
      lifecycle.daysInReview += daysInStatus;
    } else if (status.includes('blocked') || status.includes('waiting')) {
      lifecycle.daysBlocked += daysInStatus;
    }
  }

  return lifecycle;
}

/**
 * Detect anomalies in user's work patterns
 */
export async function detectAnomalies(
  userId: string,
  workspaceId: string
): Promise<string[]> {
  const warnings: string[] = [];

  // Get user's current in-progress issues
  const inProgressIssues = await prisma.issue.findMany({
    where: {
      workspaceId,
      assigneeId: userId,
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
  });

  // Warning: Too many tasks in progress
  if (inProgressIssues.length >= 3) {
    warnings.push(`${inProgressIssues.length} tasks in progress - consider focusing on fewer items`);
  }

  // Check for long-running issues
  for (const issue of inProgressIssues) {
    const days = await calculateDaysInProgress(issue.id);
    if (days >= 5) {
      warnings.push(`"${issue.title}" has been in progress for ${days} days`);
    }
  }

  // Check for overdue issues
  const overdueIssues = inProgressIssues.filter(
    issue => issue.dueDate && new Date(issue.dueDate) < new Date()
  );
  
  if (overdueIssues.length > 0) {
    warnings.push(`${overdueIssues.length} overdue ${overdueIssues.length === 1 ? 'task' : 'tasks'}`);
  }

  return warnings;
}

/**
 * Get human-readable status text
 */
function getStatusText(
  symbol: IssueActivity['statusSymbol'],
  statusValue?: string | null
): string {
  switch (symbol) {
    case '✅': return 'Completed';
    case '⛔️': return 'Not Completed';
    case '⚡️': return 'Unplanned Work';
    case '🔍': return 'In Review';
    case '🎯': return 'Planned';
    case '💼': return 'Working';
    case '🚫': return 'Blocked';
    default: return statusValue || 'In Progress';
  }
}

/**
 * Generate complete team sync data
 */
export async function generateTeamSync(
  workspaceId: string,
  targetDate: Date,
  userIds?: string[],
  projectIds?: string[]
): Promise<TeamMemberSync[]> {
  // Get all relevant users
  const users = await prisma.user.findMany({
    where: {
      ...(userIds && userIds.length > 0 ? { id: { in: userIds } } : {}),
      workspaceMemberships: {
        some: {
          workspaceId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      image: true,
    },
  });

  const yesterdayMap = await analyzeYesterday(workspaceId, targetDate, userIds, projectIds);
  const todayMap = await analyzeToday(workspaceId, userIds, projectIds);
  const blockersMap = await detectBlockers(workspaceId, userIds, projectIds);

  const teamSync: TeamMemberSync[] = [];

  for (const user of users) {
    const yesterday = yesterdayMap.get(user.id) || [];
    const today = todayMap.get(user.id) || [];
    const blockers = blockersMap.get(user.id) || [];
    
    // Calculate insights
    const warnings = await detectAnomalies(user.id, workspaceId);
    
    const completedToday = yesterday.filter(i => i.statusSymbol === '✅').length;
    
    const longestInProgress = today.reduce((longest, issue) => {
      if (!issue.daysInProgress) return longest;
      if (!longest || issue.daysInProgress > longest.days) {
        return { title: issue.title, days: issue.daysInProgress };
      }
      return longest;
    }, undefined as { title: string; days: number } | undefined);

    teamSync.push({
      userId: user.id,
      userName: user.name || 'Unknown',
      userImage: user.image || undefined,
      yesterday,
      today,
      blockers,
      insights: {
        tasksInProgress: today.length,
        tasksCompletedToday: completedToday,
        averageCompletionDays: 0, // TODO: Calculate from history
        longestInProgressIssue: longestInProgress,
        warnings,
      },
    });
  }

  return teamSync.filter(
    sync => sync.yesterday.length > 0 || sync.today.length > 0 || sync.blockers.length > 0
  );
}

