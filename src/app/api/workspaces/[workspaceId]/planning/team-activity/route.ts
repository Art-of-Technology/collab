import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { format, parseISO, startOfDay, endOfDay, eachDayOfInterval, isBefore, isAfter, isSameDay, differenceInDays } from 'date-fns';
import type {
  TeamActivityResponse,
  MemberActivity,
  DayActivity,
  SimpleIssue,
  CompletedIssue,
  BlockedIssue,
  MemberSummary,
  TeamSummary,
  MemberCurrentState,
} from '@/components/planning/types';

// =============================================================================
// Status Classification
// =============================================================================

type StatusCategory = 'completed' | 'in_progress' | 'in_review' | 'blocked' | 'planned' | 'backlog';

function classifyStatus(status: string | null | undefined): StatusCategory {
  // Normalize: lowercase and replace curly apostrophes/quotes with straight ones
  const s = (status?.toLowerCase() || '')
    .replace(/[\u2018\u2019\u201B\u0060]/g, "'"); // Replace curly quotes and backticks with straight apostrophe

  // Check for completion/closed states first (including canceled, deprecated, etc.)
  if (
    s.includes('done') ||
    s.includes('complete') ||
    s.includes('closed') ||
    s.includes('resolved') ||
    s.includes('cancel') ||      // canceled, cancelled
    s.includes('deprecate') ||   // deprecated
    s.includes('wont') ||        // wontfix
    s.includes("won't") ||       // won't fix
    s.includes('won_t') ||       // won_t_fix (underscore variant)
    s.includes('duplicate') ||
    s.includes('invalid') ||
    s.includes('archived') ||
    s.includes('reject')         // rejected
  ) {
    return 'completed';
  }

  // Check for review/testing states
  if (s.includes('review') || s.includes('test') || s.includes('qa') || s.includes('deploy') || s.includes('staging')) {
    return 'in_review';
  }

  // Check for in progress states
  if (s.includes('progress') || s.includes('working') || s.includes('doing') || s.includes('development') || s.includes('active')) {
    return 'in_progress';
  }

  // Check for blocked states
  if (s.includes('blocked') || s.includes('waiting') || s.includes('on hold') || s.includes('pending')) {
    return 'blocked';
  }

  // Check for backlog
  if (s.includes('backlog') || s.includes('icebox') || s.includes('later')) {
    return 'backlog';
  }

  // Default to planned (todo, open, new, prioritized, etc.)
  return 'planned';
}

// =============================================================================
// Issue Info with Status
// =============================================================================

interface IssueInfo {
  id: string;
  issueKey: string | null;
  title: string;
  priority: string;
  type: string;
  project?: { name: string } | null;
  assigneeId: string | null;
  createdAt: Date;
  blockedBy?: string;
  currentStatusLabel: string;      // Actual status name
  currentStatusCategory: StatusCategory;
  isFinalStatus: boolean;          // Whether it's a terminal state
  // Initial status (inferred from first status change)
  initialStatusLabel?: string;
  initialStatusCategory?: StatusCategory;
  // When did the issue enter its current status?
  currentStatusSince: Date;
}

// =============================================================================
// Status Change Tracking
// =============================================================================

interface StatusChange {
  issueId: string;
  date: Date;
  fromStatus: string;              // Actual status name
  toStatus: string;                // Actual status name
  fromCategory: StatusCategory;
  toCategory: StatusCategory;
}

// =============================================================================
// Issue Conversion
// =============================================================================

function toSimpleIssue(
  issue: IssueInfo,
  statusLabel?: string,
  statusCategory?: StatusCategory,
  daysActive?: number
): SimpleIssue {
  // Map backlog to planned for UI purposes
  const uiCategory = statusCategory === 'backlog' ? 'planned' : statusCategory;
  const currentUiCategory = issue.currentStatusCategory === 'backlog' ? 'planned' : issue.currentStatusCategory;

  return {
    id: issue.id,
    key: issue.issueKey || issue.id.slice(0, 8),
    title: issue.title,
    priority: (issue.priority || 'MEDIUM') as SimpleIssue['priority'],
    type: issue.type,
    projectName: issue.project?.name,
    statusLabel: statusLabel || issue.currentStatusLabel,
    statusCategory: (uiCategory || currentUiCategory) as SimpleIssue['statusCategory'],
    daysActive,
  };
}

