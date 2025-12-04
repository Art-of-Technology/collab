"use client";

import { useState, useMemo, useEffect } from 'react';
import { Loader2, Users, User, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ViewProjectSelector } from '@/components/views/selectors/ViewProjectSelector';
import { AssigneeSelector } from '@/components/views/selectors/AssigneeSelector';
import { useTeamSyncRange, useActivityFeed } from '@/hooks/queries/useTeamSync';
import { useProjects } from '@/hooks/queries/useProjects';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, differenceInDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

import {
  PlanningDateRangePicker,
  PlanningTeamSummary,
  PlanningActivityFeed,
  PlanningWeekView,
  PlanningDayView,
} from './components';
import type { ViewMode, DateRange, PlanningFilters } from './types';

interface PlanningViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

export default function PlanningViewRenderer({
  view,
  issues,
  workspace,
  currentUser,
}: PlanningViewRendererProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [personalMode, setPersonalMode] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  // Date range state - Day view includes yesterday and today for comparison
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    return {
      startDate: startOfDay(subDays(today, 1)), // Include yesterday for day view
      endDate: endOfDay(today),
    };
  });

  // Fetch all workspace projects (not just from filtered issues)
  const { data: allProjects = [] } = useProjects({
    workspaceId: workspace.id,
    includeStats: false,
  });

  // Fetch all workspace members (not just from filtered issues)
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspace.id],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspace.id}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');
      const data = await response.json();
      return data.members || data;
    },
  });

  // Transform projects for selector
  const workspaceProjects = useMemo(() => {
    return allProjects.map((p: any) => ({
      id: p.id,
      name: p.name,
      color: p.color,
    }));
  }, [allProjects]);

  // Filter states
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    view.projects?.map((p: any) => p.id) || []
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    view.filters?.assignee || []
  );

  // Initialize with all projects when available
  useEffect(() => {
    if (workspaceProjects.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(workspaceProjects.map(p => p.id));
    }
  }, [workspaceProjects, selectedProjectIds.length]);

  // Track filter changes
  const hasChanges = useMemo(() => {
    const savedProjectIds = view.projects?.map((p: any) => p.id) || [];
    const savedAssigneeIds = view.filters?.assignee || [];
    
    return (
      JSON.stringify(selectedProjectIds.sort()) !== JSON.stringify(savedProjectIds.sort()) ||
      JSON.stringify(selectedUserIds.sort()) !== JSON.stringify(savedAssigneeIds.sort())
    );
  }, [selectedProjectIds, selectedUserIds, view.projects, view.filters]);

  // Fetch data based on view mode
  const userIdsToFetch = personalMode ? [currentUser.id] : 
    (selectedUserIds.length > 0 ? selectedUserIds : undefined);

  const { data: rangeData, isLoading: isLoadingRange } = useTeamSyncRange({
    workspaceId: workspace.id,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
    userIds: userIdsToFetch,
    enabled: viewMode !== 'activity',
  });

  const { data: activityData, isLoading: isLoadingActivity } = useActivityFeed({
    workspaceId: workspace.id,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
    userIds: userIdsToFetch,
    limit: 100,
    enabled: viewMode === 'activity',
  });

  const isLoading = viewMode === 'activity' ? isLoadingActivity : isLoadingRange;

  // Handle date range change with week view constraint
  const handleDateRangeChange = (range: DateRange) => {
    // For week view, enforce max 7 days
    if (viewMode === 'week') {
      const daysDiff = differenceInDays(range.endDate, range.startDate);
      if (daysDiff > 6) { // More than 7 days (0-indexed diff)
        // Trim to 7 days from start date
        setDateRange({
          startDate: range.startDate,
          endDate: endOfDay(addDays(range.startDate, 6)),
        });
        return;
      }
    }
    setDateRange(range);
  };

  // Handle view mode change with appropriate date range
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    
    // Adjust date range based on view mode
    if (mode === 'week') {
      const today = new Date();
      setDateRange({
        startDate: startOfWeek(today, { weekStartsOn: 1 }),
        endDate: endOfWeek(today, { weekStartsOn: 1 }),
      });
    } else if (mode === 'day') {
      const today = new Date();
      setDateRange({
        startDate: startOfDay(subDays(today, 1)), // Include yesterday for split view
        endDate: endOfDay(today),
      });
    }
    // Activity mode keeps current date range
  };

  // Save filter changes
  const handleSaveChanges = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: selectedProjectIds,
          filters: {
            ...view.filters,
            assignee: selectedUserIds,
          },
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'View filters saved successfully'
        });
        queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        router.refresh();
      } else {
        throw new Error('Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving view:', error);
      toast({
        title: 'Error',
        description: 'Failed to save view filters',
        variant: 'destructive'
      });
    }
  };

  const handleResetChanges = () => {
    setSelectedProjectIds(view.projects?.map((p: any) => p.id) || []);
    setSelectedUserIds(view.filters?.assignee || []);
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Filter Bar */}
      <div className={cn(
        "border-b transition-colors",
        "border-[#1a1a1a] bg-[#0c0c0c] px-4 py-2"
      )}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {/* Left side - View mode toggle and personal toggle */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Team/Personal Toggle */}
            <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2d2d30] rounded-md p-0.5">
              <button
                onClick={() => setPersonalMode(false)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
                  !personalMode
                    ? "bg-[#2563eb] text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#252525]"
                )}
              >
                <Users className="h-3 w-3" />
                Team
              </button>
              <button
                onClick={() => setPersonalMode(true)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
                  personalMode
                    ? "bg-[#10b981] text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#252525]"
                )}
              >
                <User className="h-3 w-3" />
                My Plan
              </button>
            </div>

            {/* View Mode & Date Range */}
            <PlanningDateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />

            {/* Save/Reset buttons */}
            {hasChanges && !view.isDefault && (
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetChanges}
                  className="h-7 px-2 text-xs text-gray-400 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveChanges}
                  className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
              </div>
            )}
          </div>

          {/* Right side - Filters */}
          <div className="flex items-center gap-1.5">
            <ViewProjectSelector
              value={selectedProjectIds}
              onChange={setSelectedProjectIds}
              projects={workspaceProjects}
            />
            <AssigneeSelector
              value={selectedUserIds}
              onChange={setSelectedUserIds}
              assignees={workspaceMembers}
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Summary Dashboard (not shown in activity mode) */}
          {viewMode !== 'activity' && rangeData?.summary && (
            <PlanningTeamSummary
              summary={rangeData.summary}
              dateRange={rangeData.dateRange}
              isCollapsed={summaryCollapsed}
              onToggleCollapse={() => setSummaryCollapsed(!summaryCollapsed)}
            />
          )}

          {/* Main Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {viewMode === 'activity' ? (
              <PlanningActivityFeed
                activities={activityData?.feed || []}
                workspaceSlug={workspace.slug}
                isLoading={isLoadingActivity}
              />
            ) : viewMode === 'week' ? (
              <PlanningWeekView
                members={rangeData?.members || []}
                workspaceSlug={workspace.slug}
                dateRange={dateRange}
              />
            ) : (
              /* Day View - Yesterday/Today Split */
              <PlanningDayView
                members={rangeData?.members || []}
                workspaceSlug={workspace.slug}
                selectedDate={dateRange.endDate}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

