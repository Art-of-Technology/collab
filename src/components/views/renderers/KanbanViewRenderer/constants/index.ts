export const DEFAULT_COLUMNS = {
  status: ['backlog', 'todo', 'in_progress', 'review', 'done'],
  priority: ['Urgent', 'High', 'Medium', 'Low'],
  type: ['Epic', 'Story', 'Task', 'Defect', 'Milestone', 'Subtask'],
};

export const COLUMN_COLORS = {
  status: {
    'backlog': 'border-gray-600',
    'todo': 'border-gray-600',
    'in progress': 'border-blue-500',
    'in review': 'border-purple-500',
    'done': 'border-green-500',
  },
  priority: {
    'urgent': 'border-red-500',
    'high': 'border-orange-500',
    'medium': 'border-yellow-500',
    'low': 'border-green-500',
  },
  type: {
    'epic': 'border-purple-500',
    'story': 'border-blue-500',
    'task': 'border-green-500',
    'defect': 'border-red-500',
    'milestone': 'border-indigo-500',
    'subtask': 'border-cyan-500',
  }
};

export const PRIORITY_COLORS = {
  'URGENT': 'border-l-red-500',
  'HIGH': 'border-l-orange-500',
  'MEDIUM': 'border-l-yellow-500',
  'LOW': 'border-l-green-500',
};

export const ISSUE_TYPE_COLORS = {
  'EPIC': 'bg-purple-500/10 text-purple-400',
  'STORY': 'bg-blue-500/10 text-blue-400',
  'TASK': 'bg-green-500/10 text-green-400',
  'DEFECT': 'bg-red-500/10 text-red-400',
  'MILESTONE': 'bg-indigo-500/10 text-indigo-400',
  'SUBTASK': 'bg-cyan-500/10 text-cyan-400',
};

export const ISSUE_TYPE_LABELS = {
  'EPIC': 'Epic',
  'STORY': 'Story',
  'TASK': 'Task',
  'DEFECT': 'Defect',
  'MILESTONE': 'Milestone',
  'SUBTASK': 'Subtask',
};

export const PRIORITY_LABELS = {
  'URGENT': 'Urgent',
  'HIGH': 'High',
  'MEDIUM': 'Medium',
  'LOW': 'Low',
};

export const PRIORITY_BADGE_COLORS = {
  'URGENT': 'text-red-400 border-red-400/20',
  'HIGH': 'text-orange-400 border-orange-400/20',
  'MEDIUM': 'text-yellow-400 border-yellow-400/20',
  'LOW': 'text-green-400 border-green-400/20',
};

export const DEFAULT_DISPLAY_PROPERTIES = ['Assignee', 'Priority', 'Labels', 'Due Date', 'Story Points', 'Reporter'];