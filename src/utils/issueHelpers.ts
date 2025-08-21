import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  BookOpen, 
  CheckSquare, 
  Bug, 
  Milestone, 
  ChevronDown,
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { IssueType, IssuePriority, Issue } from "@/types/issue";

// Issue type configurations with Linear.app-style icons and colors
export const ISSUE_TYPE_CONFIG = {
  EPIC: {
    label: "Epic",
    icon: Target,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    darkBgColor: "dark:bg-purple-900/20",
    darkBorderColor: "dark:border-purple-700/50",
    darkColor: "dark:text-purple-400"
  },
  STORY: {
    label: "Story", 
    icon: BookOpen,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    darkBgColor: "dark:bg-blue-900/20",
    darkBorderColor: "dark:border-blue-700/50",
    darkColor: "dark:text-blue-400"
  },
  TASK: {
    label: "Task",
    icon: CheckSquare,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    darkBgColor: "dark:bg-emerald-900/20",
    darkBorderColor: "dark:border-emerald-700/50",
    darkColor: "dark:text-emerald-400"
  },
  BUG: {
    label: "Bug",
    icon: Bug,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    darkBgColor: "dark:bg-red-900/20",
    darkBorderColor: "dark:border-red-700/50",
    darkColor: "dark:text-red-400"
  },
  DEFECT: {
    label: "Bug",
    icon: Bug,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    darkBgColor: "dark:bg-red-900/20",
    darkBorderColor: "dark:border-red-700/50",
    darkColor: "dark:text-red-400"
  },
  MILESTONE: {
    label: "Milestone",
    icon: Milestone,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    darkBgColor: "dark:bg-amber-900/20",
    darkBorderColor: "dark:border-amber-700/50",
    darkColor: "dark:text-amber-400"
  },
  SUBTASK: {
    label: "Subtask",
    icon: ChevronDown,
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    darkBgColor: "dark:bg-slate-900/20",
    darkBorderColor: "dark:border-slate-700/50",
    darkColor: "dark:text-slate-400"
  }
} as const;

// Priority configurations with Linear.app-style design
export const PRIORITY_CONFIG = {
  LOW: {
    label: "Low",
    icon: ArrowDown,
    color: "text-slate-500",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    darkBgColor: "dark:bg-slate-800/50",
    darkColor: "dark:text-slate-400"
  },
  MEDIUM: {
    label: "Medium",
    icon: Minus,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    darkBgColor: "dark:bg-blue-900/20",
    darkColor: "dark:text-blue-400"
  },
  HIGH: {
    label: "High",
    icon: ArrowUp,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    darkBgColor: "dark:bg-amber-900/20",
    darkColor: "dark:text-amber-400"
  },
  URGENT: {
    label: "Urgent",
    icon: Flag,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    darkBgColor: "dark:bg-red-900/20",
    darkColor: "dark:text-red-400"
  }
} as const;

// Status configurations (basic, can be extended)
export const STATUS_CONFIG = {
  TODO: {
    label: "Todo",
    icon: Circle,
    color: "text-slate-500"
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Clock,
    color: "text-blue-500"
  },
  DONE: {
    label: "Done",
    icon: CheckCircle2,
    color: "text-emerald-500"
  },
  CANCELLED: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-red-500"
  }
} as const;

// Generate issue type badge configuration
export function getIssueTypeBadge(type: IssueType | null | undefined | string) {
  // Normalize type to uppercase to handle database case mismatches
  const normalizedType = type?.toString().toUpperCase() as IssueType;
  
  // Handle cases where type is null, undefined, or invalid
  if (!normalizedType || !ISSUE_TYPE_CONFIG[normalizedType]) {
    // Fallback to TASK type if the type is invalid
    const fallbackConfig = ISSUE_TYPE_CONFIG.TASK;
    return {
      label: fallbackConfig.label,
      icon: fallbackConfig.icon,
      className: `
        ${fallbackConfig.bgColor} ${fallbackConfig.borderColor} ${fallbackConfig.color}
        ${fallbackConfig.darkBgColor} ${fallbackConfig.darkBorderColor} ${fallbackConfig.darkColor}
        flex items-center gap-1.5 px-2.5 py-1 font-medium
        hover:shadow-sm transition-all duration-200
      `.replace(/\s+/g, ' ').trim(),
      iconClassName: "h-3.5 w-3.5"
    };
  }

  const config = ISSUE_TYPE_CONFIG[normalizedType];
  return {
    label: config.label,
    icon: config.icon,
    className: `
      ${config.bgColor} ${config.borderColor} ${config.color}
      ${config.darkBgColor} ${config.darkBorderColor} ${config.darkColor}
      flex items-center gap-1.5 px-2.5 py-1 font-medium
      hover:shadow-sm transition-all duration-200
    `.replace(/\s+/g, ' ').trim(),
    iconClassName: "h-3.5 w-3.5"
  };
}

