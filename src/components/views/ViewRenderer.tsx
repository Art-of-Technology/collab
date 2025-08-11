"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  MoreHorizontal, 
  Plus, 
  Grid,
  List,
  Table,
  Calendar,
  BarChart3,
  Share,
  Edit,
  Trash2,
  Users,
  Save,
  RotateCcw,
  Filter,
  Eye,
  EyeOff
} from 'lucide-react';
import KanbanViewRenderer from './renderers/KanbanViewRenderer';
import ListViewRenderer from './renderers/ListViewRenderer';
import TableViewRenderer from './renderers/TableViewRenderer';
import TimelineViewRenderer from './renderers/TimelineViewRenderer';
import FilterDropdown from './shared/FilterDropdown';
import DisplayDropdown from './shared/DisplayDropdown';
import ViewTypeSelector from './shared/ViewTypeSelector';
import ViewFilters from './shared/ViewFilters';
import { useToast } from '@/hooks/use-toast';
import { useViewPositions, mergeIssuesWithViewPositions } from '@/hooks/queries/useViewPositions';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { NewIssueModal } from '@/components/issue';
import { useRouter } from 'next/navigation';
import { useIssuesByWorkspace } from '@/hooks/queries/useIssues';

interface ViewRendererProps {
  view: {
    id: string;
    name: string;
    description?: string;
    type: string;
    displayType: string;
    visibility: string;
    color?: string;
    issueCount: number;
    filters: any;
    sorting?: { field: string; direction: string };
    grouping?: { field: string };
    fields?: string[];
    layout?: any;
    projects: Array<{
      id: string;
      name: string;
      slug: string;
      issuePrefix: string;
      color?: string;
    }>;
    isDefault: boolean;
    isFavorite: boolean;
    createdBy: string;
    sharedWith: string[];
    createdAt: Date;
    updatedAt: Date;
  };
  issues: any[];
  workspace: any;
  currentUser: any;
}

const VIEW_TYPE_ICONS = {
  KANBAN: Grid,
  LIST: List,
  TABLE: Table,
  CALENDAR: Calendar,
  TIMELINE: BarChart3,
  GANTT: BarChart3,
  BOARD: Grid
};

