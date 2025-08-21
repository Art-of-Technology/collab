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
  EyeOff,
  Loader2
} from 'lucide-react';
import KanbanViewRenderer from './renderers/KanbanViewRenderer';
import ListViewRenderer from './renderers/ListViewRenderer';
import TableViewRenderer from './renderers/TableViewRenderer';
import TimelineViewRenderer from './renderers/TimelineViewRenderer';
import ViewFilters from './shared/ViewFilters';
import ViewTypeSelector from './shared/ViewTypeSelector';
import { ViewProjectSelector } from './selectors/ViewProjectSelector';
import { ViewGroupingSelector } from './selectors/ViewGroupingSelector';
import { ViewOrderingSelector } from './selectors/ViewOrderingSelector';
import { ViewDisplayPropertiesSelector } from './selectors/ViewDisplayPropertiesSelector';
import { StatusSelector } from './selectors/StatusSelector';
import { PrioritySelector } from './selectors/PrioritySelector';
import { TypeSelector } from './selectors/TypeSelector';
import { AssigneeSelector } from './selectors/AssigneeSelector';
import { LabelsSelector } from './selectors/LabelsSelector';
import { useToast } from '@/hooks/use-toast';
import { useViewPositions, mergeIssuesWithViewPositions } from '@/hooks/queries/useViewPositions';
import { useProjects } from '@/hooks/queries/useProjects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIssuesByWorkspace, issueKeys } from '@/hooks/queries/useIssues';
import React, { useEffect } from 'react';
import { NewIssueModal } from '@/components/issue';
import { useRouter } from 'next/navigation';

