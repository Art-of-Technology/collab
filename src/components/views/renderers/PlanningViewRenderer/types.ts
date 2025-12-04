import type { 
  TeamMemberRangeSync, 
  TeamRangeSummary, 
  DayActivity,
  IssueMovement,
  IssueActivity,
  MovementType
} from '@/utils/teamSyncAnalyzer';

export type ViewMode = 'day' | 'week' | 'activity';

export type StatusFilter = 'all' | 'completed' | 'started' | 'in_progress' | 'in_review';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface PlanningFilters {
  dateRange: DateRange;
  projectIds: string[];
  userIds: string[];
  statusFilter: StatusFilter;
}

export interface PlanningViewState {
  viewMode: ViewMode;
  filters: PlanningFilters;
  expandedMembers: Set<string>;
  selectedIssueId: string | null;
}

// Re-export types from teamSyncAnalyzer for convenience
export type {
  TeamMemberRangeSync,
  TeamRangeSummary,
  DayActivity,
  IssueMovement,
  IssueActivity,
  MovementType
};

