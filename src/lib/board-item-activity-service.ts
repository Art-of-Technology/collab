import { prisma } from '@/lib/prisma';

export type BoardItemType = 'TASK' | 'MILESTONE' | 'EPIC' | 'STORY';
export type ActivityAction = 
  | 'CREATED' 
  | 'UPDATED' 
  | 'MOVED' 
  | 'ASSIGNED' 
  | 'UNASSIGNED'
  | 'STATUS_CHANGED' 
  | 'PRIORITY_CHANGED'
  | 'COLUMN_CHANGED'
  | 'DUE_DATE_SET'
  | 'DUE_DATE_CHANGED'
  | 'DUE_DATE_REMOVED'
  | 'DESCRIPTION_UPDATED'
  | 'TITLE_UPDATED'
  | 'REPORTER_CHANGED'
  | 'LABELS_CHANGED'
  | 'STORY_POINTS_CHANGED'
  | 'TYPE_CHANGED'
  | 'PARENT_CHANGED'
  | 'EPIC_CHANGED'
  | 'MILESTONE_CHANGED'
  | 'STORY_CHANGED'
  | 'COLOR_CHANGED'
  // Legacy task activities for backward compatibility
  | 'TASK_PLAY_STARTED'
  | 'TASK_PLAY_STOPPED'
  | 'TASK_PLAY_PAUSED'
  | 'TIME_ADJUSTED'
  | 'SESSION_EDITED'
  | 'HELP_REQUEST_SENT'
  | 'HELP_REQUEST_APPROVED'
  | 'HELP_REQUEST_REJECTED';

interface ActivityOptions {
  itemType: BoardItemType;
  itemId: string;
  action: ActivityAction;
  userId: string;
  workspaceId: string;
  boardId?: string;
  details?: any;
  fieldName?: string;
  oldValue?: any;
  newValue?: any;
}

interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
  displayOldValue?: string;
  displayNewValue?: string;
}

/**
 * Create a single activity record
 */
export async function createActivity(options: ActivityOptions) {
  const {
    itemType,
    itemId,
    action,
    userId,
    workspaceId,
    boardId,
    details,
    fieldName,
    oldValue,
    newValue
  } = options;

  return await prisma.boardItemActivity.create({
    data: {
      itemType,
      itemId,
      action,
      userId,
      workspaceId,
      boardId,
      details: details ? JSON.stringify(details) : null,
      fieldName,
      oldValue: oldValue !== undefined ? JSON.stringify(oldValue) : null,
      newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
    },
  });
}

/**
 * Track creation of a new board item
 */
export async function trackCreation(
  itemType: BoardItemType,
  itemId: string,
  userId: string,
  workspaceId: string,
  boardId?: string,
  itemData?: any
) {
  return await createActivity({
    itemType,
    itemId,
    action: 'CREATED',
    userId,
    workspaceId,
    boardId,
    details: sanitizeItemData(itemData),
  });
}

/**
 * Track field changes for a board item
 */
