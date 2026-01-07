/**
 * Team Sync Analyzer Types and Utilities
 * Used by Planning View to analyze team activity over time
 */

export type MovementType = 'forward' | 'backward' | 'none' | 'completed' | 'started' | 'blocked' | 'unblocked' | 'assigned' | 'created' | 'moved_to_review';

export type StatusCategory = 'completed' | 'in_progress' | 'in_review' | 'planned' | 'blocked' | 'backlog';

export interface PlannedIssue {
  id: string;
  issueKey: string | null;
  title: string;
  type: string;
  priority: string;
  status: string;
  statusDisplayName?: string;
  assigneeId: string | null;
  dueDate?: Date | null;
  createdAt: Date;
  projectId: string;
  projectName?: string;
  daysInStatus?: number;
  isCarryOver?: boolean;
  carryOverFromDate?: string;
}

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
  isCarryOver?: boolean;
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
  // Categorized issue lists - using IssueActivity for frontend compatibility
  completed: IssueActivity[];
  started: IssueActivity[];
  inProgress: IssueActivity[];
  inReview: IssueActivity[];
  movedToReview: IssueActivity[];
  blocked: IssueActivity[];
  planned: IssueActivity[];
  carryOver: IssueActivity[];
}

export interface MemberSummary {
  totalCompleted: number;
  totalStarted: number;
  totalMoved: number;
  totalCreated: number;
  totalInProgress: number;
  totalInReview: number;
  totalPlanned: number;
  totalBlocked: number;
  totalCarryOver: number;
  avgPerDay: number;
  completionRate: number;
  currentWorkload: number;
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
  summary: MemberSummary;
  assignedIssues: PlannedIssue[];
  currentInProgress: IssueActivity[];
  currentInReview: IssueActivity[];
  currentBlocked: IssueActivity[];
  currentPlanned: IssueActivity[];
  // Legacy fields for backwards compatibility
  insights?: {
    warnings: string[];
    tasksInProgress?: number;
    tasksCompletedToday?: number;
  };
  userName?: string;
  userImage?: string;
}

export interface TeamRangeSummary {
  totalCompleted: number;
  totalStarted: number;
  totalMoved: number;
  totalCreated: number;
  totalInProgress: number;
  totalInReview: number;
  totalPlanned: number;
  totalBlocked: number;
  totalCarryOver: number;
  avgPerMember: number;
  teamCompletionRate: number;
  mostActiveDay?: string;
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
 * Classify a status string into a category
 */
export function classifyStatus(status: string | null | undefined): StatusCategory {
  const s = status?.toLowerCase() || '';

  if (s.includes('done') || s.includes('complete') || s.includes('closed')) {
    return 'completed';
  }
  if (s.includes('review') || s.includes('test') || s.includes('deploy') || s.includes('qa')) {
    return 'in_review';
  }
  if (s.includes('progress') || s.includes('working') || s.includes('development') || s.includes('doing')) {
    return 'in_progress';
  }
  if (s.includes('blocked') || s.includes('waiting') || s.includes('pending') || s.includes('on hold')) {
    return 'blocked';
  }
  if (s.includes('backlog') || s.includes('icebox') || s.includes('won\'t') || s.includes('wont')) {
    return 'backlog';
  }
  // Default: todo, open, new, etc. are considered planned
  return 'planned';
}

/**
 * Check if status is a "todo" status (not backlog, not won't fix)
 */
export function isTodoStatus(status: string | null | undefined): boolean {
  const category = classifyStatus(status);
  return category === 'planned';
}

/**
 * Determine movement type based on status change
 */
export function getMovementType(fromStatus: string, toStatus: string): MovementType {
  const fromCategory = classifyStatus(fromStatus);
  const toCategory = classifyStatus(toStatus);

  if (toCategory === 'completed') return 'completed';
  if (toCategory === 'blocked') return 'blocked';
  if (toCategory === 'in_review') return 'moved_to_review';
  if (toCategory === 'in_progress' && fromCategory !== 'in_progress') return 'started';
  if (fromCategory === 'blocked' && toCategory !== 'blocked') return 'unblocked';

  // Fallback to order-based detection
  const statusOrder: Record<string, number> = {
    'backlog': 0,
    'planned': 1,
    'in_progress': 2,
    'in_review': 3,
    'completed': 4,
    'blocked': -1,
  };

  const fromOrder = statusOrder[fromCategory] ?? 2;
  const toOrder = statusOrder[toCategory] ?? 2;

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
 * Create empty day activity structure
 */
export function createEmptyDayActivity(date: Date): DayActivity {
  return {
    date,
    issuesCompleted: 0,
    issuesStarted: 0,
    issuesMoved: 0,
    issuesCreated: 0,
    movements: [],
    activities: [],
    completed: [],
    started: [],
    inProgress: [],
    inReview: [],
    movedToReview: [],
    blocked: [],
    planned: [],
    carryOver: [],
  };
}

/**
 * Create empty member summary
 */
export function createEmptyMemberSummary(): MemberSummary {
  return {
    totalCompleted: 0,
    totalStarted: 0,
    totalMoved: 0,
    totalCreated: 0,
    totalInProgress: 0,
    totalInReview: 0,
    totalPlanned: 0,
    totalBlocked: 0,
    totalCarryOver: 0,
    avgPerDay: 0,
    completionRate: 0,
    currentWorkload: 0,
  };
}

/**
 * Calculate day activity from activities
 */
export function calculateDayActivity(activities: IssueActivity[], date: Date): DayActivity {
  const dayActivity = createEmptyDayActivity(date);

  for (const activity of activities) {
    if (activity.action === 'CREATED') {
      dayActivity.issuesCreated++;
    } else if (activity.action === 'STATUS_CHANGED' && activity.fieldName === 'status') {
      dayActivity.issuesMoved++;

      const movementType = getMovementType(activity.oldValue || '', activity.newValue || '');

      if (activity.newValue?.toLowerCase().includes('done')) {
        dayActivity.issuesCompleted++;
      }
      if (activity.newValue?.toLowerCase().includes('progress')) {
        dayActivity.issuesStarted++;
      }

      if (activity.issue) {
        dayActivity.movements.push({
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

  dayActivity.activities = activities;
  return dayActivity;
}

/**
 * Calculate completion rate
 */
export function calculateCompletionRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Find most active day from member data
 */
export function findMostActiveDay(members: TeamMemberRangeSync[]): string | undefined {
  const dayTotals: Record<string, number> = {};

  for (const member of members) {
    for (const [dateKey, day] of Object.entries(member.days)) {
      if (!dayTotals[dateKey]) {
        dayTotals[dateKey] = 0;
      }
      dayTotals[dateKey] += day.issuesCompleted + day.issuesStarted + day.issuesMoved;
    }
  }

  let mostActiveDay: string | undefined;
  let maxActivity = 0;

  for (const [dateKey, total] of Object.entries(dayTotals)) {
    if (total > maxActivity) {
      maxActivity = total;
      mostActiveDay = dateKey;
    }
  }

  return mostActiveDay;
}

/**
 * Find most productive member
 */
export function findMostProductiveMember(members: TeamMemberRangeSync[]): string | undefined {
  let mostProductiveMember: string | undefined;
  let maxCompleted = 0;

  for (const member of members) {
    if (member.summary.totalCompleted > maxCompleted) {
      maxCompleted = member.summary.totalCompleted;
      mostProductiveMember = member.user.name || member.userId;
    }
  }

  return mostProductiveMember;
}
