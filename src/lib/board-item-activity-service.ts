import { prisma } from "@/lib/prisma";

export type ActivityAction =
  | 'CREATED'
  | 'UPDATED'
  | 'MOVED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'TITLE_CHANGED'
  | 'DESCRIPTION_CHANGED'
  | 'DUE_DATE_CHANGED'
  | 'STORY_POINTS_CHANGED'
  | 'LABELS_CHANGED'
  | 'DELETED'
  | 'COMMENTED'
  | 'REPORTER_CHANGED';

export interface ActivityDetails {
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
  [key: string]: unknown;
}

export async function createActivity(params: {
  action: ActivityAction;
  itemType: string;
  itemId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
  details?: ActivityDetails;
}) {
  const {
    action,
    itemType,
    itemId,
    userId,
    workspaceId,
    projectId,
    fieldName,
    oldValue,
    newValue,
    details,
  } = params;

  return prisma.issueActivity.create({
    data: {
      action,
      itemType,
      itemId,
      userId,
      workspaceId,
      projectId,
      fieldName,
      oldValue: oldValue ?? undefined,
      newValue: newValue ?? undefined,
      details: details ? JSON.stringify(details) : undefined,
    },
  });
}

export function compareObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fieldsToCompare: string[]
): { field: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];

  for (const field of fieldsToCompare) {
    const oldValue = oldObj[field];
    const newValue = newObj[field];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }

  return changes;
}

export async function trackFieldChanges(params: {
  itemType: string;
  itemId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  changes: { field: string; oldValue: unknown; newValue: unknown }[];
}) {
  const { itemType, itemId, userId, workspaceId, projectId, changes } = params;

  const activities = [];

  for (const change of changes) {
    const activity = await createActivity({
      action: getActionForField(change.field),
      itemType,
      itemId,
      userId,
      workspaceId,
      projectId,
      fieldName: change.field,
      oldValue: change.oldValue != null ? String(change.oldValue) : null,
      newValue: change.newValue != null ? String(change.newValue) : null,
    });
    activities.push(activity);
  }

  return activities;
}

function getActionForField(field: string): ActivityAction {
  const fieldActionMap: Record<string, ActivityAction> = {
    status: 'STATUS_CHANGED',
    statusId: 'STATUS_CHANGED',
    priority: 'PRIORITY_CHANGED',
    title: 'TITLE_CHANGED',
    description: 'DESCRIPTION_CHANGED',
    dueDate: 'DUE_DATE_CHANGED',
    storyPoints: 'STORY_POINTS_CHANGED',
    assigneeId: 'ASSIGNED',
    labels: 'LABELS_CHANGED',
  };

  return fieldActionMap[field] || 'UPDATED';
}

export async function trackAssignment(params: {
  itemType: string;
  itemId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  assigneeId: string | null;
  oldAssigneeId: string | null;
}) {
  const { itemType, itemId, userId, workspaceId, projectId, assigneeId, oldAssigneeId } = params;

  if (assigneeId === oldAssigneeId) {
    return null;
  }

  const action = assigneeId ? 'ASSIGNED' : 'UNASSIGNED';

  return createActivity({
    action,
    itemType,
    itemId,
    userId,
    workspaceId,
    projectId,
    fieldName: 'assigneeId',
    oldValue: oldAssigneeId,
    newValue: assigneeId,
  });
}

export async function trackCreation(
  itemType: string,
  itemId: string,
  userId: string,
  workspaceId: string,
  projectId?: string,
  item?: any
) {
  return createActivity({
    action: 'CREATED',
    itemType,
    itemId,
    userId,
    workspaceId,
    projectId,
    details: item ? { title: item.title, type: item.type } : undefined,
  });
}
