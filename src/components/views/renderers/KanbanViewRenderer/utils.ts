import { COLUMN_COLORS, PRIORITY_COLORS, DEFAULT_COLUMNS } from './constants';
import type { FilterType, FilterState, Column } from './types';

export const getColumnColor = (columnName: string, groupField: string): string => {
  const colors = COLUMN_COLORS[groupField as keyof typeof COLUMN_COLORS];
  if (!colors) return 'border-gray-600';
  
  const colorKey = columnName.toLowerCase();
  return colors[colorKey as keyof typeof colors] || 'border-gray-600';
};

export const getPriorityColor = (priority: string): string => {
  return PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || 'border-l-gray-600';
};

export const filterIssues = (
  issues: any[],
  filterType: FilterType,
  selectedFilters: FilterState
) => {
  let filtered = [...issues];
  
  // Apply type filtering (all/active/backlog)
  switch (filterType) {
    case 'active':
      filtered = filtered.filter(issue => 
        issue.status !== 'Done' && 
        issue.status !== 'Backlog' && 
        issue.status !== 'Cancelled'
      );
      break;
    case 'backlog':
      filtered = filtered.filter(issue => 
        issue.status === 'Backlog' || 
        issue.status === 'Todo'
      );
      break;
    default:
      // 'all' - no filtering
      break;
  }
  
  // Apply assignee filters
  if (selectedFilters.assignees.length > 0) {
    filtered = filtered.filter(issue => {
      const assigneeId = issue.assignee?.id || 'unassigned';
      return selectedFilters.assignees.includes(assigneeId);
    });
  }
  
  // Apply label filters
  if (selectedFilters.labels.length > 0) {
    filtered = filtered.filter(issue => {
      if (!issue.labels || issue.labels.length === 0) {
        return selectedFilters.labels.includes('no-labels');
      }
      return issue.labels.some((label: any) => 
        selectedFilters.labels.includes(label.id)
      );
    });
  }
  
  // Apply priority filters
  if (selectedFilters.priority.length > 0) {
    filtered = filtered.filter(issue => {
      const priority = issue.priority || 'no-priority';
      return selectedFilters.priority.includes(priority);
    });
  }
  
  // Apply project filters
  if (selectedFilters.projects.length > 0) {
    filtered = filtered.filter(issue => {
      const projectId = issue.project?.id || 'no-project';
      return selectedFilters.projects.includes(projectId);
    });
  }
  
  return filtered;
};

