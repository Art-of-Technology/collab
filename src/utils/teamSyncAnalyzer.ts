import { prisma } from '@/lib/prisma';

// ============================================================================
// Base Types
// ============================================================================

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
  statusSymbol: '✅' | '⛔️' | '⚡️' | '🔍' | '🎯' | '💼' | '🚫' | '🔀' | '';
  statusText: string;
  statusDisplayName?: string; // Human-readable status name from DB
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

// ============================================================================
// Enhanced Planning View Types
// ============================================================================

export type MovementType = 'started' | 'completed' | 'moved_to_review' | 'blocked' | 'unblocked' | 'assigned' | 'created';

export type StatusCategory = 'completed' | 'in_progress' | 'in_review' | 'planned' | 'blocked';

export interface IssueMovement {
  issueId: string;
  issueKey: string;
  title: string;
  projectName: string;
  projectId: string;
  fromStatus: string | null;
  toStatus: string;
  fromStatusDisplayName?: string;
  toStatusDisplayName?: string;
  movedAt: Date;
  movementType: MovementType;
  userId?: string;
  userName?: string;
  priority?: string;
}

export interface DayActivity {
  date: string; // ISO date string YYYY-MM-DD
  completed: IssueActivity[];      // Issues moved to done on this day
  started: IssueActivity[];        // Issues moved to in_progress on this day
  movedToReview: IssueActivity[];  // Issues moved to review/testing/deploy on this day
  inProgress: IssueActivity[];     // Issues that were in progress during this day
  inReview: IssueActivity[];       // Issues that were in review during this day
  blocked: IssueActivity[];        // Issues that were blocked during this day
  planned: IssueActivity[];        // Issues that were in todo/backlog (only to_do status)
  movements: IssueMovement[];      // All status changes on this day
}

export interface TeamMemberRangeSync {
  userId: string;
  userName: string;
  userImage?: string;
  days: Record<string, DayActivity>; // dateString -> activity
  summary: {
    totalCompleted: number;
    totalStarted: number;
    avgDaysToComplete: number;
    currentWorkload: number;
    completionRate: number;
  };
  insights: UserInsights;
}

export interface TeamRangeSummary {
  totalCompleted: number;
  totalStarted: number;
  totalInProgress: number;
  totalInReview: number;
  totalPlanned: number;
  totalMovements: number;
  mostActiveDay: string | null;
  teamCompletionRate: number;
}

export interface TeamRangeSync {
  members: TeamMemberRangeSync[];
  summary: TeamRangeSummary;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// ============================================================================
// Bulk Status History Cache (for performance optimization)
// ============================================================================

interface StatusHistoryEntry {
  issueId: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
}

/**
 * Get issue status at a specific date using pre-fetched history
 * O(1) lookup instead of database query
 */
function getIssueStatusAtDateFromHistory(
  issueId: string,
  date: Date,
  statusHistoryMap: Map<string, StatusHistoryEntry[]>,
  issueDefaultStatus: Map<string, string>
): string | null {
  const history = statusHistoryMap.get(issueId) || [];
  
  // Find the last status change before or at this date
  // History is sorted by createdAt ASC, so we iterate backwards
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].createdAt <= date) {
      return history[i].newValue;
    }
  }
  
  // If no status changes before this date, use issue's default/current status
  return issueDefaultStatus.get(issueId) || null;
}

/**
 * Calculate days in progress from pre-fetched history
 * O(1) lookup instead of database query
 */
