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

export const createColumns = (filteredIssues: any[], view: any): Column[] => {
  const groupField = view.grouping?.field || 'status';
  const columnsMap = new Map(); // Use ID as key to prevent duplicates
  
  // Get default columns based on grouping field
  const defaultColumns = DEFAULT_COLUMNS[groupField as keyof typeof DEFAULT_COLUMNS] || ['Todo', 'In Progress', 'Done'];
  
  // Initialize default columns using ID as Map key
  defaultColumns.forEach((column, index) => {
    const columnId = column.toLowerCase().replace(/\s+/g, '-');
    columnsMap.set(columnId, {
      id: columnId,
      name: column,
      issues: [],
      order: index
    });
  });

  // Group filtered issues
  filteredIssues.forEach((issue: any) => {
    let groupValue: string;
    
    switch (groupField) {
      case 'status':
        groupValue = issue.status || 'Todo';
        break;
      case 'priority':
        groupValue = issue.priority === 'URGENT' ? 'Urgent' :
                    issue.priority === 'HIGH' ? 'High' :
                    issue.priority === 'MEDIUM' ? 'Medium' :
                    issue.priority === 'LOW' ? 'Low' :
                    'Medium';
        break;
      case 'assignee':
        groupValue = issue.assignee?.name || 'Unassigned';
        break;
      case 'type':
        groupValue = issue.type === 'EPIC' ? 'Epic' : 
                    issue.type === 'STORY' ? 'Story' :
                    issue.type === 'TASK' ? 'Task' :
                    issue.type === 'DEFECT' ? 'Defect' :
                    issue.type === 'MILESTONE' ? 'Milestone' :
                    issue.type === 'SUBTASK' ? 'Subtask' :
                    'Task';
        break;
      default:
        groupValue = issue.status || 'Todo';
    }
    
    // Generate consistent ID for the group value
    const columnId = groupValue.toLowerCase().replace(/\s+/g, '-');
    
    // Create column if it doesn't exist
    if (!columnsMap.has(columnId)) {
      columnsMap.set(columnId, {
        id: columnId,
        name: groupValue,
        issues: [],
        order: columnsMap.size
      });
    }
    
    // Add issue to the column
    const column = columnsMap.get(columnId);
    if (column) {
      column.issues.push(issue);
    }
  });

  return Array.from(columnsMap.values()).sort((a, b) => a.order - b.order);
};

export const countIssuesByType = (issues: any[]) => {
  const allIssuesCount = issues.length;
  const activeIssuesCount = issues.filter(issue => 
    issue.status !== 'Done' && 
    issue.status !== 'Backlog' && 
    issue.status !== 'Cancelled'
  ).length;
  const backlogIssuesCount = issues.filter(issue => 
    issue.status === 'Backlog' || 
    issue.status === 'Todo'
  ).length;

  return {
    allIssuesCount,
    activeIssuesCount,
    backlogIssuesCount
  };
};