export async function trackFieldChanges(
  itemType: BoardItemType,
  itemId: string,
  userId: string,
  workspaceId: string,
  changes: FieldChange[],
  boardId?: string
) {
  const activities = [];
  
  for (const change of changes) {
    const activity = await createActivity({
      itemType,
      itemId,
      action: getActionForField(change.field),
      userId,
      workspaceId,
      boardId,
      details: {
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        displayOldValue: change.displayOldValue,
        displayNewValue: change.displayNewValue,
      },
      fieldName: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
    activities.push(activity);
  }
  
  return activities;
}

/**
 * Track item move between columns
 */
export async function trackMove(
  itemType: BoardItemType,
  itemId: string,
  userId: string,
  workspaceId: string,
  fromColumn: { id: string; name: string } | null,
  toColumn: { id: string; name: string },
  boardId?: string
) {
  return await createActivity({
    itemType,
    itemId,
    action: 'MOVED',
    userId,
    workspaceId,
    boardId,
    details: {
      fromColumn,
      toColumn,
      movedAt: new Date().toISOString(),
    },
  });
}

/**
 * Track assignment changes
 */
export async function trackAssignment(
  itemType: BoardItemType,
  itemId: string,
  userId: string,
  workspaceId: string,
  oldAssignee: { id: string; name: string } | null,
  newAssignee: { id: string; name: string } | null,
  boardId?: string
) {
  const action = newAssignee ? 'ASSIGNED' : 'UNASSIGNED';
  
  return await createActivity({
    itemType,
    itemId,
    action,
    userId,
    workspaceId,
    boardId,
    details: {
      oldAssignee,
      newAssignee,
      assignedAt: new Date().toISOString(),
    },
    fieldName: 'assigneeId',
    oldValue: oldAssignee?.id || null,
    newValue: newAssignee?.id || null,
  });
}

/**
 * Get activities for a specific board item
 */
export async function getItemActivities(
  itemType: BoardItemType,
  itemId: string,
  limit: number = 50
) {
  const activities = await prisma.boardItemActivity.findMany({
    where: {
      itemType,
      itemId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  // Parse JSON details for backward compatibility
  return activities.map(activity => ({
    ...activity,
    details: activity.details ? (
      typeof activity.details === 'string' ? 
        JSON.parse(activity.details) : 
        activity.details
    ) : null,
  }));
}

/**
 * Get activities for a workspace
 */
export async function getWorkspaceActivities(
  workspaceId: string,
  limit: number = 100,
  itemTypes?: BoardItemType[]
) {
  return await prisma.boardItemActivity.findMany({
    where: {
      workspaceId,
      ...(itemTypes && { itemType: { in: itemTypes } }),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
}

/**
 * Get activities for a board
 */
export async function getBoardActivities(
  boardId: string,
  limit: number = 100,
  itemTypes?: BoardItemType[]
) {
  return await prisma.boardItemActivity.findMany({
    where: {
      boardId,
      ...(itemTypes && { itemType: { in: itemTypes } }),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
}

/**
 * Legacy support: Create task activity for backward compatibility
 */
export async function createTaskActivity(
  taskId: string,
  userId: string,
  action: string,
  details?: any,
  workspaceId?: string,
  boardId?: string
) {
  // If workspaceId is not provided, get it from the task
  if (!workspaceId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { workspaceId: true, taskBoardId: true },
    });
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    workspaceId = task.workspaceId;
    boardId = boardId || task.taskBoardId || undefined;
  }

  return await createActivity({
    itemType: 'TASK',
    itemId: taskId,
    action: action as ActivityAction,
    userId,
    workspaceId,
    boardId,
    details,
  });
}

/**
 * Helper: Compare objects and return changes
 */
export function compareObjects(oldObj: any, newObj: any, fieldsToTrack: string[]): FieldChange[] {
  const changes: FieldChange[] = [];
  
  for (const field of fieldsToTrack) {
    const oldValue = oldObj[field];
    const newValue = newObj[field];
    
    if (hasChanged(oldValue, newValue)) {
      changes.push({
        field,
        oldValue,
        newValue,
        displayOldValue: getDisplayValue(field, oldValue),
        displayNewValue: getDisplayValue(field, newValue),
      });
    }
  }
  
  return changes;
}

/**
 * Helper: Check if values have changed
 */
function hasChanged(oldValue: any, newValue: any): boolean {
  // Handle null/undefined cases
  if (oldValue === null && newValue === null) return false;
  if (oldValue === undefined && newValue === undefined) return false;
  if (oldValue === null && newValue === undefined) return false;
  if (oldValue === undefined && newValue === null) return false;
  
  // Handle dates
  if (oldValue instanceof Date && newValue instanceof Date) {
    return oldValue.getTime() !== newValue.getTime();
  }
  
  // Handle arrays
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    return JSON.stringify(oldValue.sort()) !== JSON.stringify(newValue.sort());
  }
  
  // Handle objects
  if (typeof oldValue === 'object' && typeof newValue === 'object') {
    return JSON.stringify(oldValue) !== JSON.stringify(newValue);
  }
  
  // Simple comparison
  return oldValue !== newValue;
}

/**
 * Helper: Get display value for field
 */
function getDisplayValue(field: string, value: any): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  
  if (typeof value === 'object') {
    return value.name || value.title || JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * Helper: Get appropriate action for field name
 */
function getActionForField(fieldName: string): ActivityAction {
  const fieldActionMap: Record<string, ActivityAction> = {
    'title': 'TITLE_UPDATED',
    'description': 'DESCRIPTION_UPDATED',
    'assignee': 'ASSIGNED',
    'assigneeId': 'ASSIGNED',
    'reporter': 'REPORTER_CHANGED',
    'reporterId': 'REPORTER_CHANGED',
    'status': 'STATUS_CHANGED',
    'priority': 'PRIORITY_CHANGED',
    'column': 'COLUMN_CHANGED',
    'columnId': 'COLUMN_CHANGED',
    'dueDate': 'DUE_DATE_CHANGED',
    'labels': 'LABELS_CHANGED',
    'storyPoints': 'STORY_POINTS_CHANGED',
    'type': 'TYPE_CHANGED',
    'parentTask': 'PARENT_CHANGED',
    'parentTaskId': 'PARENT_CHANGED',
    'epic': 'EPIC_CHANGED',
    'epicId': 'EPIC_CHANGED',
    'milestone': 'MILESTONE_CHANGED',
    'milestoneId': 'MILESTONE_CHANGED',
    'story': 'STORY_CHANGED',
    'storyId': 'STORY_CHANGED',
    'color': 'COLOR_CHANGED',
  };

  return fieldActionMap[fieldName] || 'UPDATED';
}

/**
 * Helper: Sanitize item data for storage
 */
function sanitizeItemData(itemData: any) {
  // Remove sensitive or unnecessary fields
  if (!itemData) return null;
  
  const sanitized = { ...itemData };
  delete sanitized.password;
  delete sanitized.token;
  return sanitized;
} 

const boardItemActivityService = {
  createActivity,
  trackCreation,
  trackFieldChanges,
  trackMove,
  trackAssignment,
  getItemActivities,
  getWorkspaceActivities,
  getBoardActivities,
  createTaskActivity,
  compareObjects,
  hasChanged,
  getDisplayValue,
  getActionForField,
  sanitizeItemData,
};

export default boardItemActivityService;