import { useViewFilters } from '@/context/ViewFiltersContext';
import PageHeader, { pageHeaderButtonStyles, pageHeaderSearchStyles } from '@/components/layout/PageHeader';

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
  const [tempProjectIds, setTempProjectIds] = useState(view.projects.map(p => p.id));
  const [tempShowSubIssues, setTempShowSubIssues] = useState(true);
  const [tempShowEmptyGroups, setTempShowEmptyGroups] = useState(true);
  const [tempCompletedIssues, setTempCompletedIssues] = useState('all');

  // Determine which projects are newly selected (not in original view)
  const originalProjectIds = useMemo(() => view.projects.map(p => p.id), [view.projects]);
  const additionalProjectIds = useMemo(() => {
    return tempProjectIds.filter(id => !originalProjectIds.includes(id));
  }, [tempProjectIds, originalProjectIds]);

  // Fetch live workspace issues to supplement initialIssues, filtered by view's projects
  const { data: liveIssuesData } = useIssuesByWorkspace(
    workspace.id, 
    tempProjectIds.length > 0 ? tempProjectIds : view.projects.map(p => p.id)
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
    // Use live data if available, otherwise fall back to initialIssues
    const baseIssues = liveIssuesData?.issues || initialIssues;
    const additional = additionalIssuesData?.issues || [];
    
    // Remove duplicates by ID when merging
    const issueMap = new Map();
    [...baseIssues, ...additional].forEach(issue => {
      issueMap.set(issue.id, issue);
    });
    
    return Array.from(issueMap.values());
  }, [initialIssues, liveIssuesData, additionalIssuesData]);

  // Use merged issues for filtering
  const issues = allIssues;
  
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
    // Reset temp project IDs when view changes
    setTempProjectIds(view.projects.map(p => p.id));
  }, [view.id, view.displayType, view.grouping?.field, view.sorting?.field, view.fields, view.filters, view.projects]);
  
  // Update ViewFilters context with current data
  useEffect(() => {
    setCurrentView(view);
    setIssues(issues);
    setWorkspace(workspace);
    setCurrentUser(currentUser);
  }, [view, issues, workspace, currentUser, setCurrentView, setIssues, setWorkspace, setCurrentUser]);

  // Issue type filtering state
  const [issueFilterType, setIssueFilterType] = useState<'all' | 'active' | 'backlog'>('all');

  // Check if current state differs from last saved state
  const hasChanges = useMemo(() => {
    return (
      Object.keys(tempFilters).length > 0 ||
      tempDisplayType !== lastSavedState.displayType ||
      tempGrouping !== lastSavedState.grouping ||
      tempOrdering !== lastSavedState.ordering ||
      JSON.stringify(tempDisplayProperties) !== JSON.stringify(lastSavedState.displayProperties) ||
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
    
    // Apply project filtering if tempProjectIds differs from original view projects
    const originalProjectIds = view.projects.map(p => p.id).sort();
    const currentProjectIds = tempProjectIds.sort();
    const projectSelectionChanged = JSON.stringify(originalProjectIds) !== JSON.stringify(currentProjectIds);
    
    if (projectSelectionChanged) {
      if (tempProjectIds.length === 0) {
        // If no projects selected, show no issues
        filtered = [];
      } else {
        // Filter to selected projects
        filtered = filtered.filter(issue => {
          return tempProjectIds.includes(issue.projectId);
        });
      }
    }
    
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
              return filterValues.includes(issue.statusValue || issue.status);
            case 'priority':
              return filterValues.includes(issue.priority);
            case 'type':
              return filterValues.includes(issue.type);
            case 'assignee':
              const assigneeId = issue.assigneeId || 'unassigned';
              return filterValues.includes(assigneeId);
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
  }, [issues, issueFilterType, searchQuery, allFilters, viewFiltersState, viewPositionsData, tempProjectIds, view.projects]);

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



  const handleToggleViewFilters = () => {
    toggleViewFilters();
  };

  // Count issues for filter buttons (must match PageHeader filtering semantics)
  const issueCounts = useMemo(() => {
    let countingIssues = [...issues];

    // Project selection (same logic as filteredIssues)
    const originalProjectIds = view.projects.map(p => p.id).sort();
    const currentProjectIds = tempProjectIds.sort();
    const projectSelectionChanged = JSON.stringify(originalProjectIds) !== JSON.stringify(currentProjectIds);
    if (projectSelectionChanged) {
      if (tempProjectIds.length === 0) {
        countingIssues = [];
      } else {
        countingIssues = countingIssues.filter(issue => tempProjectIds.includes(issue.projectId));
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
              return filterValues.includes(issue.statusValue || issue.status);
            case 'priority':
              return filterValues.includes(issue.priority);
            case 'type':
              return filterValues.includes(issue.type);
            case 'assignee': {
              const assigneeId = issue.assigneeId || 'unassigned';
              return filterValues.includes(assigneeId);
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
      const status = (issue.statusValue || issue.status || '').toLowerCase();
      return status !== 'done' && status !== 'backlog' && status !== 'cancelled' && status !== 'todo';
    }).length;
    const backlogIssuesCount = countingIssues.filter((issue: any) => {
      const status = (issue.statusValue || issue.status || '').toLowerCase();
      return status === 'backlog' || status === 'todo';
    }).length;

    return { allIssuesCount, activeIssuesCount, backlogIssuesCount };
  }, [issues, tempProjectIds, view.projects, searchQuery, allFilters, viewFiltersState]);

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
      projectId: tempProjectIds?.[0] || view.projects?.[0]?.id || '',
      workspaceId: workspace.id,
      currentUserId: currentUser.id,
      onIssueCreated: () => {
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
      <PageHeader
        icon={VIEW_TYPE_ICONS[view.type as keyof typeof VIEW_TYPE_ICONS] || List}
        title={view.name}
        subtitle={`${sortedIssues.length} ${sortedIssues.length === 1 ? 'issue' : 'issues'}`}
        leftContent={
          hasChanges && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefaults}
                className={pageHeaderButtonStyles.reset}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUpdateView}
                className={pageHeaderButtonStyles.update}
              >
                <Save className="h-3 w-3 mr-1" />
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(true)}
                className={pageHeaderButtonStyles.danger}
              >
                <Save className="h-3 w-3 mr-1" />
                Save as new
              </Button>
            </div>
          )
        }
        search={
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-[#666]" />
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleViewFilters}
              className={pageHeaderButtonStyles.ghost}
            >
              {isViewFiltersOpen ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              View Options
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={pageHeaderButtonStyles.primary}
              onClick={() => setIsNewIssueOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              New Issue
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

            {/* Badge-like selectors matching CreateViewModal */}
            <div className="flex flex-wrap gap-1">
              <ViewProjectSelector
                value={tempProjectIds}
                onChange={(projectIds) => {
                  // Handle project selection changes
                  // This will be stored as temporary changes and can be saved as a new view or update current view
                  setTempProjectIds(projectIds);
                }}
                projects={allProjects}
              />
              <ViewGroupingSelector
                value={tempGrouping}
                onChange={setTempGrouping}
                displayType={tempDisplayType}
              />
              <ViewOrderingSelector
                value={tempOrdering}
                onChange={setTempOrdering}
                displayType={tempDisplayType}
              />
              <ViewDisplayPropertiesSelector
                value={tempDisplayProperties}
                onChange={setTempDisplayProperties}
              />
              <StatusSelector
                value={allFilters.status || []}
                onChange={(statuses) => {
                  const viewStatuses = view.filters?.status || [];
                  const isDifferent = JSON.stringify(statuses.sort()) !== JSON.stringify(viewStatuses.sort());
                  if (isDifferent) {
                    setTempFilters(prev => ({ ...prev, status: statuses }));
                  } else {
                    const { status, ...rest } = tempFilters;
                    setTempFilters(rest);
                  }
                }}
              />
              <PrioritySelector
                value={allFilters.priority || []}
                onChange={(priorities) => {
                  const viewPriorities = view.filters?.priority || [];
                  const isDifferent = JSON.stringify(priorities.sort()) !== JSON.stringify(viewPriorities.sort());
                  if (isDifferent) {
                    setTempFilters(prev => ({ ...prev, priority: priorities }));
                  } else {
                    const { priority, ...rest } = tempFilters;
                    setTempFilters(rest);
                  }
                }}
              />
              <TypeSelector
                value={allFilters.type || []}
                onChange={(types) => {
                  const viewTypes = view.filters?.type || [];
                  const isDifferent = JSON.stringify(types.sort()) !== JSON.stringify(viewTypes.sort());
                  if (isDifferent) {
                    setTempFilters(prev => ({ ...prev, type: types }));
                  } else {
                    const { type, ...rest } = tempFilters;
                    setTempFilters(rest);
                  }
                }}
              />
              <AssigneeSelector
                value={allFilters.assignee || []}
                onChange={(assignees) => {
                  const viewAssignees = view.filters?.assignee || [];
                  const isDifferent = JSON.stringify(assignees.sort()) !== JSON.stringify(viewAssignees.sort());
                  if (isDifferent) {
                    setTempFilters(prev => ({ ...prev, assignee: assignees }));
                  } else {
                    const { assignee, ...rest } = tempFilters;
                    setTempFilters(rest);
                  }
                }}
                assignees={workspaceMembers}
              />
              <LabelsSelector
                value={allFilters.labels || []}
                onChange={(labels) => {
                  const viewLabels = view.filters?.labels || [];
                  const isDifferent = JSON.stringify(labels.sort()) !== JSON.stringify(viewLabels.sort());
                  if (isDifferent) {
                    setTempFilters(prev => ({ ...prev, labels }));
                  } else {
                    const { labels, ...rest } = tempFilters;
                    setTempFilters(rest);
                  }
                }}
                labels={workspaceLabels}
              />
            </div>
          </div>

          {/* Right: View Type Toggle */}
          <div className="flex items-center gap-2">
            <ViewTypeSelector
              selectedType={tempDisplayType}
              onTypeChange={setTempDisplayType}
              variant="toolbar"
              availableTypes={['LIST', 'KANBAN', 'TIMELINE']}
            />
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