export const createColumns = (filteredIssues: any[], view: any, projectStatuses?: any[], allowedStatusNames?: string[]): Column[] => {
  const groupField = view.grouping?.field || 'status';
  const columnsMap = new Map(); // Use ID as key to prevent duplicates
  
  // Handle status grouping with database-driven project statuses
  if (groupField === 'status' && projectStatuses && projectStatuses.length > 0) {
    // Initialize columns from project statuses
    const allowedSet = Array.isArray(allowedStatusNames) && allowedStatusNames.length > 0
      ? new Set(allowedStatusNames)
      : null;

    projectStatuses.forEach((status) => {
      if (allowedSet && !allowedSet.has(status.name)) return;
      columnsMap.set(status.name, {
        id: status.name,
        name: status.displayName,
        issues: [],
        order: status.order,
        color: status.color,
        iconName: status.iconName
      });
    });
  } else {
    // Fallback to hardcoded columns for non-status grouping or when project statuses are not available
    const defaultColumns = DEFAULT_COLUMNS[groupField as keyof typeof DEFAULT_COLUMNS] || ['todo', 'in_progress', 'done'];
    
    // Create a mapping for prettier display names
    const displayNameMap: Record<string, string> = {
      'backlog': 'Backlog',
      'todo': 'To Do', 
      'in_progress': 'In Progress',
      'review': 'Review',
      'done': 'Done',
      'blocked': 'Blocked'
    };
    
    // Initialize default columns using ID as Map key
    defaultColumns.forEach((column, index) => {
      const columnId = typeof column === 'string' ? column.toLowerCase().replace(/\s+/g, '_') : column;
      const displayName = displayNameMap[columnId] || columnId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      columnsMap.set(columnId, {
        id: columnId,
        name: displayName,
        issues: [],
        order: index
      });
    });
  }

  // Group filtered issues
  filteredIssues.forEach((issue: any) => {
    let groupValue: string;
    let groupKey: string;
    
    switch (groupField) {
      case 'status':
        // For status grouping, use the projectStatus relationship if available
        if (issue.projectStatus?.name) {
          groupKey = issue.projectStatus.name;
          groupValue = issue.projectStatus.displayName || issue.projectStatus.name;
        } else {
          // Fallback to statusValue/status for backward compatibility
          const statusVal = issue.statusValue || issue.status || 'todo';
          
          // Try to find matching project status by displayName or name
          const matchingStatus = projectStatuses?.find(ps => 
            ps.name === statusVal || 
            ps.displayName === statusVal ||
            ps.name.toLowerCase().replace(/\s+/g, '_') === statusVal.toLowerCase().replace(/\s+/g, '_')
          );
          
          if (matchingStatus) {
            groupKey = matchingStatus.name;
            groupValue = matchingStatus.displayName || matchingStatus.name;
          } else {
            // Only create dynamic column if no project statuses are defined
            if (!projectStatuses || projectStatuses.length === 0) {
              groupKey = statusVal.toLowerCase().replace(/\s+/g, '_');
              groupValue = statusVal;
            } else {
              // Default to first project status if mismatch
              const defaultStatus = projectStatuses.find(ps => ps.isDefault) || projectStatuses[0];
              groupKey = defaultStatus.name;
              groupValue = defaultStatus.displayName || defaultStatus.name;
            }
          }
        }
        break;
      case 'priority':
        groupValue = issue.priority === 'URGENT' ? 'Urgent' :
                    issue.priority === 'HIGH' ? 'High' :
                    issue.priority === 'MEDIUM' ? 'Medium' :
                    issue.priority === 'LOW' ? 'Low' :
                    'Medium';
        groupKey = groupValue.toLowerCase();
        break;
      case 'assignee':
        groupValue = issue.assignee?.name || 'Unassigned';
        groupKey = groupValue.toLowerCase().replace(/\s+/g, '-');
        break;
      case 'type':
        groupValue = issue.type === 'EPIC' ? 'Epic' : 
                    issue.type === 'STORY' ? 'Story' :
                    issue.type === 'TASK' ? 'Task' :
                    issue.type === 'BUG' ? 'Bug' :
                    issue.type === 'MILESTONE' ? 'Milestone' :
                    issue.type === 'SUBTASK' ? 'Subtask' :
                    'Task';
        groupKey = groupValue.toLowerCase();
        break;
      default:
        groupValue = issue.projectStatus?.displayName || issue.statusValue || issue.status || 'todo';
        groupKey = groupValue;
    }
    
    // If allowed statuses are provided, skip issues not in the allowed set (for status grouping)
    if (groupField === 'status' && Array.isArray(allowedStatusNames) && allowedStatusNames.length > 0) {
      const allowedSet = new Set(allowedStatusNames);
      if (!allowedSet.has(groupKey)) {
        return;
      }
    }

    // Create column if it doesn't exist (for dynamic values)
    // Only create dynamic columns for non-status grouping or when no project statuses exist
    if (!columnsMap.has(groupKey)) {
      if (groupField !== 'status' || !projectStatuses || projectStatuses.length === 0) {
        columnsMap.set(groupKey, {
          id: groupKey,
          name: groupValue,
          issues: [],
          order: columnsMap.size
        });
      } else {
        // For status grouping with project statuses, the column should already exist
        // This is a fallback that shouldn't normally happen
        console.warn(`Issue with status "${groupValue}" does not match any project status. Skipping.`);
        return; // Skip this issue
      }
    }
    
    // Add issue to the column
    const column = columnsMap.get(groupKey);
    if (column) {
      column.issues.push(issue);
    }
  });

  // Sort issues within each column based on selected ordering (default: manual by position)
  const sortedColumns = Array.from(columnsMap.values()).map((column: Column) => ({
    ...column,
    issues: column.issues.sort((a: any, b: any) => {
      const orderingField = (view?.ordering || view?.sorting?.field || 'manual') as string;

      if (orderingField === 'priority') {
        const priorityOrder: Record<string, number> = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        const aVal = priorityOrder[(a.priority || '').toUpperCase()] || 0;
        const bVal = priorityOrder[(b.priority || '').toUpperCase()] || 0;
        if (aVal !== bVal) return bVal - aVal; // Descending: URGENT -> LOW
        // Tie-breaker: manual position
        const posA = a.viewPosition ?? a.position ?? 999999;
        const posB = b.viewPosition ?? b.position ?? 999999;
        if (posA !== posB) return posA - posB;
        // Final tie-breaker: createdAt asc
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      
      if (orderingField === 'created' || orderingField === 'createdAt') {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (aDate !== bDate) return bDate - aDate; // Newest first
        const posA = a.viewPosition ?? a.position ?? 999999;
        const posB = b.viewPosition ?? b.position ?? 999999;
        if (posA !== posB) return posA - posB;
        return 0;
      }

      if (orderingField === 'updated' || orderingField === 'updatedAt') {
        const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (aDate !== bDate) return bDate - aDate; // Most recently updated first
        const posA = a.viewPosition ?? a.position ?? 999999;
        const posB = b.viewPosition ?? b.position ?? 999999;
        if (posA !== posB) return posA - posB;
        return 0;
      }

      if (orderingField === 'dueDate') {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (aDate !== bDate) return aDate - bDate; // Earliest due first
        const posA = a.viewPosition ?? a.position ?? 999999;
        const posB = b.viewPosition ?? b.position ?? 999999;
        if (posA !== posB) return posA - posB;
        return 0;
      }

      if (orderingField === 'startDate') {
        const aDate = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
        const bDate = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
        if (aDate !== bDate) return aDate - bDate; // Earliest start first
        const posA = a.viewPosition ?? a.position ?? 999999;
        const posB = b.viewPosition ?? b.position ?? 999999;
        if (posA !== posB) return posA - posB;
        return 0;
      }

      // Default/manual: position first, then createdAt
      const posA = a.viewPosition ?? a.position ?? 999999;
      const posB = b.viewPosition ?? b.position ?? 999999;
      if (posA !== posB) return posA - posB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
  }));

  return sortedColumns.sort((a, b) => a.order - b.order);
};

export const countIssuesByType = (issues: any[]) => {
  const allIssuesCount = issues.length;
  const activeIssuesCount = issues.filter(issue => {
    const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
    const statusLower = status.toLowerCase();
    return statusLower !== 'done' && 
           statusLower !== 'backlog' && 
           statusLower !== 'cancelled';
  }).length;
  const backlogIssuesCount = issues.filter(issue => {
    const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
    const statusLower = status.toLowerCase();
    return statusLower === 'backlog' || 
           statusLower === 'todo';
  }).length;

  return {
    allIssuesCount,
    activeIssuesCount,
    backlogIssuesCount
  };
};