// =============================================================================
// Historical State Reconstruction
// =============================================================================

interface IssueStateOnDate {
  category: StatusCategory;
  label: string;
}

function getIssueStateOnDate(
  issueId: string,
  targetDate: Date,
  statusChanges: StatusChange[],
  issueCreatedAt: Date,
  currentStatusLabel: string,
  currentStatusCategory: StatusCategory,
  initialStatusLabel?: string,  // Status when issue was created (from first change's fromStatus)
  initialStatusCategory?: StatusCategory
): IssueStateOnDate | null {
  const targetDayEnd = endOfDay(targetDate);

  // If issue was created after target date, it didn't exist
  if (isAfter(startOfDay(issueCreatedAt), targetDayEnd)) {
    return null;
  }

  // Get all status changes for this issue, sorted by date ascending
  const issueChanges = statusChanges
    .filter(sc => sc.issueId === issueId)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Determine the initial state (when issue was first created)
  // For MCP-created issues, we infer this from the first status change's "from" value
  let inferredInitialLabel = initialStatusLabel || 'Planned';
  let inferredInitialCategory: StatusCategory = initialStatusCategory || 'planned';

  if (issueChanges.length > 0) {
    // Use the first change's "from" status as the initial state
    inferredInitialLabel = issueChanges[0].fromStatus || 'Planned';
    inferredInitialCategory = issueChanges[0].fromCategory || 'planned';
  }

  // If no changes at all, use current state (issue never changed status)
  if (issueChanges.length === 0) {
    // If current state is completed, treat it as completed (don't show in work state)
    // This handles MCP-created issues that were set to "Done" without activity history
    if (currentStatusCategory === 'completed') {
      return { category: 'completed', label: currentStatusLabel };
    }
    // Otherwise use current state (issue never changed status)
    return { category: currentStatusCategory, label: currentStatusLabel };
  }

  // Check if all changes are AFTER the target date
  // This means on the target date, the issue was in its initial state
  if (isAfter(issueChanges[0].date, targetDayEnd)) {
    return {
      category: inferredInitialCategory,
      label: inferredInitialLabel
    };
  }

  // Replay status changes to find state on target date
  let stateLabel = inferredInitialLabel;
  let stateCategory: StatusCategory = inferredInitialCategory;

  for (const change of issueChanges) {
    // If this change happened on or before the target date, apply it
    if (isBefore(change.date, targetDayEnd) || isSameDay(change.date, targetDate)) {
      stateLabel = change.toStatus;
      stateCategory = change.toCategory;
    } else {
      // This change is after target date, stop here
      break;
    }
  }

  return { category: stateCategory, label: stateLabel };
}

