import { IssueActivity, ActivityAction } from '../types/activity';

export const getActionDisplayName = (action: string): string => {
  const actionMap: Record<string, string> = {
    'CREATED': 'Created',
    'UPDATED': 'Updated',
    'MOVED': 'Moved',
    'ASSIGNED': 'Assigned',
    'UNASSIGNED': 'Unassigned',
    'STATUS_CHANGED': 'Status Changed',
    'PRIORITY_CHANGED': 'Priority Changed',
    'COLUMN_CHANGED': 'Column Changed',
    'DUE_DATE_SET': 'Due Date Set',
    'DUE_DATE_CHANGED': 'Due Date Changed',
    'DUE_DATE_REMOVED': 'Due Date Removed',
    'DESCRIPTION_UPDATED': 'Description Updated',
    'TITLE_UPDATED': 'Title Updated',
    'REPORTER_CHANGED': 'Reporter Changed',
    'LABELS_CHANGED': 'Labels Changed',
    'STORY_POINTS_CHANGED': 'Story Points Changed',
    'TYPE_CHANGED': 'Type Changed',
    'PARENT_CHANGED': 'Parent Changed',
    'EPIC_CHANGED': 'Epic Changed',
    'MILESTONE_CHANGED': 'Milestone Changed',
    'STORY_CHANGED': 'Story Changed',
    'COLOR_CHANGED': 'Color Changed',
    'TASK_PLAY_STARTED': 'Started Working',
    'TASK_PLAY_STOPPED': 'Stopped Working',
    'TASK_PLAY_PAUSED': 'Paused Work',
    'TIME_ADJUSTED': 'Time Adjusted',
    'SESSION_EDITED': 'Session Edited',
    'HELP_REQUEST_SENT': 'Help Request Sent',
    'HELP_REQUEST_APPROVED': 'Help Request Approved',
    'HELP_REQUEST_REJECTED': 'Help Request Rejected',
  };

  return actionMap[action] || action.replace(/_/g, ' ').toLowerCase();
};

export const getActionText = (activity: IssueActivity, itemType: string = 'issue'): string => {
  const userName = activity.user.name || 'Unknown User';
  const actionName = getActionDisplayName(activity.action).toLowerCase();
  
  return `${userName} ${actionName} this ${itemType}`;
};

export const shouldShowChangeDetails = (activity: IssueActivity): boolean => {
  const { action, oldValue, newValue } = activity;
  
  // Show change details for field changes that have old and new values
  const changeActions = [
    'TITLE_UPDATED',
    'DESCRIPTION_UPDATED', 
    'STATUS_CHANGED',
    'PRIORITY_CHANGED',
    'COLUMN_CHANGED',
    'TYPE_CHANGED',
    'LABELS_CHANGED',
    'STORY_POINTS_CHANGED',
    'DUE_DATE_CHANGED',
    'REPORTER_CHANGED',
    'ASSIGNED',
    'COLOR_CHANGED',
    'TIME_ADJUSTED',
    'SESSION_EDITED'
  ];
  
  return changeActions.includes(action) && (oldValue !== undefined || newValue !== undefined || activity.details);
};

export const formatValue = (value: any, activity?: IssueActivity): string => {
  if (value === null || value === undefined) return 'None';
  
  try {
    // Try to parse JSON if it's a string
    if (typeof value === 'string') {
      // Check if it's HTML content and strip tags for clean display
      if (value.includes('<') && value.includes('>')) {
        // Strip HTML tags and decode entities for display
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = value;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        // Truncate long text content
        return textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent;
      }
      
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          // Handle common object formats
          if (parsed.name) return parsed.name;
          if (parsed.title) return parsed.title;
          if (parsed.label) return parsed.label;
          return JSON.stringify(parsed);
        }
        return String(parsed);
      } catch {
        // If it looks like a database ID (starts with 'cm' and is long), 
        // it's probably a user ID for assignment changes
        if (value.startsWith('cm') && value.length > 20 && activity) {
          // For assignment-related actions, try to get user info from activity details
          if (activity.action === 'ASSIGNED' || activity.action === 'REPORTER_CHANGED') {
            // Check if we have user details in activity.details
            if (activity.details?.oldAssignee && activity.oldValue === value) {
              return activity.details.oldAssignee.name || 'Unknown User';
            }
            if (activity.details?.newAssignee && activity.newValue === value) {
              return activity.details.newAssignee.name || 'Unknown User';
            }
            if (activity.details?.oldReporter && activity.oldValue === value) {
              return activity.details.oldReporter.name || 'Unknown User';
            }
            if (activity.details?.newReporter && activity.newValue === value) {
              return activity.details.newReporter.name || 'Unknown User';
            }
            // If it's in oldValue/newValue, it's likely a user ID
            return 'Unknown User';
          }
          return 'Unknown';
        }
        return value;
      }
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    // Handle objects
    if (typeof value === 'object') {
      if (value.name) return value.name;
      if (value.title) return value.title;
      if (value.label) return value.label;
      return JSON.stringify(value);
    }
    
    return String(value);
  } catch {
    return String(value);
  }
};

export const filterActivities = (activities: IssueActivity[]): IssueActivity[] => {
  // Filter out redundant COLUMN_CHANGED activities
  return activities.filter((activity, index) => {
    // If this is a COLUMN_CHANGED activity, check if there's a STATUS_CHANGED activity nearby
    if (activity.action === 'COLUMN_CHANGED') {
      const fiveMinutesInMs = 5 * 60 * 1000;
      const activityTime = new Date(activity.createdAt).getTime();
      
      // Check for STATUS_CHANGED activities within 5 minutes
      const hasNearbyStatusChange = activities.some((other, otherIndex) => {
        if (other.action === 'STATUS_CHANGED' && otherIndex !== index) {
          const otherTime = new Date(other.createdAt).getTime();
          return Math.abs(activityTime - otherTime) <= fiveMinutesInMs;
        }
        return false;
      });
      
      // Hide COLUMN_CHANGED if there's a nearby STATUS_CHANGED
      return !hasNearbyStatusChange;
    }
    
    return true;
  });
};
