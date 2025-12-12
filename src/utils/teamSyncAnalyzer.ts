/**
 * Team Sync Analyzer Types and Utilities
 * Used by Planning View to analyze team activity over time
 */

export type MovementType = 'forward' | 'backward' | 'none' | 'completed' | 'started' | 'blocked' | 'unblocked' | 'assigned' | 'created' | 'moved_to_review';

export interface IssueActivity {
  id: string;
  issueId: string;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  userId: string;
  createdAt: Date;
  // Direct issue properties (for convenience in components)
  issueKey?: string | null;
  title?: string;
  type?: string;
  priority?: string;
  status?: string;
  statusText?: string;
  statusDisplayName?: string;
  daysInProgress?: number;
  projectName?: string;
  issue?: {
    id: string;
    title: string;
    issueKey: string | null;
    type: string;
    priority: string;
    status: string;
    statusSymbol?: string;
    assigneeId?: string | null;
  };
  user?: {
    id: string;
    name: string | null;
    image?: string | null;
  };
}

export interface IssueMovement {
  issueId: string;
  issueKey: string | null;
  title: string;
  type: string;
  priority: string;
  fromStatus: string;
  toStatus: string;
  fromStatusSymbol?: string;
  toStatusSymbol?: string;
  fromStatusDisplayName?: string;
  toStatusDisplayName?: string;
  movementType: MovementType;
  timestamp: Date;
  movedAt?: Date;
  userId: string;
  userName?: string;
  userImage?: string;
  projectId?: string;
  projectName?: string;
}

export interface DayActivity {
  date: Date;
  issuesCompleted: number;
  issuesStarted: number;
  issuesMoved: number;
  issuesCreated: number;
  movements: IssueMovement[];
  activities: IssueActivity[];
  // Additional counters used by Planning components
  completed?: IssueActivity[];
  started?: IssueActivity[];
  inProgress?: IssueActivity[];
  inReview?: IssueActivity[];
  movedToReview?: IssueActivity[];
  blocked?: IssueActivity[];
  planned?: IssueActivity[];
}

export interface TeamMemberRangeSync {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email?: string | null;
    image?: string | null;
    useCustomAvatar?: boolean;
  };
  days: Record<string, DayActivity>;
  summary: {
    totalCompleted: number;
    totalStarted: number;
    totalMoved: number;
    totalCreated: number;
    avgPerDay: number;
  };
  assignedIssues: any[];
}

export interface TeamRangeSummary {
  totalCompleted: number;
  totalStarted: number;
  totalMoved: number;
  totalCreated: number;
  avgPerMember: number;
  mostProductiveMember?: string;
  dateRange: {
    startDate: Date;
    endDate: Date;
    totalDays: number;
  };
}

export interface TeamSyncRangeData {
  members: TeamMemberRangeSync[];
  summary: TeamRangeSummary;
  dateRange: {
    startDate: Date;
    endDate: Date;
    totalDays: number;
  };
}

export interface ActivityFeedData {
  feed: IssueActivity[];
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * Determine movement type based on status change
 */
export function getMovementType(fromStatus: string, toStatus: string): MovementType {
  // Define status order (lower = earlier in workflow)
  const statusOrder: Record<string, number> = {
    'backlog': 0,
    'todo': 1,
    'in_progress': 2,
    'in_review': 3,
    'done': 4,
    'cancelled': -1,
  };

  const normalizeStatus = (status: string) => status.toLowerCase().replace(/\s+/g, '_');
  const fromOrder = statusOrder[normalizeStatus(fromStatus)] ?? 2;
  const toOrder = statusOrder[normalizeStatus(toStatus)] ?? 2;

  if (toOrder > fromOrder) return 'forward';
  if (toOrder < fromOrder) return 'backward';
  return 'none';
}

/**
 * Group activities by date
 */
export function groupActivitiesByDate(activities: IssueActivity[]): Record<string, IssueActivity[]> {
  const groups: Record<string, IssueActivity[]> = {};

  for (const activity of activities) {
    const dateKey = new Date(activity.createdAt).toISOString().split('T')[0];
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(activity);
  }

  return groups;
}

/**
 * Calculate day activity from activities
 */
export function calculateDayActivity(activities: IssueActivity[], date: Date): DayActivity {
  const movements: IssueMovement[] = [];
  let issuesCompleted = 0;
  let issuesStarted = 0;
  let issuesMoved = 0;
  let issuesCreated = 0;

  for (const activity of activities) {
    if (activity.action === 'CREATED') {
      issuesCreated++;
    } else if (activity.action === 'STATUS_CHANGED' && activity.fieldName === 'status') {
      issuesMoved++;

      const movementType = getMovementType(activity.oldValue || '', activity.newValue || '');

      if (activity.newValue?.toLowerCase().includes('done')) {
        issuesCompleted++;
      }
      if (activity.newValue?.toLowerCase().includes('progress')) {
        issuesStarted++;
      }

      if (activity.issue) {
        movements.push({
          issueId: activity.issue.id,
          issueKey: activity.issue.issueKey,
          title: activity.issue.title,
          type: activity.issue.type,
          priority: activity.issue.priority,
          fromStatus: activity.oldValue || '',
          toStatus: activity.newValue || '',
          movementType,
          timestamp: new Date(activity.createdAt),
          userId: activity.userId,
        });
      }
    }
  }

  return {
    date,
    issuesCompleted,
    issuesStarted,
    issuesMoved,
    issuesCreated,
    movements,
    activities,
  };
}