function calculateDaysInProgressFromHistory(
  issueId: string,
  statusHistoryMap: Map<string, StatusHistoryEntry[]>
): number {
  const history = statusHistoryMap.get(issueId) || [];
  
  // Find first time moved to in_progress
  const firstInProgress = history.find(h => 
    h.newValue?.toLowerCase().includes('in_progress') ||
    h.newValue?.toLowerCase().includes('progress')
  );
  
  if (!firstInProgress) return 0;
  
  // Count days from first in progress to now
  const daysDiff = Math.floor(
    (Date.now() - firstInProgress.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return daysDiff;
}

/**
 * Helper function to get issue status at a specific date (LEGACY - for non-bulk operations)
 * @deprecated Use getIssueStatusAtDateFromHistory for bulk operations
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
  if (end.includes('review') || end.includes('deploy') || end.includes('testing') || end.includes('test')) {
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
    } else if (status.includes('review') || status.includes('deploy') || status.includes('test')) {
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

// ============================================================================
// Enhanced Planning View Functions
// ============================================================================

/**
 * Classify a status string into a category
 */
export function classifyStatus(status: string | null): StatusCategory {
  const s = status?.toLowerCase() || '';
  
  if (s.includes('done') || s.includes('complete') || s.includes('closed')) {
    return 'completed';
  }
  if (s.includes('review') || s.includes('test') || s.includes('deploy') || s.includes('qa')) {
    return 'in_review';
  }
  if (s.includes('progress') || s.includes('working') || s.includes('development')) {
    return 'in_progress';
  }
  if (s.includes('blocked') || s.includes('waiting') || s.includes('pending')) {
    return 'blocked';
  }
  return 'planned';
}

/**
 * Determine the movement type from status transition
 */
function getMovementType(fromStatus: string | null, toStatus: string): MovementType {
  const from: StatusCategory = classifyStatus(fromStatus);
  const to: StatusCategory = classifyStatus(toStatus);

  if (to === 'completed') return 'completed';
  if (to === 'blocked') return 'blocked';
  if (to === 'in_review') return 'moved_to_review';
  if (to === 'in_progress' && from !== 'in_progress') return 'started';
  if (from === 'blocked') return 'unblocked';
  
  return 'started'; // Default fallback
}

/**
 * Get all status movements for a date range
 */
export async function getStatusMovements(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  userIds?: string[],
  projectIds?: string[]
): Promise<IssueMovement[]> {
  const movements: IssueMovement[] = [];

  // Get all status change activities in the date range
  const activities = await prisma.boardItemActivity.findMany({
    where: {
      workspaceId,
      itemType: 'ISSUE',
      action: 'STATUS_CHANGED',
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      ...(userIds?.length ? { userId: { in: userIds } } : {}),
    },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Get issue details for all affected issues
  const issueIds = [...new Set(activities.map(a => a.itemId))];
  const issues = await prisma.issue.findMany({
    where: {
      id: { in: issueIds },
      ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  const issueMap = new Map(issues.map(i => [i.id, i]));

  // Get all unique project IDs from the issues
  const projectIdsFromIssues = [...new Set(issues.map(i => i.projectId))];
  
  // Fetch all project statuses for the relevant projects to get display names
  const projectStatuses = await prisma.projectStatus.findMany({
    where: {
      projectId: { in: projectIdsFromIssues },
    },
    select: {
      projectId: true,
      name: true,
      displayName: true,
    },
  });

  // Create a map for quick status display name lookup: projectId:statusName -> displayName
  // Use lowercase keys to handle case-insensitive matching
  const statusDisplayNameMap = new Map<string, string>();
  for (const status of projectStatuses) {
    const key = `${status.projectId}:${status.name.toLowerCase()}`;
    statusDisplayNameMap.set(key, status.displayName || status.name);
  }

  for (const activity of activities) {
    const issue = issueMap.get(activity.itemId);
    if (!issue) continue; // Skip if issue was filtered out by project

    // Get display names for from/to statuses (use lowercase for case-insensitive matching)
    const fromStatusKey = activity.oldValue ? `${issue.projectId}:${activity.oldValue.toLowerCase()}` : null;
    const toStatusKey = `${issue.projectId}:${(activity.newValue || '').toLowerCase()}`;
    
    const fromStatusDisplayName = fromStatusKey ? statusDisplayNameMap.get(fromStatusKey) : undefined;
    const toStatusDisplayName = statusDisplayNameMap.get(toStatusKey);

    movements.push({
      issueId: issue.id,
      issueKey: issue.issueKey || '',
      title: issue.title,
      projectName: issue.project?.name || '',
      projectId: issue.projectId,
      fromStatus: activity.oldValue || null,
      toStatus: activity.newValue || '',
      fromStatusDisplayName: fromStatusDisplayName || activity.oldValue || undefined,
      toStatusDisplayName: toStatusDisplayName || activity.newValue || '',
      movedAt: activity.createdAt,
      movementType: getMovementType(activity.oldValue, activity.newValue || ''),
      userId: activity.userId || undefined,
      userName: activity.user?.name || undefined,
      priority: issue.priority,
    });
  }

  return movements;
}

/**
 * Analyze activity for a specific date
 */
export async function analyzeDayActivity(
  workspaceId: string,
  date: Date,
  userIds?: string[],
  projectIds?: string[]
): Promise<Map<string, DayActivity>> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  
  const dateStr = dayStart.toISOString().split('T')[0];

  // Get all movements for this day
  const movements = await getStatusMovements(workspaceId, dayStart, dayEnd, userIds, projectIds);

  // Get current state of issues for users
  const issues = await prisma.issue.findMany({
    where: {
      workspaceId,
      assigneeId: { not: null },
      ...(userIds?.length ? { assigneeId: { in: userIds } } : {}),
      ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
      createdAt: { lte: dayEnd },
    },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      project: { select: { id: true, name: true } },
      projectStatus: { select: { name: true, displayName: true, isFinal: true } },
    },
  });

  const userDayMap = new Map<string, DayActivity>();

  // Initialize day activity for each user
  for (const issue of issues) {
    if (!issue.assigneeId) continue;
    
    if (!userDayMap.has(issue.assigneeId)) {
      userDayMap.set(issue.assigneeId, {
        date: dateStr,
        completed: [],
        started: [],
        movedToReview: [],
        inProgress: [],
        inReview: [],
        blocked: [],
        planned: [],
        movements: [],
      });
    }

    // Get status at end of day
    const statusAtEndOfDay = await getIssueStatusAtDate(issue.id, dayEnd);
    const category = classifyStatus(statusAtEndOfDay);
    
    const daysInProgress = await calculateDaysInProgress(issue.id);
    
    const activity: IssueActivity = {
      issueId: issue.id,
      issueKey: issue.issueKey || '',
      title: issue.title,
      projectName: issue.project?.name || '',
      projectId: issue.projectId,
      statusSymbol: getStatusSymbol(category),
      statusText: statusAtEndOfDay || '',
      daysInProgress,
      priority: issue.priority,
      dueDate: issue.dueDate || undefined,
    };

    const dayActivity = userDayMap.get(issue.assigneeId)!;

    // Add to appropriate category based on status at end of day
    switch (category) {
      case 'completed':
        // Only add if it was completed on this day
        const wasCompletedToday = movements.some(
          m => m.issueId === issue.id && m.movementType === 'completed'
        );
        if (wasCompletedToday) {
          dayActivity.completed.push(activity);
        }
        break;
      case 'in_progress':
        dayActivity.inProgress.push(activity);
        break;
      case 'in_review':
        dayActivity.inReview.push(activity);
        break;
      case 'blocked':
        dayActivity.blocked.push({ ...activity, statusSymbol: '🚫' });
        break;
      case 'planned':
        // Only include issues with "to_do" status (not backlog, won't fix, etc.)
        const statusLower = (statusAtEndOfDay || '').toLowerCase();
        if (statusLower.includes('todo') || statusLower.includes('to do') || statusLower.includes('to_do')) {
          dayActivity.planned.push(activity);
        }
        break;
    }

    // Check if issue was started on this day
    const wasStartedToday = movements.some(
      m => m.issueId === issue.id && m.movementType === 'started'
    );
    if (wasStartedToday) {
      dayActivity.started.push(activity);
    }
  }

  // Add movements to each user's day activity
  for (const movement of movements) {
    // Find which user this movement belongs to (from the issue's assignee)
    const issue = issues.find(i => i.id === movement.issueId);
    if (issue?.assigneeId && userDayMap.has(issue.assigneeId)) {
      userDayMap.get(issue.assigneeId)!.movements.push(movement);
    }
  }

  return userDayMap;
}

/**
 * Get status symbol from category
 */
function getStatusSymbol(category: StatusCategory): IssueActivity['statusSymbol'] {
  switch (category) {
    case 'completed': return '✅';
    case 'in_progress': return '💼';
    case 'in_review': return '🔍';
    case 'blocked': return '🚫';
    case 'planned': return '🎯';
    default: return '';
  }
}

/**
 * Generate team sync data for a date range - OPTIMIZED VERSION
 * Uses bulk data fetching to eliminate N+1 queries
 */
export async function generateTeamRangeSync(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  userIds?: string[],
  projectIds?: string[]
): Promise<TeamRangeSync> {
  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);

  // ============================================================================
  // STEP 1: BULK FETCH ALL DATA IN PARALLEL (3 queries total instead of N*M)
  // ============================================================================

  const [users, allIssues, allStatusChanges] = await Promise.all([
    // Query 1: Get all relevant users
    prisma.user.findMany({
      where: {
        ...(userIds?.length ? { id: { in: userIds } } : {}),
        workspaceMemberships: {
          some: { workspaceId },
        },
      },
      select: {
        id: true,
        name: true,
        image: true,
      },
    }),

    // Query 2: Get ALL issues assigned to relevant users (created before end date)
    prisma.issue.findMany({
      where: {
        workspaceId,
        assigneeId: { not: null },
        ...(userIds?.length ? { assigneeId: { in: userIds } } : {}),
        ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
        createdAt: { lte: rangeEnd },
      },
      include: {
        assignee: { select: { id: true, name: true, image: true } },
        project: { select: { id: true, name: true } },
        projectStatus: { select: { name: true, displayName: true, isFinal: true } },
      },
    }),

    // Query 3: Get ALL status changes for the workspace in date range (plus history before range)
    // We need history before range to know starting status of each issue
    prisma.boardItemActivity.findMany({
      where: {
        workspaceId,
        itemType: 'ISSUE',
        action: 'STATUS_CHANGED',
        // Get all history up to end of range to properly calculate status at any point
        createdAt: { lte: rangeEnd },
      },
      select: {
        itemId: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        userId: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // ============================================================================
  // STEP 2: BUILD LOOKUP MAPS FOR O(1) ACCESS
  // ============================================================================

  // Map: issueId -> sorted list of status changes
  const statusHistoryMap = new Map<string, StatusHistoryEntry[]>();
  for (const change of allStatusChanges) {
    if (!statusHistoryMap.has(change.itemId)) {
      statusHistoryMap.set(change.itemId, []);
    }
    statusHistoryMap.get(change.itemId)!.push({
      issueId: change.itemId,
      oldValue: change.oldValue,
      newValue: change.newValue,
      createdAt: change.createdAt,
    });
  }

  // Map: issueId -> default status (from current project status)
  const issueDefaultStatus = new Map<string, string>();
  const issueMap = new Map(allIssues.map(i => [i.id, i]));
  for (const issue of allIssues) {
    const defaultStatus = issue.projectStatus?.name || issue.statusValue || '';
    issueDefaultStatus.set(issue.id, defaultStatus);
  }

  // Filter issues by project if needed (since status changes don't have project info)
  const relevantIssueIds = new Set(allIssues.map(i => i.id));

  // Build status display name map for all projects (use lowercase keys for case-insensitive matching)
  const projectIdsFromIssues = [...new Set(allIssues.map(i => i.projectId))];
  const allProjectStatuses = await prisma.projectStatus.findMany({
    where: { projectId: { in: projectIdsFromIssues } },
    select: { projectId: true, name: true, displayName: true },
  });
  const statusDisplayNameMap = new Map<string, string>();
  for (const status of allProjectStatuses) {
    statusDisplayNameMap.set(`${status.projectId}:${status.name.toLowerCase()}`, status.displayName || status.name);
  }

  // ============================================================================
  // STEP 3: COLLECT ALL DAYS IN RANGE
  // ============================================================================

  const days: Date[] = [];
  const current = new Date(rangeStart);
  while (current <= rangeEnd) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // ============================================================================
  // STEP 4: PROCESS ALL DAYS AND USERS IN MEMORY (NO MORE DB QUERIES!)
  // ============================================================================

  // Pre-calculate daysInProgress for all issues (once)
  const daysInProgressCache = new Map<string, number>();
  for (const issue of allIssues) {
    daysInProgressCache.set(
      issue.id, 
      calculateDaysInProgressFromHistory(issue.id, statusHistoryMap)
    );
  }

  // Build movement lookup by day
  const movementsByDay = new Map<string, IssueMovement[]>();
  for (const change of allStatusChanges) {
    if (!relevantIssueIds.has(change.itemId)) continue;
    if (change.createdAt < rangeStart) continue; // Only movements within range
    
    const dateStr = change.createdAt.toISOString().split('T')[0];
    if (!movementsByDay.has(dateStr)) {
      movementsByDay.set(dateStr, []);
    }
    
    const issue = issueMap.get(change.itemId);
    if (!issue) continue;
    
    // Get display names for from/to statuses (use lowercase for case-insensitive matching)
    const fromStatusKey = change.oldValue ? `${issue.projectId}:${change.oldValue.toLowerCase()}` : null;
    const toStatusKey = `${issue.projectId}:${(change.newValue || '').toLowerCase()}`;

    movementsByDay.get(dateStr)!.push({
      issueId: issue.id,
      issueKey: issue.issueKey || '',
      title: issue.title,
      projectName: issue.project?.name || '',
      projectId: issue.projectId,
      fromStatus: change.oldValue || null,
      toStatus: change.newValue || '',
      fromStatusDisplayName: fromStatusKey ? statusDisplayNameMap.get(fromStatusKey) || change.oldValue || undefined : undefined,
      toStatusDisplayName: statusDisplayNameMap.get(toStatusKey) || change.newValue || '',
      movedAt: change.createdAt,
      movementType: getMovementType(change.oldValue, change.newValue || ''),
      userId: change.userId || undefined,
      priority: issue.priority,
    });
  }

  // Build member range sync data
  const members: TeamMemberRangeSync[] = [];
  let summaryTotalCompleted = 0;
  let summaryTotalStarted = 0;
  let summaryTotalMovements = 0;
  const dayMovementCounts: Record<string, number> = {};

  for (const user of users) {
    const memberDays: Record<string, DayActivity> = {};
    let memberCompleted = 0;
    let memberStarted = 0;
    let totalDaysToComplete = 0;
    let completedIssueCount = 0;

    // Get user's issues
    const userIssues = allIssues.filter(i => i.assigneeId === user.id);

    for (const day of days) {
      const dateStr = day.toISOString().split('T')[0];
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const dayActivity: DayActivity = {
        date: dateStr,
        completed: [],
        started: [],
        movedToReview: [],
        inProgress: [],
        inReview: [],
        blocked: [],
        planned: [],
        movements: [],
      };

      // Get movements for this day for this user's issues
      const dayMovements = (movementsByDay.get(dateStr) || [])
        .filter(m => userIssues.some(i => i.id === m.issueId));
      
      dayActivity.movements = dayMovements;
      summaryTotalMovements += dayMovements.length;
      dayMovementCounts[dateStr] = (dayMovementCounts[dateStr] || 0) + dayMovements.length;

      // Process each issue
      for (const issue of userIssues) {
        // Skip if issue was created after this day
        if (issue.createdAt > dayEnd) continue;

        // Get status at end of day using cached history (O(1) lookup)
        const statusAtEndOfDay = getIssueStatusAtDateFromHistory(
          issue.id, 
          dayEnd, 
          statusHistoryMap, 
          issueDefaultStatus
        );
        const category = classifyStatus(statusAtEndOfDay);
        const daysInProgress = daysInProgressCache.get(issue.id) || 0;

        const activity: IssueActivity = {
          issueId: issue.id,
          issueKey: issue.issueKey || '',
          title: issue.title,
          projectName: issue.project?.name || '',
          projectId: issue.projectId,
          statusSymbol: getStatusSymbol(category),
          statusText: statusAtEndOfDay || '',
          statusDisplayName: issue.projectStatus?.displayName || statusAtEndOfDay || '',
          daysInProgress,
          priority: issue.priority,
          dueDate: issue.dueDate || undefined,
        };

        // Check if completed on this specific day
        const wasCompletedOnThisDay = dayMovements.some(
          m => m.issueId === issue.id && m.movementType === 'completed'
        );

        // Check if started on this specific day
        const wasStartedOnThisDay = dayMovements.some(
          m => m.issueId === issue.id && m.movementType === 'started'
        );

        // Check if moved to review on this specific day
        const wasMovedToReviewOnThisDay = dayMovements.some(
          m => m.issueId === issue.id && m.movementType === 'moved_to_review'
        );

        // Add to appropriate category based on current status
        switch (category) {
          case 'completed':
            if (wasCompletedOnThisDay) {
              dayActivity.completed.push(activity);
              if (daysInProgress) {
                totalDaysToComplete += daysInProgress;
                completedIssueCount++;
              }
            }
            break;
          case 'in_progress':
            dayActivity.inProgress.push(activity);
            break;
          case 'in_review':
            dayActivity.inReview.push(activity);
            break;
          case 'blocked':
            dayActivity.blocked.push({ ...activity, statusSymbol: '🚫' });
            break;
          case 'planned':
            // Only include issues with "to_do" status (not backlog, won't fix, etc.)
            const statusLower = (statusAtEndOfDay || '').toLowerCase();
            if (statusLower.includes('todo') || statusLower.includes('to do') || statusLower.includes('to_do')) {
              dayActivity.planned.push(activity);
            }
            break;
        }

        // Track transitions that happened on this day
        if (wasStartedOnThisDay) {
          dayActivity.started.push(activity);
        }
        if (wasMovedToReviewOnThisDay) {
          dayActivity.movedToReview.push(activity);
        }
      }

      memberDays[dateStr] = dayActivity;
      memberCompleted += dayActivity.completed.length;
      memberStarted += dayActivity.started.length;
    }

    // Get current workload (from the last day)
    const lastDayStr = days[days.length - 1].toISOString().split('T')[0];
    const lastDayActivity = memberDays[lastDayStr];
    const currentWorkload = lastDayActivity 
      ? lastDayActivity.inProgress.length + lastDayActivity.inReview.length
      : 0;

    const avgDaysToComplete = completedIssueCount > 0 
      ? Math.round(totalDaysToComplete / completedIssueCount) 
      : 0;

    const completionRate = memberStarted > 0 
      ? Math.round((memberCompleted / memberStarted) * 100) 
      : 0;

    // Simplified warnings (avoid additional DB queries)
    const warnings: string[] = [];
    if (currentWorkload >= 3) {
      warnings.push(`${currentWorkload} tasks active - consider focusing on fewer items`);
    }
    
    // Check for long-running issues from cache
    for (const issue of userIssues) {
      const days = daysInProgressCache.get(issue.id) || 0;
      const status = issueDefaultStatus.get(issue.id) || '';
      if (days >= 5 && classifyStatus(status) === 'in_progress') {
        warnings.push(`"${issue.title}" has been in progress for ${days} days`);
      }
    }

    members.push({
      userId: user.id,
      userName: user.name || 'Unknown',
      userImage: user.image || undefined,
      days: memberDays,
      summary: {
        totalCompleted: memberCompleted,
        totalStarted: memberStarted,
        avgDaysToComplete,
        currentWorkload,
        completionRate,
      },
      insights: {
        tasksInProgress: currentWorkload,
        tasksCompletedToday: memberCompleted,
        averageCompletionDays: avgDaysToComplete,
        warnings,
      },
    });

    summaryTotalCompleted += memberCompleted;
    summaryTotalStarted += memberStarted;
  }

  // ============================================================================
  // STEP 5: CALCULATE SUMMARY STATS
  // ============================================================================

  const uniqueInProgress = new Set<string>();
  const uniqueInReview = new Set<string>();
  const uniquePlanned = new Set<string>();

  for (const member of members) {
    const lastDayStr = days[days.length - 1].toISOString().split('T')[0];
    const lastDay = member.days[lastDayStr];
    if (lastDay) {
      lastDay.inProgress.forEach(i => uniqueInProgress.add(i.issueId));
      lastDay.inReview.forEach(i => uniqueInReview.add(i.issueId));
      lastDay.planned.forEach(i => uniquePlanned.add(i.issueId));
    }
  }

  // Find most active day
  let mostActiveDay: string | null = null;
  let maxMovements = 0;
  for (const [day, count] of Object.entries(dayMovementCounts)) {
    if (count > maxMovements) {
      maxMovements = count;
      mostActiveDay = day;
    }
  }

  const teamCompletionRate = summaryTotalStarted > 0 
    ? Math.round((summaryTotalCompleted / summaryTotalStarted) * 100) 
    : 0;

  return {
    members: members.filter(
      m => Object.values(m.days).some(
        d => d.completed.length > 0 || d.started.length > 0 || 
             d.inProgress.length > 0 || d.movements.length > 0
      )
    ),
    summary: {
      totalCompleted: summaryTotalCompleted,
      totalStarted: summaryTotalStarted,
      totalInProgress: uniqueInProgress.size,
      totalInReview: uniqueInReview.size,
      totalPlanned: uniquePlanned.size,
      totalMovements: summaryTotalMovements,
      mostActiveDay,
      teamCompletionRate,
    },
    dateRange: {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    },
  };
}

/**
 * Get all activities for a date range (for activity feed)
 */
export async function getActivityFeed(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  userIds?: string[],
  projectIds?: string[],
  limit: number = 100
): Promise<IssueMovement[]> {
  const movements = await getStatusMovements(workspaceId, startDate, endDate, userIds, projectIds);
  
  // Sort by most recent first
  movements.sort((a, b) => b.movedAt.getTime() - a.movedAt.getTime());
  
  return movements.slice(0, limit);
}

