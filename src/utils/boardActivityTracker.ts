import { prisma } from '@/lib/prisma';

interface TrackActivityParams {
  action: string;
  itemType: string;
  itemId: string;
  userId: string;
  workspaceId: string;
  boardId?: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
}

/**
 * Track board item activity (including Daily Focus activities)
 */
export async function trackBoardActivity(params: TrackActivityParams) {
  try {
    await prisma.boardItemActivity.create({
      data: {
        action: params.action,
        itemType: params.itemType,
        itemId: params.itemId,
        userId: params.userId,
        workspaceId: params.workspaceId,
        boardId: params.boardId,
        fieldName: params.fieldName,
        oldValue: params.oldValue,
        newValue: params.newValue,
        details: params.details,
      },
    });
  } catch (error) {
    console.error('Failed to track board activity:', error);
    // Don't throw - activity tracking should not block the main operation
  }
}

/**
 * Track Daily Focus reflection status update
 */
export async function trackReflectionStatusChange(params: {
  issueId: string;
  userId: string;
  workspaceId: string;
  oldStatus?: string;
  newStatus: string;
}) {
  return trackBoardActivity({
    action: 'DAILY_FOCUS_REFLECTION',
    itemType: 'ISSUE',
    itemId: params.issueId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    fieldName: 'reflectionStatus',
    oldValue: params.oldStatus,
    newValue: params.newStatus,
    details: JSON.stringify({
      type: 'reflection',
      status: params.newStatus,
    }),
  });
}

/**
 * Track Daily Focus plan addition
 */
export async function trackPlanAddition(params: {
  issueId: string;
  userId: string;
  workspaceId: string;
  date: Date;
}) {
  return trackBoardActivity({
    action: 'DAILY_FOCUS_PLANNED',
    itemType: 'ISSUE',
    itemId: params.issueId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    details: JSON.stringify({
      type: 'plan',
      date: params.date.toISOString(),
    }),
  });
}

/**
 * Track issue status change (to be called when issue status is updated)
 */
export async function trackIssueStatusChange(params: {
  issueId: string;
  userId: string;
  workspaceId: string;
  boardId?: string;
  oldStatus: string;
  newStatus: string;
}) {
  return trackBoardActivity({
    action: 'STATUS_CHANGED',
    itemType: 'ISSUE',
    itemId: params.issueId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    boardId: params.boardId,
    fieldName: 'status',
    oldValue: params.oldStatus,
    newStatus: params.newStatus,
  });
}

/**
 * Track issue assignment
 */
export async function trackIssueAssignment(params: {
  issueId: string;
  userId: string;
  workspaceId: string;
  boardId?: string;
  oldAssigneeId?: string;
  newAssigneeId: string;
}) {
  return trackBoardActivity({
    action: 'ASSIGNED',
    itemType: 'ISSUE',
    itemId: params.issueId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    boardId: params.boardId,
    fieldName: 'assignee',
    oldValue: params.oldAssigneeId,
    newValue: params.newAssigneeId,
  });
}


