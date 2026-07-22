/**
 * Planning View v2 - Simplified Types
 * Clean, flat data structures optimized for UI consumption
 */

// =============================================================================
// Base Issue Types
// =============================================================================

export interface SimpleIssue {
  id: string;
  key: string;          // e.g., "PYB-234"
  title: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  type: string;
  projectName?: string;
  daysActive?: number;  // how long in current status
  statusLabel?: string; // Actual status name (e.g., "Waiting for Deploy", "In QA")
  statusCategory?: 'completed' | 'in_progress' | 'in_review' | 'blocked' | 'planned'; // Category
}

export interface CompletedIssue extends SimpleIssue {
  completedAt: string;  // ISO datetime
}

export interface BlockedIssue extends SimpleIssue {
  blockedBy?: string;   // Issue key or reason text
  blockedReason?: string;
}

// =============================================================================
// Day Activity
// =============================================================================

export interface DayActivity {
  date: string;         // YYYY-MM-DD
  completed: CompletedIssue[];
  started: SimpleIssue[];
  movedToReview: SimpleIssue[];
  snapshot?: MemberCurrentState;  // Historical state snapshot for this day
}

// =============================================================================
// Member Current State
// =============================================================================

export interface MemberCurrentState {
  inProgress: SimpleIssue[];
  inReview: SimpleIssue[];
  blocked: BlockedIssue[];
  planned: SimpleIssue[];
}

// =============================================================================
// Member Summary
// =============================================================================

export interface MemberSummary {
  completed: number;
  inReview: number;
  inProgress: number;
  blocked: number;
  planned: number;
  workload: number;     // total active items (inProgress + inReview + blocked)
}

// =============================================================================
// Member Activity (Full)
// =============================================================================

export interface MemberActivity {
  user: {
    id: string;
    name: string;
    image: string | null;
  };
  summary: MemberSummary;
  days: Record<string, DayActivity>;  // keyed by YYYY-MM-DD
  current: MemberCurrentState;

  // Computed for UI convenience
  todayHighlight?: string;  // Most significant action today
  hasBlockers: boolean;
  warnings: string[];
}

// =============================================================================
// Team Summary
// =============================================================================

export interface TeamSummary {
  completed: number;
  completedToday: number;
  inReview: number;
  inProgress: number;
  blocked: number;
}

// =============================================================================
// API Response
// =============================================================================

export interface TeamActivityResponse {
  period: {
    start: string;      // ISO date
    end: string;        // ISO date
  };
  summary: TeamSummary;
  members: MemberActivity[];
}

// =============================================================================
// UI State Types
// =============================================================================

export type PlanningViewMode = 'team' | 'standup' | 'activity';

export interface PlanningFilters {
  projectIds: string[];
  userIds: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
}

// =============================================================================
// Priority Helpers
// =============================================================================

export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',  // red
  HIGH: '#f97316',      // orange
  MEDIUM: '#eab308',    // yellow
  LOW: '#22c55e',       // green
  NONE: '#6b7280',      // gray
};

export const STATUS_COLORS = {
  completed: '#22c55e',   // green
  inProgress: '#3b82f6',  // blue
  inReview: '#8b5cf6',    // purple
  blocked: '#ef4444',     // red
  planned: '#6b7280',     // gray
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

export function getPriorityColor(priority: string): string {
  return PRIORITY_COLORS[priority?.toUpperCase()] || PRIORITY_COLORS.NONE;
}

export function formatDaysActive(days: number | undefined): string {
  if (days === undefined || days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function getWorkloadLevel(workload: number): 'low' | 'medium' | 'high' | 'overloaded' {
  if (workload <= 3) return 'low';
  if (workload <= 5) return 'medium';
  if (workload <= 7) return 'high';
  return 'overloaded';
}