// Generate priority badge configuration
export function getIssuePriorityBadge(priority: IssuePriority | null | undefined | string) {
  // Normalize priority to uppercase to handle database case mismatches
  const normalizedPriority = priority?.toString().toUpperCase() as IssuePriority;
  
  // Handle cases where priority is null, undefined, or invalid
  if (!normalizedPriority || !PRIORITY_CONFIG[normalizedPriority]) {
    // Fallback to LOW priority if the priority is invalid
    const fallbackConfig = PRIORITY_CONFIG.LOW;
    return {
      label: fallbackConfig.label,
      icon: fallbackConfig.icon,
      className: `
        ${fallbackConfig.bgColor} ${fallbackConfig.borderColor} ${fallbackConfig.color}
        ${fallbackConfig.darkBgColor} ${fallbackConfig.darkColor}
        flex items-center gap-1.5 px-2.5 py-1 font-medium
        hover:shadow-sm transition-all duration-200
      `.replace(/\s+/g, ' ').trim(),
      iconClassName: "h-3.5 w-3.5"
    };
  }

  const config = PRIORITY_CONFIG[normalizedPriority];
  return {
    label: config.label,
    icon: config.icon,
    className: `
      ${config.bgColor} ${config.borderColor} ${config.color}
      ${config.darkBgColor} ${config.darkColor}
      flex items-center gap-1.5 px-2.5 py-1 font-medium
      hover:shadow-sm transition-all duration-200
    `.replace(/\s+/g, ' ').trim(),
    iconClassName: "h-3.5 w-3.5"
  };
}

// Generate status badge configuration
export function getIssueStatusBadge(status: string) {
  // Try to match against known statuses, fallback to default
  const normalizedStatus = status?.toUpperCase().replace(/\s+/g, '_') as keyof typeof STATUS_CONFIG;
  const config = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.TODO;

  return {
    label: status || "Todo",
    icon: config.icon,
    className: `
      ${config.color} flex items-center gap-1.5 px-2.5 py-1 font-medium
      border-current/20 bg-current/5 hover:bg-current/10
      transition-all duration-200
    `.replace(/\s+/g, ' ').trim(),
    iconClassName: "h-3.5 w-3.5"
  };
}

// Date formatting helpers
export function formatIssueDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatIssueDateShort(date: Date | string | null | undefined): string {
  if (!date) return '';
  return format(new Date(date), 'MMM d');
}

export function formatIssueRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

// Issue key helpers
export function getIssueKeyPrefix(type: IssueType): string {
  const prefixMap = {
    EPIC: 'E',
    STORY: 'S', 
    TASK: 'T',
    DEFECT: 'D',
    MILESTONE: 'M',
    SUBTASK: 'ST'
  };
  return prefixMap[type];
}

export function parseIssueKey(issueKey: string): { prefix: string; type: string; number: string } | null {
  const match = issueKey.match(/^([A-Z]+)-([A-Z]+)(\d+)$/);
  if (!match) return null;
  
  return {
    prefix: match[1],
    type: match[2],
    number: match[3]
  };
}

// Issue hierarchy helpers
export function canHaveChildren(type: IssueType): boolean {
  return ['EPIC', 'STORY', 'MILESTONE'].includes(type);
}

export function getValidChildTypes(type: IssueType): IssueType[] {
  const childMap: Record<IssueType, IssueType[]> = {
    EPIC: ['STORY', 'TASK'],
    STORY: ['TASK', 'SUBTASK'], 
    TASK: ['SUBTASK'],
    MILESTONE: ['EPIC', 'STORY', 'TASK'],
    DEFECT: ['SUBTASK'],
    SUBTASK: []
  };
  return childMap[type] || [];
}

export function getValidParentTypes(type: IssueType): IssueType[] {
  const parentMap: Record<IssueType, IssueType[]> = {
    EPIC: ['MILESTONE'],
    STORY: ['EPIC'],
    TASK: ['EPIC', 'STORY'],
    SUBTASK: ['TASK', 'STORY', 'DEFECT'],
    DEFECT: [],
    MILESTONE: []
  };
  return parentMap[type] || [];
}

// Progress calculation
export function calculateIssueProgress(issue: Issue): number {
  if (issue.type === 'TASK' || issue.type === 'SUBTASK' || issue.type === 'DEFECT' || issue.type === 'BUG') {
    // For leaf items, progress is based on status
    const status = issue.status?.toLowerCase();
    if (status === 'done' || status === 'completed') return 100;
    if (status === 'in progress' || status === 'in_progress') return 50;
    return 0;
  }

  // For parent items, calculate based on children
  if (!issue.children || issue.children.length === 0) {
    return issue.progress || 0;
  }

  const childProgress = issue.children.reduce((sum, child) => {
    return sum + calculateIssueProgress(child);
  }, 0);

  return Math.round(childProgress / issue.children.length);
}

// Time formatting for duration
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Copy to clipboard helper
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
} 