"use client";

import { useState, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Grid,
  List,
  Table,
  Calendar,
  BarChart3,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import KanbanViewRenderer from './renderers/KanbanViewRenderer';
import ListViewRenderer from './renderers/ListViewRenderer';
import TableViewRenderer from './renderers/TableViewRenderer';
import TimelineViewRenderer from './renderers/TimelineViewRenderer';
import ViewTypeSelector from './shared/ViewTypeSelector';
import { ViewProjectSelector } from './selectors/ViewProjectSelector';
import { ViewGroupingSelector } from './selectors/ViewGroupingSelector';
import { ViewDisplayPropertiesSelector } from './selectors/ViewDisplayPropertiesSelector';
import { ViewUpdatedAtSelector } from './selectors/ViewUpdatedAtSelector';
import { StatusSelector } from './selectors/StatusSelector';
import { PrioritySelector } from './selectors/PrioritySelector';
import { TypeSelector } from './selectors/TypeSelector';
import { AssigneeSelector } from './selectors/AssigneeSelector';
import { ReporterSelector } from './selectors/ReporterSelector';
import { LabelsSelector } from './selectors/LabelsSelector';
import { ActionFiltersSelector, type ActionFilter } from './selectors/ActionFiltersSelector';
import { useActionFilteredIssues } from '@/hooks/useActionFilteredIssues';
import { useToast } from '@/hooks/use-toast';
import { useViewPositions, mergeIssuesWithViewPositions } from '@/hooks/queries/useViewPositions';
import { useProjects } from '@/hooks/queries/useProjects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIssuesByWorkspace, issueKeys } from '@/hooks/queries/useIssues';
import React, { useEffect } from 'react';
import { useRealtimeWorkspaceEvents } from '@/hooks/useRealtimeWorkspaceEvents';
import { IS_KANBAN_REALTIME_ENABLED } from '@/lib/featureFlags';
import { Bell, BellOff } from 'lucide-react';
import { NewIssueModal } from '@/components/issue';
import { useRouter } from 'next/navigation';

import { useViewFilters } from '@/context/ViewFiltersContext';
import PageHeader, { pageHeaderButtonStyles, pageHeaderSearchStyles } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';

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
      statuses?: any[];
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
  const [isFollowingProject, setIsFollowingProject] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const pendingColumnOrdersRef = useRef<Record<string, number>>({});
  const commitColumnOrderRef = useRef<any>(null);
  
  // ViewFilters context
  const {
    isOpen: isViewFiltersOpen,
    setIsOpen: setIsViewFiltersOpen,
    toggleOpen: toggleViewFilters,
    filters: viewFiltersState,
    setFilters: setViewFiltersState,
    setCurrentView,
    setIssues,
    setWorkspace,
    setCurrentUser
  } = useViewFilters();
  // Fetch all workspace projects for the project selector
  const { data: allProjects = [] } = useProjects({
    workspaceId: workspace.id,
    includeStats: false,
  });

  // Fetch workspace members for assignee selector
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspace.id],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspace.id}/members`);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const members = await response.json();
      
      // Transform the data to extract user objects from members
      return members.map((member: any) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
        useCustomAvatar: member.user.useCustomAvatar,
        avatarAccessory: member.user.avatarAccessory,
        avatarBrows: member.user.avatarBrows,
        avatarEyes: member.user.avatarEyes,
        avatarEyewear: member.user.avatarEyewear,
        avatarHair: member.user.avatarHair,
        avatarMouth: member.user.avatarMouth,
        avatarNose: member.user.avatarNose,
        avatarSkinTone: member.user.avatarSkinTone,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch workspace labels for labels selector
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace-labels', workspace.id],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspace.id}/labels`);
      if (!response.ok) {
        throw new Error('Failed to fetch labels');
      }
      const data = await response.json();
      return data.labels || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  

  // Realtime: subscribe to workspace-level events to keep issues and positions fresh
  // Allow invalidations so view positions update after drag-and-drop unless feature flag disables it for Kanban
  const suppressRealtimeForKanban = view.displayType === 'KANBAN' && !IS_KANBAN_REALTIME_ENABLED;
  useRealtimeWorkspaceEvents({
    workspaceId: workspace.id,
    viewId: view.id,
    enabled: !suppressRealtimeForKanban
  });

  // Temporary state for filters and display (resets on refresh)
  const [tempFilters, setTempFilters] = useState<Record<string, string[] | ActionFilter[]>>({});
  const [tempDisplayType, setTempDisplayType] = useState(view.displayType);
  const [tempGrouping, setTempGrouping] = useState(view.grouping?.field || 'none');
  const [tempOrdering, setTempOrdering] = useState('manual');
  const [tempDisplayProperties, setTempDisplayProperties] = useState<string[]>(Array.isArray(view.fields) ? view.fields : ["Priority", "Status", "Assignee"]);
  const [tempProjectIds, setTempProjectIds] = useState(view.projects.map(p => p.id));
  const [recentIssueCreated, setRecentIssueCreated] = useState(false);
  
  // Reset recentIssueCreated flag after a delay
  useEffect(() => {
    if (recentIssueCreated) {
      const timeout = setTimeout(() => setRecentIssueCreated(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [recentIssueCreated]);
  
  // Fetch view-specific issue positions for proper ordering (KANBAN or manual ordering)
  const { data: viewPositionsData, isLoading: isLoadingViewPositions } = useViewPositions(
    view.id,
    view.displayType === 'KANBAN' || tempOrdering === 'manual',
  );
  // Load project follow status (for the primary project of this view)
  const primaryProjectId = useMemo(() => (tempProjectIds?.[0] || view.projects?.[0]?.id || ''), [tempProjectIds, view.projects]);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!primaryProjectId) return;
      try {
        const res = await fetch(`/api/projects/${primaryProjectId}/follow`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (active) setIsFollowingProject(!!data.isFollowing);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { active = false; };
  }, [primaryProjectId]);

  const toggleProjectFollow = useCallback(async () => {
    if (!primaryProjectId || isTogglingFollow) return;
    setIsTogglingFollow(true);
    try {
      const method = isFollowingProject ? 'DELETE' : 'POST';
      const res = await fetch(`/api/projects/${primaryProjectId}/follow`, { method });
      if (res.ok) {
        setIsFollowingProject(prev => !prev);
      }
    } finally {
      setIsTogglingFollow(false);
    }
  }, [primaryProjectId, isFollowingProject, isTogglingFollow]);
  const [tempShowSubIssues, setTempShowSubIssues] = useState(true);

  // Update ordering selection and invalidate caches; positions are not reset here
  // Sorting is locked to manual; no-op for ordering changes
  const handleOrderingChange = useCallback(async () => {
    setTempOrdering('manual');
  }, []);

  // Determine which projects are newly selected (not in original view)
  const originalProjectIds = useMemo(() => view.projects.map(p => p.id).sort(), [view.projects]);
  const additionalProjectIds = useMemo(() => {
    return tempProjectIds.filter(id => !originalProjectIds.includes(id));
  }, [tempProjectIds, originalProjectIds]);

  // Check if view has active filters (other than just project filtering)
  const hasActiveFilters = useMemo(() => {
    if (!view.filters || typeof view.filters !== 'object') return false;
    
    const filters = view.filters as Record<string, any>;
    return Object.entries(filters).some(([key, value]) => {
      // Skip project filtering as that's handled separately
      if (key === 'project') return false;
      return Array.isArray(value) && value.length > 0;
    });
  }, [view.filters]);

  // Check if any temp filters differ from the view's original filters
  const tempFiltersChanged = useMemo(() => {
    if (Object.keys(tempFilters).length === 0) return false;
    
    // Check each temp filter against the original view filter
    return Object.entries(tempFilters).some(([filterKey, tempValues]) => {
      const viewValues = view.filters?.[filterKey] || [];
      
      // Handle ActionFilter[] type for actions
      if (filterKey === 'actions') {
        return JSON.stringify(tempValues) !== JSON.stringify(viewValues);
      }
      
      // Handle string[] type for other filters
      const tempArray = Array.isArray(tempValues) ? tempValues : [];
      const viewArray = Array.isArray(viewValues) ? viewValues : [];
      
      return JSON.stringify(tempArray.sort()) !== JSON.stringify(viewArray.sort());
    });
  }, [tempFilters, view.filters]);
  
  // Fetch live data if:
  // 1. View has no active filters, OR
  // 2. User has added/changed any filters that weren't in the original view, OR
  // 3. An issue was recently created (to ensure new issues appear in filtered views)
  const shouldFetchLiveData = !hasActiveFilters || tempFiltersChanged || recentIssueCreated;
  
  // Fetch live workspace issues to supplement initialIssues, filtered by view's projects
  const { data: liveIssuesData } = useIssuesByWorkspace(
    shouldFetchLiveData ? workspace.id : '',
    shouldFetchLiveData ? (tempProjectIds.length > 0 ? tempProjectIds : view.projects.map(p => p.id)) : undefined
  );

  // Fetch issues from additional projects if any are selected
  const { data: additionalIssuesData, isLoading: isLoadingAdditionalIssues } = useQuery({
    queryKey: ['additional-issues', workspace.id, additionalProjectIds.sort().join(',')],
    queryFn: async () => {
      if (additionalProjectIds.length === 0) return { issues: [] };
      
      const params = new URLSearchParams({
        workspaceId: workspace.id,
        projectIds: additionalProjectIds.join(',')
      });
      
      const response = await fetch(`/api/issues?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch additional issues');
      }
      return response.json();
    },
    enabled: additionalProjectIds.length > 0,
    staleTime: 5000,
  });

  // Merge original issues with live data and additional issues from newly selected projects
  const allIssues = useMemo(() => {
    // When view has filters and no temp filters changed AND no recent issue creation, prioritize server-side filtered initialIssues
    // When no filters OR temp filters changed OR recent issue created, use live data for real-time updates
    const baseIssues = (hasActiveFilters && !tempFiltersChanged && !recentIssueCreated)
      ? initialIssues 
      : (liveIssuesData?.issues || initialIssues);
    const additional = additionalIssuesData?.issues || [];
    
    // Remove duplicates by ID when merging
    const issueMap = new Map();
    [...baseIssues, ...additional].forEach(issue => {
      issueMap.set(issue.id, issue);
    });
    
    return Array.from(issueMap.values());
  }, [initialIssues, liveIssuesData, additionalIssuesData, hasActiveFilters, tempFiltersChanged, recentIssueCreated]);

  // Use merged issues for filtering directly
  
  // Helper function to handle filter changes and trigger data refetch when needed
  const handleFilterChange = useCallback((filterKey: string, newValues: string[] | ActionFilter[], originalValues: string[] | ActionFilter[]) => {
    const isDifferent = JSON.stringify(newValues) !== JSON.stringify(originalValues);
    
    if (isDifferent) {
      setTempFilters(prev => ({ ...prev, [filterKey]: newValues }));
      
      // Invalidate and refetch workspace issues to get newly filtered issues
      queryClient.invalidateQueries({ 
        queryKey: [...issueKeys.byWorkspace(workspace.id)] 
      });
    } else {
      // Remove the filter if it matches the original view filter
      const { [filterKey]: removed, ...rest } = tempFilters;
      setTempFilters(rest);
    }
  }, [queryClient, workspace.id, tempFilters]);
  
  // Track the last saved state to properly detect changes
  const [lastSavedState, setLastSavedState] = useState({
    displayType: view.displayType,
    grouping: view.grouping?.field || 'none',
    ordering: 'manual',
    displayProperties: Array.isArray(view.fields) ? view.fields : ["Priority", "Status", "Assignee"],
    filters: view.filters || {}
  });

  // Update lastSavedState when view changes (e.g., switching views or data refetch)
  useEffect(() => {
    setLastSavedState({
      displayType: view.displayType,
      grouping: view.grouping?.field || 'none',
      ordering: 'manual',
      displayProperties: Array.isArray(view.fields) ? view.fields : ["Priority", "Status", "Assignee"],
      filters: view.filters || {}
    });
    // Reset temp project IDs when view changes
    setTempProjectIds(view.projects.map(p => p.id));
    // Sync temp display properties with view on view change
    setTempDisplayProperties(Array.isArray(view.fields) ? view.fields : ["Priority", "Status", "Assignee"]);
  }, [view.id, view.displayType, view.grouping?.field, view.sorting?.field, view.fields, view.filters, view.projects]);
  
  // Update ViewFilters context with current data
  useEffect(() => {
    setCurrentView(view);
    setIssues(allIssues);
    setWorkspace(workspace);
    setCurrentUser(currentUser);
  }, [view, allIssues, workspace, currentUser, setCurrentView, setIssues, setWorkspace, setCurrentUser]);

  // Issue type filtering state
  const [issueFilterType, setIssueFilterType] = useState<'all' | 'active' | 'backlog'>('all');

  // Check if current state differs from last saved state
  const hasChanges = useMemo(() => {
    const sortedTemp = [...tempDisplayProperties].sort();
    const sortedSaved = [...(lastSavedState.displayProperties || [])].sort();
    return (
      Object.keys(tempFilters).length > 0 ||
      tempDisplayType !== lastSavedState.displayType ||
      tempGrouping !== lastSavedState.grouping ||
      tempOrdering !== lastSavedState.ordering ||
      JSON.stringify(sortedTemp) !== JSON.stringify(sortedSaved) ||
      JSON.stringify(tempProjectIds.sort()) !== JSON.stringify(view.projects.map(p => p.id).sort())
    );
  }, [tempFilters, tempDisplayType, tempGrouping, tempOrdering, tempDisplayProperties, tempProjectIds, lastSavedState, view.projects]);

  // Reset to view defaults
  const resetToDefaults = () => {
    setTempFilters({});
    setTempDisplayType(lastSavedState.displayType);
    setTempGrouping(lastSavedState.grouping);
    setTempOrdering(lastSavedState.ordering);
    setTempDisplayProperties(lastSavedState.displayProperties);
    setTempProjectIds(view.projects.map(p => p.id));
    setTempShowSubIssues(true);
  };

  // Apply all filters (view + temp)
  const allFilters = useMemo(() => {
    const combinedFilters = { ...(view.filters || {}), ...tempFilters };
    return combinedFilters;
  }, [view.filters, tempFilters]);

  // Memoize action filters to prevent reference instability
  const actionFilters = useMemo(() => {
    return (allFilters.actions as ActionFilter[]) || [];
  }, [JSON.stringify(allFilters.actions || [])]);

  // Apply action filters first (async filtering)
  const { 
    filteredIssues: actionFilteredIssues
  } = useActionFilteredIssues({
    issues: allIssues,
    actionFilters,
    workspaceId: workspace.id
  });

  // Create a sorted copy of tempProjectIds for stable comparison and filtering
  const sortedTempProjectIds = useMemo(() => 
    [...tempProjectIds].sort(), [tempProjectIds]
  );

  // Apply view filters and search
  const filteredIssues = useMemo(() => {
    // Start with action-filtered issues instead of all issues
    let filtered = mergeIssuesWithViewPositions(actionFilteredIssues, viewPositionsData?.positions || []);
    // Apply project filtering if tempProjectIds differs from original view projects
    const projectSelectionChanged = JSON.stringify(originalProjectIds) !== JSON.stringify(sortedTempProjectIds);
    
    if (projectSelectionChanged) {
      if (tempProjectIds.length === 0) {
        // If no projects selected, show no issues
        filtered = [];
      } else {
        // Filter to selected projects
        filtered = filtered.filter(issue => {
          return sortedTempProjectIds.includes(issue.projectId);
        });
      }
    }
    
    // Apply issue type filter (all/active/backlog)
    switch (issueFilterType) {
      case 'active':
        filtered = filtered.filter(issue => {
          // Use projectStatus if available, otherwise fallback to legacy fields
          const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
          const statusLower = status.toLowerCase();
          return statusLower !== 'done' && 
                 statusLower !== 'backlog' && 
                 statusLower !== 'cancelled' &&
                 statusLower !== 'to_do'; // Todo items should be in backlog, not active
        });
        break;
      case 'backlog':
        filtered = filtered.filter(issue => {
          // Use projectStatus if available, otherwise fallback to legacy fields
          const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
          const statusLower = status.toLowerCase();
          return statusLower === 'backlog' || statusLower === 'to_do';
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
              return filterValues.includes(issue.statusId);
            case 'priority':
              return filterValues.includes(issue.priority);
            case 'type':
              const fvs = (filterValues as string[]).map(v => v.toUpperCase());
              return fvs.includes((issue.type || '').toUpperCase());
            case 'assignee':
              const assigneeId = issue.assigneeId || 'unassigned';
              return filterValues.includes(assigneeId);
            case 'reporter':
              const reporterId = issue.reporterId || 'unassigned';
              return filterValues.includes(reporterId);
            case 'labels':
              if (!issue.labels || issue.labels.length === 0) {
                return filterValues.includes('no-labels');
              }
              return issue.labels.some((label: any) => filterValues.includes(label.id));
            case 'project':
              return filterValues.includes(issue.projectId);
            case 'updatedAt':
              // Handle updatedAt filters
              if (!issue.updatedAt) return false;
              
              const issueUpdatedAt = new Date(issue.updatedAt);
              const today = new Date();
              
              return filterValues.some(filterValue => {
                if (filterValue === 'today') {
                  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                  return issueUpdatedAt >= startOfDay && issueUpdatedAt < endOfDay;
                } else if (filterValue === 'yesterday') {
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
                  const endOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1);
                  return issueUpdatedAt >= startOfYesterday && issueUpdatedAt < endOfYesterday;
                } else if (filterValue === 'last-3-days') {
                  const threeDaysAgo = new Date(today);
                  threeDaysAgo.setDate(today.getDate() - 3);
                  const startOfThreeDaysAgo = new Date(threeDaysAgo.getFullYear(), threeDaysAgo.getMonth(), threeDaysAgo.getDate());
                  return issueUpdatedAt >= startOfThreeDaysAgo;
                } else if (filterValue === 'last-7-days') {
                  const sevenDaysAgo = new Date(today);
                  sevenDaysAgo.setDate(today.getDate() - 7);
                  const startOfSevenDaysAgo = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate());
                  return issueUpdatedAt >= startOfSevenDaysAgo;
                } else if (filterValue === 'last-30-days') {
                  const thirtyDaysAgo = new Date(today);
                  thirtyDaysAgo.setDate(today.getDate() - 30);
                  const startOfThirtyDaysAgo = new Date(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate());
                  return issueUpdatedAt >= startOfThirtyDaysAgo;
                } else if (filterValue.includes(':')) {
                  // Handle custom date range (format: "YYYY-MM-DD:YYYY-MM-DD")
                  try {
                    const [startStr, endStr] = filterValue.split(':');
                    const startDate = new Date(startStr + 'T00:00:00');
                    const endDate = new Date(endStr + 'T23:59:59');
                    
                    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                      return issueUpdatedAt >= startDate && issueUpdatedAt <= endDate;
                    }
                  } catch (error) {
                    console.warn('Invalid date range format:', filterValue);
                  }
                }
                return false;
              });

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
  }, [
    actionFilteredIssues, 
    issueFilterType, 
    searchQuery, 
    JSON.stringify(allFilters), 
    JSON.stringify(viewFiltersState), 
    viewPositionsData?.positions, 
    sortedTempProjectIds, 
    JSON.stringify(originalProjectIds), 
    tempProjectIds.length
  ]);

  const handleUpdateView = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayType: tempDisplayType,
          filters: allFilters,
          sorting: { field: 'manual', direction: 'desc' },
          grouping: { field: tempGrouping },
          fields: tempDisplayProperties,
          projectIds: tempProjectIds,
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

        router.refresh();
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
          projectIds: tempProjectIds,
          filters: allFilters,
          sorting: { field: 'manual', direction: 'desc' },
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



  const handleToggleViewFilters = () => {
    toggleViewFilters();
  };

  // Count issues for filter buttons (must match PageHeader filtering semantics)
  const issueCounts = useMemo(() => {
    let countingIssues = [...actionFilteredIssues];

    // Project selection (same logic as filteredIssues)
    const projectSelectionChanged = JSON.stringify(originalProjectIds) !== JSON.stringify(sortedTempProjectIds);
    if (projectSelectionChanged) {
      if (sortedTempProjectIds.length === 0) {
        countingIssues = [];
      } else {
        countingIssues = countingIssues.filter(issue => sortedTempProjectIds.includes(issue.projectId));
      }
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      countingIssues = countingIssues.filter(issue =>
        issue.title.toLowerCase().includes(q) ||
        issue.issueKey?.toLowerCase().includes(q) ||
        issue.description?.toLowerCase().includes(q)
      );
    }

    // Combined view filters (view + temp)
    Object.entries(allFilters).forEach(([filterKey, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        countingIssues = countingIssues.filter(issue => {
          switch (filterKey) {
            case 'status':
              return filterValues.includes(issue.statusId);
            case 'priority':
              return filterValues.includes(issue.priority);
            case 'type':
              return filterValues.includes(issue.type);
            case 'assignee': {
              const assigneeId = issue.assigneeId || 'unassigned';
              return filterValues.includes(assigneeId);
            }
            case 'reporter': {
              const reporterId = issue.reporterId || 'unassigned';
              return filterValues.includes(reporterId);
            }
            case 'labels':
              if (!issue.labels || issue.labels.length === 0) {
                return filterValues.includes('no-labels');
              }
              return issue.labels.some((label: any) => filterValues.includes(label.id));
            case 'project':
              return filterValues.includes(issue.projectId);

            default:
              return true;
          }
        });
      }
    });

    // Sidebar ViewFilters (assignees, labels, priority, projects)
    if (viewFiltersState.assignees.length > 0) {
      countingIssues = countingIssues.filter(issue => {
        const assigneeId = issue.assignee?.id || 'unassigned';
        return viewFiltersState.assignees.includes(assigneeId);
      });
    }
    if (viewFiltersState.labels.length > 0) {
      countingIssues = countingIssues.filter(issue => {
        if (!issue.labels || issue.labels.length === 0) {
          return viewFiltersState.labels.includes('no-labels');
        }
        return issue.labels.some((label: any) => viewFiltersState.labels.includes(label.id));
      });
    }
    if (viewFiltersState.priority.length > 0) {
      countingIssues = countingIssues.filter(issue => {
        const priority = issue.priority || 'no-priority';
        return viewFiltersState.priority.includes(priority);
      });
    }
    if (viewFiltersState.projects.length > 0) {
      countingIssues = countingIssues.filter(issue => {
        const projectId = issue.project?.id || 'no-project';
        return viewFiltersState.projects.includes(projectId);
      });
    }

    // Now compute counts per tab from the filtered dataset
    const allIssuesCount = countingIssues.length;
    const activeIssuesCount = countingIssues.filter((issue: any) => {
      // Use projectStatus if available, otherwise fallback to legacy fields
      const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
      const statusLower = status.toLowerCase();
      return statusLower !== 'done' && statusLower !== 'backlog' && statusLower !== 'cancelled' && statusLower !== 'to_do';
    }).length;
    const backlogIssuesCount = countingIssues.filter((issue: any) => {
      // Use projectStatus if available, otherwise fallback to legacy fields  
      const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
      const statusLower = status.toLowerCase();
      return statusLower === 'backlog' || statusLower === 'to_do';
    }).length;

    return { allIssuesCount, activeIssuesCount, backlogIssuesCount };
  }, [
    actionFilteredIssues, 
    sortedTempProjectIds, 
    JSON.stringify(originalProjectIds), 
    searchQuery, 
    JSON.stringify(allFilters), 
    JSON.stringify(viewFiltersState)
  ]);

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

  // Persist Kanban column order (project statuses) with debounce batching
  const handleColumnUpdate = (columnId: string, updates: any) => {
    // columnId here is the internal status name (e.g., 'in_progress')
    if (typeof updates?.order === 'number') {
      pendingColumnOrdersRef.current[columnId] = updates.order;

      if (commitColumnOrderRef.current) {
        clearTimeout(commitColumnOrderRef.current);
      }

      commitColumnOrderRef.current = setTimeout(async () => {
        const orders = pendingColumnOrdersRef.current;
        pendingColumnOrdersRef.current = {};

        try {
          const projectIdsToUpdate = (tempProjectIds.length > 0
            ? tempProjectIds
            : view.projects.map(p => p.id));

          const updatesArray = Object.entries(orders)
            .map(([name, order]) => ({ name, order }))
            .sort((a, b) => a.order - b.order);

          await Promise.all(projectIdsToUpdate.map((projectId) =>
            fetch(`/api/projects/${projectId}/statuses/reorder`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: updatesArray })
            })
          ));

          // Refresh statuses used by Kanban columns
          queryClient.invalidateQueries({ queryKey: ['multiple-project-statuses'] });

          toast({ title: 'Columns reordered', description: 'Saved new column order' });
        } catch (error) {
          console.error('Failed to reorder columns:', error);
          toast({ title: 'Error', description: 'Failed to save column order', variant: 'destructive' });
        }
      }, 150);
    }
  };

  const renderViewContent = () => {
    // Single source of truth for Kanban sorting:
    const sharedProps = {
      view: {
        ...view,
        displayType: tempDisplayType,
        grouping: { field: tempGrouping },
        ordering: tempOrdering,
        sorting: { field: tempOrdering, direction: 'desc' },
        fields: tempDisplayProperties
      },
      // Pass filtered (unsorted) issues to Kanban; Kanban columns handle sorting per selected ordering
      issues: filteredIssues,
      workspace,
      currentUser,
      activeFilters: allFilters,
      // Additional props needed by KanbanViewRenderer  
      projectId: tempProjectIds?.[0] || view.projects?.[0]?.id || '',
      workspaceId: workspace.id,
      currentUserId: currentUser.id,
      onIssueCreated: () => {
        // Set flag to force using live data for recent issue creations
        setRecentIssueCreated(true);
        
        // Invalidate queries to refresh data - use the correct query keys
        const currentProjectIds = tempProjectIds.length > 0 ? tempProjectIds : view.projects.map(p => p.id);
        queryClient.invalidateQueries({ 
          queryKey: [...issueKeys.byWorkspace(workspace.id), ...currentProjectIds.sort()] 
        });
        queryClient.invalidateQueries({ queryKey: ['additional-issues', workspace.id] });
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
      onColumnUpdate: handleColumnUpdate,
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
        return (
          <KanbanViewRenderer 
            {...sharedProps}
            onOrderingChange={() => {
              // Sorting is locked; always enforce manual
              setTempOrdering('manual');
            }}
          />
        );
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
      <PageHeader
        icon={VIEW_TYPE_ICONS[view.type as keyof typeof VIEW_TYPE_ICONS] || List}
        title={view.name}
        subtitle={`${filteredIssues.length} ${filteredIssues.length === 1 ? 'issue' : 'issues'}`}
        leftContent={
          hasChanges && (
            <div className="flex items-center gap-1 md:gap-2 flex-wrap min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefaults}
                className={pageHeaderButtonStyles.reset}
              >
                <RotateCcw className="h-3 w-3 lg:mr-1" />
                <span className="hidden lg:inline">Reset</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUpdateView}
                className={pageHeaderButtonStyles.update}
              >
                <Save className="h-3 w-3 lg:mr-1" />
                <span className="hidden lg:inline">Update</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(true)}
                className={pageHeaderButtonStyles.danger}
              >
                <Save className="h-3 w-3 lg:mr-1" />
                <span className="hidden lg:inline">Save as new</span>
              </Button>
            </div>
          )
        }
        search={
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground z-10" />
            <Input
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={pageHeaderSearchStyles}
            />
          </div>
        }
        actions={
          <>
            {/* Follow Project Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleProjectFollow}
              className={cn(
                pageHeaderButtonStyles.ghost,
                isFollowingProject ? "text-red-400 hover:bg-red-500/10" : "text-green-400 hover:bg-green-500/10"
              )}
              disabled={isTogglingFollow}
              aria-pressed={isFollowingProject}
              aria-label={isFollowingProject ? 'Unfollow' : 'Follow'}
            >
              {isFollowingProject ? (
                <BellOff className="h-3 w-3 md:mr-1" />
              ) : (
                <Bell className="h-3 w-3 md:mr-1" />
              )}
              <span className="hidden md:inline ml-1">
                {isFollowingProject ? 'Unfollow' : 'Follow'}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleViewFilters}
              className={pageHeaderButtonStyles.ghost}
            >
              {isViewFiltersOpen ? <EyeOff className="h-3 w-3 md:mr-1" /> : <Eye className="h-3 w-3 md:mr-1" />}
              <span data-text className="hidden md:inline ml-1">View Options</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={pageHeaderButtonStyles.primary}
              onClick={() => setIsNewIssueOpen(true)}
            >
              <Plus className="h-3 w-3 md:mr-1" />
              <span data-text className="hidden md:inline ml-1">New Issue</span>
            </Button>
          </>
        }
      />

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
        projectId={tempProjectIds?.length === 1 ? tempProjectIds[0] : undefined}
        onCreated={() => {
          setIsNewIssueOpen(false);
          queryClient.invalidateQueries();
          router.refresh();
        }}
      />

      {/* Filters and Display Controls Bar */}
      <div className={cn(
        "border-b bg-[#101011] transition-colors",
        // Mobile: Glassmorphism styling
        "border-white/10 bg-black/60 backdrop-blur-xl px-4 py-3",
        // Desktop: Original styling  
        "md:border-[#1a1a1a] md:bg-[#101011] md:backdrop-blur-none md:px-6 md:py-2"
      )}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-2">
          {/* Issue Type Filter Buttons - Full width on mobile */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 md:mr-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIssueFilterType('all')}
              className={cn(
                "h-7 px-3 text-xs border whitespace-nowrap shrink-0",
                "md:h-6 md:px-2",
                issueFilterType === 'all' 
                  ? 'border-blue-400 text-blue-400 bg-blue-500/20 hover:bg-blue-500/30 hover:border-blue-400' 
                  : 'border-white/20 text-gray-400 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
              )}
            >
              All Issues
              <span className="ml-1.5 text-xs opacity-70">{issueCounts.allIssuesCount}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIssueFilterType('active')}
              className={cn(
                "h-7 px-3 text-xs border whitespace-nowrap shrink-0",
                "md:h-6 md:px-2",
                issueFilterType === 'active' 
                  ? 'border-red-400 text-red-400 bg-red-500/20 hover:bg-red-500/30 hover:border-red-400' 
                  : 'border-white/20 text-gray-400 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
              )}
            >
              Active
              <span className="ml-1.5 text-xs opacity-70">{issueCounts.activeIssuesCount}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIssueFilterType('backlog')}
              className={cn(
                "h-7 px-3 text-xs border whitespace-nowrap shrink-0",
                "md:h-6 md:px-2",
                issueFilterType === 'backlog' 
                  ? 'border-gray-400 text-gray-400 bg-gray-500/20 hover:bg-gray-500/30 hover:border-gray-400' 
                  : 'border-white/20 text-gray-400 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
              )}
            >
              Backlog
              <span className="ml-1.5 text-xs opacity-70">{issueCounts.backlogIssuesCount}</span>
            </Button>
          </div>

          {/* Mobile: Filters and View Type in Column */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-2 md:flex-1">
            {/* Badge-like selectors - wrap on mobile */}
            <div className="flex flex-wrap gap-3 md:gap-4">
              <div className="flex flex-wrap gap-1.5 md:gap-1">

                {!view.isDefault && <ViewProjectSelector
                  value={tempProjectIds}
                  onChange={(projectIds) => {
                    setTempProjectIds(projectIds);
                  }}
                  projects={allProjects}
                />}
                <ViewGroupingSelector
                  value={tempGrouping}
                  onChange={setTempGrouping}
                  displayType={tempDisplayType}
                />
                <ViewDisplayPropertiesSelector
                  value={tempDisplayProperties}
                  onChange={setTempDisplayProperties}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 md:gap-1">
              <StatusSelector
                value={allFilters.status || []}
                projectIds={tempProjectIds}
                onChange={(statuses) => {
                  const viewStatuses = view.filters?.status || [];
                  handleFilterChange('status', statuses.sort(), viewStatuses.sort());
                }}
              />
              <PrioritySelector
                value={allFilters.priority || []}
                onChange={(priorities) => {
                  const viewPriorities = view.filters?.priority || [];
                  handleFilterChange('priority', priorities.sort(), viewPriorities.sort());
                }}
              />
              <TypeSelector
                value={allFilters.type || []}
                onChange={(types) => {
                  const viewTypes = view.filters?.type || [];
                  handleFilterChange('type', types.sort(), viewTypes.sort());
                }}
              />
              <AssigneeSelector
                value={allFilters.assignee || []}
                onChange={(assignees) => {
                  const viewAssignees = view.filters?.assignee || [];
                  handleFilterChange('assignee', assignees.sort(), viewAssignees.sort());
                }}
                assignees={workspaceMembers}
              />
              <ReporterSelector
                value={allFilters.reporter || []}
                onChange={(reporters) => {
                  const viewReporters = view.filters?.reporter || [];
                  handleFilterChange('reporter', reporters.sort(), viewReporters.sort());
                }}
                reporters={workspaceMembers}
              />
              <LabelsSelector
                value={allFilters.labels || []}
                onChange={(labels) => {
                  const viewLabels = view.filters?.labels || [];
                  handleFilterChange('labels', labels.sort(), viewLabels.sort());
                }}
                labels={workspaceLabels}
                workspaceId={workspace.id}
                onLabelCreated={(newLabel) => {
                  // Invalidate and refetch workspace labels
                  queryClient.invalidateQueries({ queryKey: ['workspace-labels', workspace.id] });
                }}
              />
              <ViewUpdatedAtSelector
                value={allFilters.updatedAt || []}
                onChange={(updatedAtFilters) => {
                  const viewUpdatedAt = view.filters?.updatedAt || [];
                  handleFilterChange('updatedAt', updatedAtFilters.sort(), viewUpdatedAt.sort());
                }}
              />
              <ActionFiltersSelector
                value={allFilters.actions || []}
                onChange={(actionFilters: ActionFilter[]) => {
                  const viewActions = view.filters?.actions || [];
                  handleFilterChange('actions', actionFilters, viewActions);
                }}
                projectIds={tempProjectIds.length > 0 ? tempProjectIds : view.projects.map(p => p.id)}
                workspaceMembers={workspaceMembers}
              />
              </div>
            </div>

            {/* View Type Toggle - Right aligned on desktop, left on mobile */}
            <div className="flex items-center justify-start md:justify-end">
              <ViewTypeSelector
                selectedType={tempDisplayType}
                onTypeChange={setTempDisplayType}
                variant="toolbar"
                availableTypes={['LIST', 'KANBAN']}
              />
            </div>
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden relative">
        {isLoadingAdditionalIssues && (
          <div className="absolute top-4 right-4 z-10 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-[#8b949e]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Loading additional issues...</span>
            </div>
          </div>
        )}
        {renderViewContent()}
      </div>
    </div>
  );
}
