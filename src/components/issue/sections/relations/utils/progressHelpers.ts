import type { RelationItem } from "../types/relation";

export interface SubIssueProgress {
  completed: number;
  total: number;
  percentage: number;
}

/**
 * Calculate sub-issue progress based on their status
 * Considers issues with status "Done" or "Completed" as completed
 */
export function calculateSubIssueProgress(children: RelationItem[]): SubIssueProgress {
  if (!children || children.length === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const total = children.length;
  const completed = children.filter(child => {
    const status = child.status?.toLowerCase();
    return status === 'done' || status === 'completed';
  }).length;

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

/**
 * Get color class based on progress percentage
 */
export function getProgressColor(percentage: number): string {
  if (percentage === 0) return 'bg-[#444]';
  if (percentage < 30) return 'bg-red-500';
  if (percentage < 70) return 'bg-yellow-500';
  if (percentage < 100) return 'bg-blue-500';
  return 'bg-green-500';
}

/**
 * Get progress bar color class (with transparency for background)
 */
export function getProgressBarColor(percentage: number): {
  bar: string;
  bg: string;
} {
  if (percentage === 0) {
    return { bar: 'bg-[#444]', bg: 'bg-[#2d2d30]' };
  }
  if (percentage < 30) {
    return { bar: 'bg-red-500', bg: 'bg-red-500/10' };
  }
  if (percentage < 70) {
    return { bar: 'bg-yellow-500', bg: 'bg-yellow-500/10' };
  }
  if (percentage < 100) {
    return { bar: 'bg-blue-500', bg: 'bg-blue-500/10' };
  }
  return { bar: 'bg-green-500', bg: 'bg-green-500/10' };
}

/**
 * Format progress text (e.g., "3/5 completed")
 */
export function formatProgressText(completed: number, total: number): string {
  if (total === 0) return 'No sub-issues';
  if (completed === 0) return `0/${total}`;
  if (completed === total) return `All ${total} completed`;
  return `${completed}/${total} completed`;
}

/**
 * Get status-based completion description
 */
export function getProgressDescription(progress: SubIssueProgress): string {
  const { completed, total, percentage } = progress;
  
  if (total === 0) return 'No sub-issues yet';
  if (percentage === 0) return 'Not started';
  if (percentage === 100) return 'All complete!';
  if (percentage >= 75) return 'Almost done';
  if (percentage >= 50) return 'In progress';
  return 'Just started';
}

/**
 * Check if all sub-issues are completed
 */
export function areAllSubIssuesCompleted(children: RelationItem[]): boolean {
  if (!children || children.length === 0) return false;
  return children.every(child => {
    const status = child.status?.toLowerCase();
    return status === 'done' || status === 'completed';
  });
}

/**
 * Get remaining sub-issues count
 */
export function getRemainingCount(progress: SubIssueProgress): number {
  return progress.total - progress.completed;
}