// =============================================================================
// Main API Handler
// =============================================================================

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

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: session.user.id, workspaceId },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const projectIdsStr = searchParams.get('projectIds');
    const userIdsStr = searchParams.get('userIds');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
    }

    const startDate = startOfDay(parseISO(startDateStr));
    const endDate = endOfDay(parseISO(endDateStr));
    const projectIds = projectIdsStr?.split(',').filter(Boolean);
    const userIds = userIdsStr?.split(',').filter(Boolean);
    const today = format(new Date(), 'yyyy-MM-dd');

    // Get all days in range
    const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });

    // =========================================================================
    // Fetch Data
    // =========================================================================

    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        ...(userIds?.length ? { userId: { in: userIds } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    const memberUserIds = workspaceMembers.map(m => m.userId);

    // Get ALL issues ever assigned to these members (for historical reconstruction)
    // Filter out issues from archived projects
    const allIssues = await prisma.issue.findMany({
      where: {
        workspaceId,
        assigneeId: { in: memberUserIds },
        ...(projectIds?.length ? { projectId: { in: projectIds } } : {}),
        // Only include issues from active projects (isArchived is null or false)
        OR: [
          { project: { isArchived: null } },
          { project: { isArchived: false } },
        ],
      },
      select: {
        id: true,
        issueKey: true,
        title: true,
        priority: true,
        type: true,
        status: true,
        statusId: true,
        assigneeId: true,
        createdAt: true,
        project: { select: { id: true, name: true, isArchived: true } },
        projectStatus: { select: { id: true, name: true, displayName: true, isFinal: true } },
        targetRelations: {
          where: { relationType: 'BLOCKED_BY' },
          select: { sourceIssue: { select: { issueKey: true } } },
        },
      },
    });

    // Get all project statuses to properly identify completed states
    const allProjectStatuses = await prisma.projectStatus.findMany({
      where: {
        projectId: { in: [...new Set(allIssues.map(i => i.project.id))] },
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        isFinal: true,
        projectId: true,
      },
    });

    // Create a map of status name -> isFinal for quick lookup
    const finalStatusNames = new Set<string>();
    for (const status of allProjectStatuses) {
      if (status.isFinal) {
        finalStatusNames.add(status.name.toLowerCase());
        finalStatusNames.add(status.displayName.toLowerCase());
      }
    }

    // Get ALL status changes for these issues (need full history)
    const allStatusChanges = await prisma.issueActivity.findMany({
      where: {
        workspaceId,
        action: 'STATUS_CHANGED',
        itemId: { in: allIssues.map(i => i.id) },
      },
      select: {
        id: true,
        itemId: true,
        userId: true,
        fieldName: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Helper function to classify status with isFinal check AND keyword check
    function classifyStatusWithFinal(status: string | null | undefined): StatusCategory {
      if (!status) return 'planned';

      // Normalize: lowercase and replace curly apostrophes with straight ones
      const s = status.toLowerCase().replace(/[\u2018\u2019\u201B\u0060]/g, "'");

      // Check if this is a known final status (from ProjectStatus.isFinal)
      if (finalStatusNames.has(s)) {
        return 'completed';
      }

      // Check for closed/completed keywords directly (in case project statuses aren't configured)
      if (
        s.includes('done') ||
        s.includes('complete') ||
        s.includes('closed') ||
        s.includes('resolved') ||
        s.includes('cancel') ||
        s.includes('deprecate') ||
        s.includes('wont') ||
        s.includes("won't") ||
        s.includes('won_t') ||       // won_t_fix (underscore variant)
        s.includes('duplicate') ||
        s.includes('invalid') ||
        s.includes('archived') ||
        s.includes('reject')
      ) {
        return 'completed';
      }

      // Fall back to string-based classification for other statuses
      return classifyStatus(status);
    }

    // Convert to StatusChange objects with actual status names
    const statusChanges: StatusChange[] = allStatusChanges.map(sc => ({
      issueId: sc.itemId,
      date: sc.createdAt,
      fromStatus: sc.oldValue || 'Unknown',
      toStatus: sc.newValue || 'Unknown',
      fromCategory: classifyStatusWithFinal(sc.oldValue),
      toCategory: classifyStatusWithFinal(sc.newValue),
    }));

    // Create issue info map with initial status inference
    const issueInfoMap = new Map<string, IssueInfo>();

    // First, find the initial status for each issue from their first status change
    const issueFirstChangeMap = new Map<string, StatusChange>();
    // Also track the most recent status change for each issue (to calculate daysActive)
    const issueLastChangeMap = new Map<string, StatusChange>();
    for (const change of statusChanges) {
      if (!issueFirstChangeMap.has(change.issueId)) {
        issueFirstChangeMap.set(change.issueId, change);
      }
      // Always update to get the most recent change
      issueLastChangeMap.set(change.issueId, change);
    }

    for (const issue of allIssues) {
      // Skip issues without a valid project (orphaned data)
      if (!issue.project?.id) continue;

      // Skip issues without any status (incomplete/orphaned data)
      if (!issue.projectStatus && !issue.status) continue;

      const statusLabel = issue.projectStatus?.displayName || issue.projectStatus?.name || issue.status || 'Unknown';
      const isFinal = issue.projectStatus?.isFinal || false;

      // Check for completed: isFinal flag OR keyword match
      const statusName = issue.projectStatus?.name || issue.status || '';
      const isCompleted = isFinal || classifyStatusWithFinal(statusName) === 'completed';

      // Use isFinal/completed check first, then fall back to classification
      let statusCategory: StatusCategory;
      if (isCompleted) {
        statusCategory = 'completed';
      } else {
        statusCategory = classifyStatusWithFinal(statusName);
      }

      const isBlocked = issue.targetRelations.length > 0;

      // Get initial status from first status change (for MCP-created issues)
      const firstChange = issueFirstChangeMap.get(issue.id);
      const initialStatusLabel = firstChange?.fromStatus;
      const initialStatusCategory = firstChange?.fromCategory;

      // Get when the issue entered its current status
      // Use the most recent status change date, or fall back to issue creation date
      const lastChange = issueLastChangeMap.get(issue.id);
      const currentStatusSince = lastChange?.date || issue.createdAt;

      issueInfoMap.set(issue.id, {
        id: issue.id,
        issueKey: issue.issueKey,
        title: issue.title,
        priority: issue.priority,
        type: issue.type,
        project: issue.project,
        assigneeId: issue.assigneeId,
        createdAt: issue.createdAt,
        blockedBy: issue.targetRelations[0]?.sourceIssue?.issueKey ?? undefined,
        currentStatusLabel: statusLabel,
        currentStatusCategory: isBlocked && statusCategory !== 'completed' ? 'blocked' : statusCategory,
        isFinalStatus: isFinal,
        initialStatusLabel,
        initialStatusCategory,
        currentStatusSince,
      });
    }

    // =========================================================================
    // Process Members
    // =========================================================================

    const members: MemberActivity[] = [];
    let totalCompleted = 0;
    let totalCompletedToday = 0;
    let totalInReview = 0;
    let totalInProgress = 0;
    let totalBlocked = 0;

    for (const member of workspaceMembers) {
      const userId = member.userId;
      const user = member.user;

      // Get issues assigned to this member
      const memberIssues = allIssues.filter(i => i.assigneeId === userId);
      const memberIssueIds = new Set(memberIssues.map(i => i.id));

      // Build day-by-day activity and snapshots
      const days: Record<string, DayActivity> = {};

      for (const day of daysInRange) {
        const dayKey = format(day, 'yyyy-MM-dd');
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        // =====================================================================
        // Compute state snapshot for this day
        // =====================================================================
        const snapshot: MemberCurrentState = {
          inProgress: [],
          inReview: [],
          blocked: [],
          planned: [],
        };

        for (const issue of memberIssues) {
          const issueInfo = issueInfoMap.get(issue.id);
          if (!issueInfo) continue;

          const stateOnDay = getIssueStateOnDate(
            issue.id,
            day,
            statusChanges,
            issue.createdAt,
            issueInfo.currentStatusLabel,
            issueInfo.currentStatusCategory,
            issueInfo.initialStatusLabel,
            issueInfo.initialStatusCategory
          );

          // Skip if issue didn't exist or was completed/backlog on that day
          if (!stateOnDay || stateOnDay.category === 'completed' || stateOnDay.category === 'backlog') {
            continue;
          }

          // Check if blocked (use current blocked relations for simplicity)
          const isBlocked = !!issueInfo.blockedBy;
          const simpleIssue = toSimpleIssue(issueInfo, stateOnDay.label, stateOnDay.category);

          if (isBlocked || stateOnDay.category === 'blocked') {
            snapshot.blocked.push({
              ...simpleIssue,
              blockedBy: issueInfo.blockedBy,
            } as BlockedIssue);
          } else if (stateOnDay.category === 'in_review') {
            snapshot.inReview.push(simpleIssue);
          } else if (stateOnDay.category === 'in_progress') {
            snapshot.inProgress.push(simpleIssue);
          } else if (stateOnDay.category === 'planned') {
            snapshot.planned.push(simpleIssue);
          }
        }

        // =====================================================================
        // Compute activity for this day (what changed ON this specific day)
        // =====================================================================
        const dayChanges = statusChanges.filter(sc =>
          memberIssueIds.has(sc.issueId) &&
          sc.date >= dayStart &&
          sc.date <= dayEnd
        );

        const completed: CompletedIssue[] = [];
        const started: SimpleIssue[] = [];
        const movedToReview: SimpleIssue[] = [];

        // Track which issues we've already processed for each category
        const completedIds = new Set<string>();
        const startedIds = new Set<string>();
        const reviewIds = new Set<string>();

        for (const change of dayChanges) {
          const issueInfo = issueInfoMap.get(change.issueId);
          if (!issueInfo) continue;

          // Completed: status changed TO completed
          if (change.toCategory === 'completed' && !completedIds.has(change.issueId)) {
            completedIds.add(change.issueId);
            completed.push({
              ...toSimpleIssue(issueInfo, change.toStatus, 'completed'),
              completedAt: change.date.toISOString(),
            });
          }

          // Started: status changed TO in_progress from non-in_progress
          if (change.toCategory === 'in_progress' &&
              change.fromCategory !== 'in_progress' &&
              !startedIds.has(change.issueId)) {
            startedIds.add(change.issueId);
            started.push(toSimpleIssue(issueInfo, change.toStatus, 'in_progress'));
          }

          // Moved to Review: status changed TO in_review from non-in_review
          if (change.toCategory === 'in_review' &&
              change.fromCategory !== 'in_review' &&
              !reviewIds.has(change.issueId)) {
            reviewIds.add(change.issueId);
            movedToReview.push(toSimpleIssue(issueInfo, change.toStatus, 'in_review'));
          }
        }

        days[dayKey] = {
          date: dayKey,
          completed,
          started,
          movedToReview,
          snapshot,
        };
      }

      // =====================================================================
      // Current state (as of now - real-time)
      // =====================================================================
      const current: MemberCurrentState = {
        inProgress: [],
        inReview: [],
        blocked: [],
        planned: [],
      };

      const now = new Date();

      for (const issue of memberIssues) {
        const issueInfo = issueInfoMap.get(issue.id);
        if (!issueInfo) continue;

        // Skip completed and backlog
        if (issueInfo.currentStatusCategory === 'completed' ||
            issueInfo.currentStatusCategory === 'backlog' ||
            issueInfo.isFinalStatus) {
          continue;
        }

        // Calculate days in current status
        const daysActive = differenceInDays(now, issueInfo.currentStatusSince);

        const simpleIssue = toSimpleIssue(
          issueInfo,
          issueInfo.currentStatusLabel,
          issueInfo.currentStatusCategory,
          daysActive
        );

        if (issueInfo.currentStatusCategory === 'blocked' || issueInfo.blockedBy) {
          current.blocked.push({
            ...simpleIssue,
            blockedBy: issueInfo.blockedBy,
          } as BlockedIssue);
        } else if (issueInfo.currentStatusCategory === 'in_review') {
          current.inReview.push(simpleIssue);
        } else if (issueInfo.currentStatusCategory === 'in_progress') {
          current.inProgress.push(simpleIssue);
        } else if (issueInfo.currentStatusCategory === 'planned') {
          current.planned.push(simpleIssue);
        }
      }

      // Calculate summary
      const completedCount = Object.values(days).reduce((sum, d) => sum + d.completed.length, 0);
      const completedTodayCount = days[today]?.completed.length || 0;

      const summary: MemberSummary = {
        completed: completedCount,
        inReview: current.inReview.length,
        inProgress: current.inProgress.length,
        blocked: current.blocked.length,
        planned: current.planned.length,
        workload: current.inProgress.length + current.inReview.length + current.blocked.length,
      };

      // Warnings
      const warnings: string[] = [];
      if (summary.workload >= 7) {
        warnings.push(`${summary.workload} tasks active`);
      }

      // Today highlight
      let todayHighlight: string | undefined;
      const todayActivity = days[today];
      if (todayActivity?.completed.length) {
        todayHighlight = `Completed "${todayActivity.completed[0].title}"`;
      } else if (current.inProgress.length) {
        todayHighlight = `Working on "${current.inProgress[0].title}"`;
      }

      members.push({
        user: {
          id: user.id,
          name: user.name || 'Unknown',
          image: user.image,
        },
        summary,
        days,
        current,
        todayHighlight,
        hasBlockers: current.blocked.length > 0,
        warnings,
      });

      totalCompleted += completedCount;
      totalCompletedToday += completedTodayCount;
      totalInReview += current.inReview.length;
      totalInProgress += current.inProgress.length;
      totalBlocked += current.blocked.length;
    }

    members.sort((a, b) => {
      if (b.summary.workload !== a.summary.workload) {
        return b.summary.workload - a.summary.workload;
      }
      return a.user.name.localeCompare(b.user.name);
    });

    const response: TeamActivityResponse = {
      period: {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
      },
      summary: {
        completed: totalCompleted,
        completedToday: totalCompletedToday,
        inReview: totalInReview,
        inProgress: totalInProgress,
        blocked: totalBlocked,
      },
      members,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching team activity:', error);
    return NextResponse.json({ error: 'Failed to fetch team activity' }, { status: 500 });
  }
}