export default function ViewRenderer({ 
  view, 
  issues: initialIssues, 
  workspace, 
  currentUser 
}: ViewRendererProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);

  // Use TanStack Query for real-time issue data
  const { data: issuesData, isLoading: isLoadingIssues } = useIssuesByWorkspace(
    workspace.id, 
    view.projects?.map(p => p.id)
  );
  
  // Use TanStack Query issues if available, fallback to initial SSR data
  // Prefer fresh data only if it's actually different (to avoid overriding optimistic updates)
  const issues = issuesData?.issues || initialIssues;

  // Fetch view-specific issue positions for proper ordering
  const { data: viewPositionsData, isLoading: isLoadingViewPositions } = useViewPositions(view.id, view.displayType === 'KANBAN');

  // Listen for position invalidation events
  useEffect(() => {
    const handleInvalidatePositions = (event: CustomEvent) => {
      if (event.detail?.viewId === view.id) {
        // Immediate invalidation and refetch
        queryClient.invalidateQueries({ queryKey: ['viewPositions', view.id] });
        queryClient.refetchQueries({ queryKey: ['viewPositions', view.id] });
      }
    };

    window.addEventListener('invalidateViewPositions', handleInvalidatePositions as EventListener);
    return () => {
      window.removeEventListener('invalidateViewPositions', handleInvalidatePositions as EventListener);
    };
  }, [view.id, queryClient]);

  // Temporary state for filters and display (resets on refresh)
  const [tempFilters, setTempFilters] = useState<Record<string, string[]>>({});
  const [tempDisplayType, setTempDisplayType] = useState(view.displayType);
  const [tempGrouping, setTempGrouping] = useState(view.grouping?.field || 'none');
  const [tempOrdering, setTempOrdering] = useState(view.sorting?.field || 'manual');
  const [tempDisplayProperties, setTempDisplayProperties] = useState(view.fields || []);
  const [tempShowSubIssues, setTempShowSubIssues] = useState(true);
  const [tempShowEmptyGroups, setTempShowEmptyGroups] = useState(true);
  const [tempCompletedIssues, setTempCompletedIssues] = useState('all');
  
  // Track the last saved state to properly detect changes
  const [lastSavedState, setLastSavedState] = useState({
    displayType: view.displayType,
    grouping: view.grouping?.field || 'none',
    ordering: view.sorting?.field || 'manual',
    displayProperties: view.fields || [],
    filters: view.filters || {}
  });

  // Update lastSavedState when view changes (e.g., switching views or data refetch)
  useEffect(() => {
    setLastSavedState({
      displayType: view.displayType,
      grouping: view.grouping?.field || 'none',
      ordering: view.sorting?.field || 'manual',
      displayProperties: view.fields || [],
      filters: view.filters || {}
    });
  }, [view.id, view.displayType, view.grouping?.field, view.sorting?.field, view.fields, view.filters]);
  
  // ViewFilters state
  const [isViewFiltersOpen, setIsViewFiltersOpen] = useState(false);
  const [viewFiltersState, setViewFiltersState] = useState<{
    assignees: string[];
    labels: string[];
    priority: string[];
    projects: string[];
  }>({
    assignees: [],
    labels: [],
    priority: [],
    projects: []
  });

  // Issue type filtering state
  const [issueFilterType, setIssueFilterType] = useState<'all' | 'active' | 'backlog'>('all');

  // Check if current state differs from last saved state
  const hasChanges = useMemo(() => {
    return (
      Object.keys(tempFilters).length > 0 ||
      tempDisplayType !== lastSavedState.displayType ||
      tempGrouping !== lastSavedState.grouping ||
      tempOrdering !== lastSavedState.ordering ||
      JSON.stringify(tempDisplayProperties) !== JSON.stringify(lastSavedState.displayProperties)
    );
  }, [tempFilters, tempDisplayType, tempGrouping, tempOrdering, tempDisplayProperties, lastSavedState]);

  // Reset to view defaults
  const resetToDefaults = () => {
    setTempFilters({});
    setTempDisplayType(lastSavedState.displayType);
    setTempGrouping(lastSavedState.grouping);
    setTempOrdering(lastSavedState.ordering);
    setTempDisplayProperties(lastSavedState.displayProperties);
    setTempShowSubIssues(true);
    setTempShowEmptyGroups(true);
    setTempCompletedIssues('all');
  };

  // Apply all filters (view + temp)
  const allFilters = useMemo(() => {
    const combinedFilters = { ...(view.filters || {}), ...tempFilters };
    return combinedFilters;
  }, [view.filters, tempFilters]);

  // Apply view filters and search
  const filteredIssues = useMemo(() => {
    // Merge issues with view-specific positions first
    let filtered = mergeIssuesWithViewPositions(issues, viewPositionsData?.positions || []);
    
    // Apply issue type filter (all/active/backlog)
    switch (issueFilterType) {
      case 'active':
        filtered = filtered.filter(issue => {
          const status = (issue.statusValue || issue.status || '').toLowerCase();
          return status !== 'done' && 
                 status !== 'backlog' && 
                 status !== 'cancelled' &&
                 status !== 'todo'; // Todo items should be in backlog, not active
        });
        break;
      case 'backlog':
        filtered = filtered.filter(issue => {
          const status = (issue.statusValue || issue.status || '').toLowerCase();
          return status === 'backlog' || status === 'todo';
        });
        break;
      default:
        // 'all' - no filtering
        break;
    }
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(issue => 
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.issueKey?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    }
    
    // Apply combined filters (from view settings and temp filters)
    Object.entries(allFilters).forEach(([filterKey, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(issue => {
          switch (filterKey) {
            case 'status':
              return filterValues.includes(issue.status);
            case 'priority':
              return filterValues.includes(issue.priority);
            case 'type':
              return filterValues.includes(issue.type);
            case 'assignee':
              return filterValues.includes(issue.assigneeId);
            case 'project':
              return filterValues.includes(issue.projectId);
            default:
              return true;
          }
        });
      }
    });

    // Apply ViewFilters sidebar filters
    // Assignee filter
    if (viewFiltersState.assignees.length > 0) {
      filtered = filtered.filter(issue => {
        const assigneeId = issue.assignee?.id || 'unassigned';
        return viewFiltersState.assignees.includes(assigneeId);
      });
    }

    // Labels filter
    if (viewFiltersState.labels.length > 0) {
      filtered = filtered.filter(issue => {
        if (!issue.labels || issue.labels.length === 0) {
          return viewFiltersState.labels.includes('no-labels');
        }
        return issue.labels.some((label: any) => 
          viewFiltersState.labels.includes(label.id)
        );
      });
    }

    // Priority filter
    if (viewFiltersState.priority.length > 0) {
      filtered = filtered.filter(issue => {
        const priority = issue.priority || 'no-priority';
        return viewFiltersState.priority.includes(priority);
      });
    }

    // Projects filter
    if (viewFiltersState.projects.length > 0) {
      filtered = filtered.filter(issue => {
        const projectId = issue.project?.id || 'no-project';
        return viewFiltersState.projects.includes(projectId);
      });
    }
    
    return filtered;
  }, [issues, issueFilterType, searchQuery, allFilters, viewFiltersState, viewPositionsData]);

  // Apply sorting
  const sortedIssues = useMemo(() => {
    const sorted = [...filteredIssues];
    
    const sortField = tempOrdering;
    if (sortField && sortField !== 'manual') {
      sorted.sort((a, b) => {
        let aValue: any;
        let bValue: any;
        
        switch (sortField) {
          case 'priority':
            const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
            bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
            break;
          case 'created':
          case 'createdAt':
            aValue = new Date(a.createdAt).getTime();
            bValue = new Date(b.createdAt).getTime();
            break;
          case 'updated':
          case 'updatedAt':
            aValue = new Date(a.updatedAt).getTime();
            bValue = new Date(b.updatedAt).getTime();
            break;
          case 'dueDate':
            aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
            bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
            break;
          default:
            aValue = a[sortField] || '';
            bValue = b[sortField] || '';
        }
        
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      });
    }
    
    return sorted;
  }, [filteredIssues, tempOrdering]);

  const ViewIcon = VIEW_TYPE_ICONS[tempDisplayType as keyof typeof VIEW_TYPE_ICONS] || List;

  const handleFavoriteToggle = async () => {
    try {
      const response = await fetch(`/api/views/${view.id}/favorite`, {
        method: 'POST'
      });
      
      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleUpdateView = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayType: tempDisplayType,
          filters: allFilters,
          sorting: { field: tempOrdering, direction: 'desc' },
          grouping: { field: tempGrouping },
          fields: tempDisplayProperties,
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'View updated successfully'
        });
        
        // Update the last saved state to reflect what we just saved
        setLastSavedState({
          displayType: tempDisplayType,
          grouping: tempGrouping,
          ordering: tempOrdering,
          displayProperties: tempDisplayProperties,
          filters: allFilters
        });
        
        // Reset temporary filters since they're now saved
        setTempFilters({});
        
        // Now hasChanges will be false and buttons will disappear
        
        // Invalidate and refetch views to get updated data
        queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        queryClient.refetchQueries({ queryKey: ['views', workspace.id] });
      }
    } catch (error) {
      console.error('Error updating view:', error);
      toast({
        title: 'Error',
        description: 'Failed to update view',
        variant: 'destructive'
      });
    }
  };

  const handleSaveAsNewView = async () => {
    if (!newViewName.trim()) {
      toast({
        title: 'Error',
        description: 'View name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newViewName,
          description: `Copy of ${view.name}`,
          displayType: tempDisplayType,
          visibility: 'PERSONAL',
          projectIds: view.projects.map(p => p.id),
          filters: allFilters,
          sorting: { field: tempOrdering, direction: 'desc' },
          grouping: { field: tempGrouping },
          fields: tempDisplayProperties,
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'New view created successfully'
        });
        setShowSaveDialog(false);
        setNewViewName('');
      }
    } catch (error) {
      console.error('Error creating view:', error);
      toast({
        title: 'Error',
        description: 'Failed to create view',
        variant: 'destructive'
      });
    }
  };

  const handleFilterChange = (filterId: string, value: string, isSelected: boolean) => {
    setTempFilters(prev => {
      if (isSelected) {
        return {
          ...prev,
          [filterId]: prev[filterId] ? [...prev[filterId], value] : [value]
        };
      } else {
        return {
          ...prev,
          [filterId]: prev[filterId]?.filter(v => v !== value) || []
        };
      }
    });
  };

  const removeTempFilter = (filterId: string, value?: string) => {
    setTempFilters(prev => {
      if (!value) {
        const { [filterId]: removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [filterId]: prev[filterId]?.filter(v => v !== value) || []
      };
    });
  };

  const handleToggleViewFilters = () => {
    setIsViewFiltersOpen(prev => !prev);
  };

  // Count issues for filter buttons
  const issueCounts = useMemo(() => {
    const allIssuesCount = issues.length;
    const activeIssuesCount = issues.filter((issue: any) => {
      const status = (issue.statusValue || issue.status || '').toLowerCase();
      return status !== 'done' && 
             status !== 'backlog' && 
             status !== 'cancelled' &&
             status !== 'todo'; // Todo items should be in backlog, not active
    }).length;
    const backlogIssuesCount = issues.filter((issue: any) => {
      const status = (issue.statusValue || issue.status || '').toLowerCase();
      return status === 'backlog' || status === 'todo';
    }).length;

    return {
      allIssuesCount,
      activeIssuesCount,
      backlogIssuesCount
    };
  }, [issues]);

  // Issue update handler - no page refresh, just API call
  const handleIssueUpdate = async (issueId: string, updates: any) => {
    try {
      const response = await fetch(`/api/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update issue');
      }
      
      // No page refresh - let React handle the optimistic update
      return await response.json();
    } catch (error) {
      console.error('Error updating issue:', error);
      toast({
        title: "Error",
        description: "Failed to update issue",
        variant: "destructive"
      });
      throw error;
    }
  };

  const renderViewContent = () => {
    const sharedProps = {
      view: {
        ...view,
        displayType: tempDisplayType,
        grouping: { field: tempGrouping },
        sorting: { field: tempOrdering, direction: 'desc' },
        fields: tempDisplayProperties
      },
      issues: sortedIssues,
      workspace,
      currentUser,
      // Additional props needed by KanbanViewRenderer
      projectId: view.projects?.[0]?.id || '',
      workspaceId: workspace.id,
      currentUserId: currentUser.id,
      onIssueCreated: () => {
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['issues'] });
      },
      // ViewFilters props - these will be passed but individual renderers can choose to use them or not
      isViewFiltersOpen,
      onToggleViewFilters: handleToggleViewFilters,
      viewFiltersState,
      onViewFiltersChange: setViewFiltersState,
      showSubIssues: tempShowSubIssues,
      onSubIssuesToggle: () => setTempShowSubIssues(prev => !prev),
      // Kanban callbacks
      onIssueUpdate: handleIssueUpdate,
    };

    switch (tempDisplayType) {
      case 'KANBAN':
      case 'BOARD':
        // Show loading state until view positions are loaded to prevent order flickering
        if (isLoadingViewPositions) {
          return (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          );
        }
        return <KanbanViewRenderer {...sharedProps} />;
      case 'LIST':
        return <ListViewRenderer {...sharedProps} />;
      case 'TABLE':
        return <TableViewRenderer {...sharedProps} />;
      case 'TIMELINE':
        return <TimelineViewRenderer {...sharedProps} />;
      default:
        return <ListViewRenderer {...sharedProps} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#101011] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
              {/* View Icon and Name */}
              <div className="flex items-center gap-2">
                {React.createElement(VIEW_TYPE_ICONS[view.type as keyof typeof VIEW_TYPE_ICONS] || List, {
                  className: "h-5 w-5 text-[#9ca3af]"
                })}
                <h1 className="text-xl font-semibold text-white">
                  {view.name}
                </h1>
              </div>
              
              {/* Issue Count */}
              <span className="text-[#666] text-sm">
                {sortedIssues.length} {sortedIssues.length === 1 ? 'issue' : 'issues'}
              </span>
            </div>

            {/* Changes Indicator */}
            {hasChanges && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  className="h-6 px-2 text-[#666] hover:text-[#999] text-xs border border-transparent hover:border-[#333]"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUpdateView}
                  className="h-6 px-2 text-[#8cc8ff] hover:text-[#58a6ff] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Update
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSaveDialog(true)}
                  className="h-6 px-2 text-[#f85149] hover:text-[#ff6b6b] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save as new
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-[#666]" />
              <Input
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 w-48 bg-[#0d1117] border-[#21262d] text-white placeholder-[#666] focus:border-[#58a6ff] h-6 text-xs"
              />
            </div>

            {/* View Options Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleViewFilters}
              className="h-6 px-2 text-[#7d8590] hover:text-[#e6edf3] text-xs border border-[#21262d] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]"
            >
              {isViewFiltersOpen ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              View Options
            </Button>

            {/* New Issue */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[#238636] hover:text-[#2ea043] text-xs border border-[#21262d] hover:border-[#238636] bg-[#0d1117] hover:bg-[#0d1721]"
              onClick={() => setIsNewIssueOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              New Issue
            </Button>


          </div>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-[#090909] border-[#1f1f1f] text-white">
          <DialogHeader>
            <DialogTitle>Save as new view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="View name"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white"
            />
            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setShowSaveDialog(false)}
                className="text-[#666]"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveAsNewView}
                className="bg-[#0969da] hover:bg-[#0860ca]"
              >
                Save view
            </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Issue Modal */}
      <NewIssueModal
        open={isNewIssueOpen}
        onOpenChange={setIsNewIssueOpen}
        workspaceId={workspace.id}
        projectId={view.projects?.length === 1 ? view.projects[0].id : undefined}
        onCreated={() => {
          setIsNewIssueOpen(false);
          queryClient.invalidateQueries();
          router.refresh();
        }}
      />

      {/* Filters and Display Controls Bar */}
      <div className="border-b border-[#1a1a1a] bg-[#101011] px-6 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Filters */}
          <div className="flex items-center gap-2">
            {/* Issue Type Filter Buttons */}
            <div className="flex items-center gap-1 mr-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIssueFilterType('all')}
                className={`h-6 px-2 text-xs border ${
                  issueFilterType === 'all' 
                    ? 'border-[#58a6ff] text-[#58a6ff] bg-[#0d1421] hover:bg-[#0d1421] hover:border-[#58a6ff]' 
                    : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
                }`}
              >
                All Issues
                <span className="ml-1 text-xs opacity-70">{issueCounts.allIssuesCount}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIssueFilterType('active')}
                className={`h-6 px-2 text-xs border ${
                  issueFilterType === 'active' 
                    ? 'border-[#f85149] text-[#f85149] bg-[#21110f] hover:bg-[#21110f] hover:border-[#f85149]' 
                    : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
                }`}
              >
                Active
                <span className="ml-1 text-xs opacity-70">{issueCounts.activeIssuesCount}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIssueFilterType('backlog')}
                className={`h-6 px-2 text-xs border ${
                  issueFilterType === 'backlog' 
                    ? 'border-[#a5a5a5] text-[#a5a5a5] bg-[#1a1a1a] hover:bg-[#1a1a1a] hover:border-[#a5a5a5]' 
                    : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
                }`}
              >
                Backlog
                <span className="ml-1 text-xs opacity-70">{issueCounts.backlogIssuesCount}</span>
              </Button>
            </div>

            <FilterDropdown
              selectedFilters={tempFilters}
              onFilterChange={handleFilterChange}
              variant="toolbar"
              projects={view.projects}
            />

            {/* Only show filter count if filters are active */}
            {Object.keys(allFilters).length > 0 && (
              <Badge 
                variant="secondary" 
                className="text-xs bg-[#1a1a1a] text-[#9ca3af] border-none px-2 py-1"
              >
                {Object.values(allFilters).flat().length} filters
              </Badge>
            )}
          </div>

          {/* Right: Display Controls */}
          <div className="flex items-center gap-2">
            {/* View Type Selector */}
            <ViewTypeSelector
              selectedType={tempDisplayType}
              onTypeChange={setTempDisplayType}
              variant="toolbar"
              availableTypes={['LIST', 'KANBAN']}
            />

            {/* Display Dropdown */}
            <DisplayDropdown
              displayType={tempDisplayType}
              grouping={tempGrouping}
              ordering={tempOrdering}
              displayProperties={tempDisplayProperties}
              showSubIssues={tempShowSubIssues}
              showEmptyGroups={tempShowEmptyGroups}
              completedIssues={tempCompletedIssues}
              onGroupingChange={setTempGrouping}
              onOrderingChange={setTempOrdering}
              onDisplayPropertiesChange={setTempDisplayProperties}
              onShowSubIssuesChange={setTempShowSubIssues}
              onShowEmptyGroupsChange={setTempShowEmptyGroups}
              onCompletedIssuesChange={setTempCompletedIssues}
              onReset={resetToDefaults}
              variant="toolbar"
            />
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main View Content */}
        <div className="flex-1 overflow-hidden">
          {renderViewContent()}
        </div>
        
        {/* ViewFilters Sidebar */}
        {isViewFiltersOpen && (
          <div className="flex-shrink-0">
            <ViewFilters
              issues={issues}
              workspace={workspace}
              view={view}
              currentUser={currentUser}
              isOpen={isViewFiltersOpen}
              onToggle={handleToggleViewFilters}
              selectedFilters={viewFiltersState}
              onFiltersChange={setViewFiltersState}
              showSubIssues={tempShowSubIssues}
              onSubIssuesToggle={() => setTempShowSubIssues(prev => !prev)}
              viewType={tempDisplayType.toLowerCase() as 'kanban' | 'list' | 'timeline'}
              onVisibilityChange={async (visibility) => {
                try {
                  const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      visibility
                    })
                  });

                  if (response.ok) {
                    toast({
                      title: 'Success',
                      description: 'View visibility updated successfully'
                    });
                    
                    // Refresh the page to reflect changes
                    window.location.reload();
                  } else {
                    throw new Error('Failed to update visibility');
                  }
                } catch (error) {
                  console.error('Error updating visibility:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to update view visibility',
                    variant: 'destructive'
                  });
                }
              }}
              onOwnerChange={async (ownerId) => {
                try {
                  const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ownerId
                    })
                  });

                  if (response.ok) {
                    toast({
                      title: 'Success',
                      description: 'View owner updated successfully'
                    });
                    
                    // Refresh the page to reflect changes
                    window.location.reload();
                  } else {
                    throw new Error('Failed to update owner');
                  }
                } catch (error) {
                  console.error('Error updating owner:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to update view owner',
                    variant: 'destructive'
                  });
                }
              }}
              onDeleteView={async () => {
                if (!confirm('Are you sure you want to delete this view? This action cannot be undone.')) {
                  return;
                }
                
                try {
                  const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
                    method: 'DELETE'
                  });

                  if (response.ok) {
                    toast({
                      title: 'Success',
                      description: 'View deleted successfully'
                    });
                    
                    // Navigate back to views list
                    router.push(`/${workspace.slug || workspace.id}/views`);
                  } else {
                    throw new Error('Failed to delete view');
                  }
                } catch (error) {
                  console.error('Error deleting view:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to delete view',
                    variant: 'destructive'
                  });
                }
              }}
              onNameChange={async (name) => {
                try {
                  const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name
                    })
                  });

                  if (response.ok) {
                    toast({
                      title: 'Success',
                      description: 'View name updated successfully'
                    });
                    
                    // Refresh the page to reflect changes
                    window.location.reload();
                  } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to update name');
                  }
                } catch (error) {
                  console.error('Error updating name:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to update view name',
                    variant: 'destructive'
                  });
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
} 