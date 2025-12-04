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
  statusSymbol: '✅' | '⛔️' | '⚡️' | '🔀' | '';
  statusText: string;
  daysInProgress?: number;
  notes?: string;
  priority?: string;
  dueDate?: Date;
  source?: 'AUTO_DETECTED' | 'MANUALLY_ADDED' | 'SUGGESTED';
  actorName?: string; // Who performed the action (if different from assignee)
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
 * 🎯 IMPROVED: Analyze what team members worked on yesterday
 * Key Change: Credits work to ASSIGNEES, not actors
 */
export async function analyzeYesterdayImproved(
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

  // Get all activities from yesterday
  const activities = await prisma.boardItemActivity.findMany({
    where: {
      workspaceId,
      itemType: 'ISSUE',
      createdAt: {
        gte: yesterdayStart,
        lte: yesterdayEnd,
      },
      action: {
        in: ['STATUS_CHANGED', 'MOVED', 'UPDATED', 'ASSIGNED', 'CREATED'],
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Get unique issue IDs
  const issueIds = [...new Set(activities.map(a => a.itemId))];

  // Fetch full issue details
  const issues = await prisma.issue.findMany({
    where: {
      id: { in: issueIds },
      workspaceId,
      ...(projectIds && projectIds.length > 0 ? { projectId: { in: projectIds } } : {}),
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
          isFinal: true,
        },
      },
    },
  });

  const issueMap = new Map(issues.map(i => [i.id, i]));
  const userActivitiesMap = new Map<string, IssueActivity[]>();

  // 🔥 KEY IMPROVEMENT: Group by ASSIGNEE, not actor
  for (const activity of activities) {
    const issue = issueMap.get(activity.itemId);
    if (!issue) continue;

    // 🎯 Use assignee ID instead of actor ID
    const assigneeId = issue.assigneeId;
    if (!assigneeId) {
      // Handle unassigned issues - we'll suggest assignment
      continue;
    }

    // Apply user filter AFTER determining assignee
    if (userIds && userIds.length > 0 && !userIds.includes(assigneeId)) {
      continue;
    }

    if (!userActivitiesMap.has(assigneeId)) {
      userActivitiesMap.set(assigneeId, []);
    }

    const userActivities = userActivitiesMap.get(assigneeId)!;
    
    // Check if we already have this issue for this user
    const existingIndex = userActivities.findIndex(a => a.issueId === issue.id);
    
    if (existingIndex === -1) {
      // Determine status symbol based on what happened
      const symbol = determineYesterdaySymbolImproved(activity, issue, activities, yesterdayStart, assigneeId);
      
      // Track if someone else performed the action
      const actorName = activity.userId !== assigneeId ? activity.user?.name : undefined;
      
      userActivities.push({
        issueId: issue.id,
        issueKey: issue.issueKey || '',
        title: issue.title,
        projectName: issue.project?.name || 'No Project',
        projectId: issue.projectId,
        statusSymbol: symbol,
        statusText: getStatusText(symbol),
        priority: issue.priority,
        dueDate: issue.dueDate || undefined,
        source: 'AUTO_DETECTED',
        actorName, // Show who moved it if it wasn't the assignee
      });
    }
  }

  // 🆕 Merge with manual plan entries
  const manualEntries = await prisma.planEntry.findMany({
    where: {
      date: yesterdayStart,
      source: 'MANUALLY_ADDED',
      ...(userIds && userIds.length > 0 ? { userId: { in: userIds } } : {}),
    },
    include: {
      issue: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  for (const entry of manualEntries) {
    if (!userActivitiesMap.has(entry.userId)) {
      userActivitiesMap.set(entry.userId, []);
    }

    const userActivities = userActivitiesMap.get(entry.userId)!;
    const existingIndex = userActivities.findIndex(a => a.issueId === entry.issueId);

    if (existingIndex === -1) {
      userActivities.push({
        issueId: entry.issue.id,
        issueKey: entry.issue.issueKey || '',
        title: entry.issue.title,
        projectName: entry.issue.project?.name || 'No Project',
        projectId: entry.issue.projectId,
        statusSymbol: '',
        statusText: 'Manually Added',
        priority: entry.issue.priority,
        dueDate: entry.issue.dueDate || undefined,
        source: 'MANUALLY_ADDED',
        notes: entry.notes || undefined,
      });
    }
  }

  return userActivitiesMap;
}

/**
 * 🎯 IMPROVED: Determine status symbol with better logic
 */
function determineYesterdaySymbolImproved(
  activity: any,
  issue: any,
  allActivities: any[],
  yesterdayStart: Date,
  assigneeId: string
): '✅' | '⛔️' | '⚡️' | '🔀' | '' {
  // Get all activities for this issue from yesterday by the ASSIGNEE
  const issueActivitiesByAssignee = allActivities.filter(
    a => a.itemId === issue.id && a.userId === assigneeId
  );

  // Check if completed
  if (activity.action === 'STATUS_CHANGED') {
    const newStatus = activity.newValue?.toLowerCase() || '';
    if (newStatus.includes('done') || newStatus.includes('completed') || issue.projectStatus?.isFinal) {
      return '✅'; // Completed
    }

    // Check if moved to in progress
    if (newStatus.includes('progress') || newStatus.includes('working')) {
      return '🔀'; // In Progress/Working on it
    }
  }

  // ⚡️ Unplanned work - started and completed same day
  if (issueActivitiesByAssignee.length > 0) {
    const hasCreated = issueActivitiesByAssignee.some(a => a.action === 'CREATED');
    const hasCompleted = issueActivitiesByAssignee.some(
      a => a.action === 'STATUS_CHANGED' && 
      (a.newValue?.toLowerCase().includes('done') || a.newValue?.toLowerCase().includes('completed'))
    );

    if (hasCreated && hasCompleted) {
      return '⚡️'; // Unplanned but completed
    }
  }

  // ⛔️ Could not complete - was due yesterday but not done
  if (issue.dueDate) {
    const dueDate = new Date(issue.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate.getTime() === yesterdayStart.getTime() && !issue.projectStatus?.isFinal) {
      return '⛔️'; // Could not complete
    }
  }

  // Default to working on it
  return '🔀';
}

function getStatusText(symbol: string): string {
  switch (symbol) {
    case '✅': return 'Completed';
    case '⛔️': return 'Could Not Complete';
    case '⚡️': return 'Unplanned Work';
    case '🔀': return 'In Progress';
    default: return 'Worked On';
  }
}

function calculateDaysInProgress(issueId: string): Promise<number> {
  // Implementation from original file
  return Promise.resolve(0);
}

/**
 * 🆕 Add issue to someone's plan manually
 */
export async function addToPlan(
  userId: string,
  issueId: string,
  date: Date,
  notes?: string,
  addedBy?: string
): Promise<void> {
  // Normalize date to start of day
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  await prisma.planEntry.upsert({
    where: {
      userId_issueId_date: {
        userId,
        issueId,
        date: normalizedDate,
      },
    },
    create: {
      userId,
      issueId,
      date: normalizedDate,
      source: 'MANUALLY_ADDED',
      notes,
      addedBy,
      confirmed: true,
    },
    update: {
      notes,
      source: 'MANUALLY_ADDED',
      confirmed: true,
    },
  });
}

/**
 * 🆕 Remove issue from someone's plan
 */
export async function removeFromPlan(
  userId: string,
  issueId: string,
  date: Date
): Promise<void> {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  await prisma.planEntry.deleteMany({
    where: {
      userId,
      issueId,
      date: normalizedDate,
    },
  });
}

/**
 * 🆕 Get manual plan entries for a date range
 */
export async function getManualPlanEntries(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  userIds?: string[]
): Promise<any[]> {
  return prisma.planEntry.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
      source: 'MANUALLY_ADDED',
      ...(userIds && userIds.length > 0 ? { userId: { in: userIds } } : {}),
    },
    include: {
      issue: {
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
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      addedByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}


