"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Grid,
  List,
  Table,
  Calendar,
  BarChart3,
  Save,
  Loader2,
} from 'lucide-react';
import KanbanViewRenderer from './renderers/KanbanViewRenderer';
import ListViewRenderer from './renderers/ListViewRenderer';
import TableViewRenderer from './renderers/TableViewRenderer';
import TimelineViewRenderer from './renderers/TimelineViewRenderer';
import PlanningViewRenderer from './renderers/PlanningViewRenderer';

import { useToast } from '@/hooks/use-toast';
import { useViewPositions, mergeIssuesWithViewPositions } from '@/hooks/queries/useViewPositions';
import { useProjects } from '@/hooks/queries/useProjects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIssuesByWorkspace, issueKeys } from '@/hooks/queries/useIssues';
import { useRealtimeWorkspaceEvents } from '@/hooks/useRealtimeWorkspaceEvents';
import { IS_KANBAN_REALTIME_ENABLED } from '@/lib/featureFlags';
import { NewIssueModal } from '@/components/issue';
import { useRouter } from 'next/navigation';
import { useActionFilteredIssues } from '@/hooks/useActionFilteredIssues';

// ─── New filter system ──────────────────────────────────
import { useViewFilterState } from '@/hooks/useViewFilterState';
import type { ActionFilter } from '@/hooks/useViewFilterState';
import ViewTopBar from './shared/ViewTopBar';


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
    projectIds?: string[];
    isDefault: boolean;
    isFavorite: boolean;
    isDynamic?: boolean;
    createdBy: string;
    ownerId?: string;
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
  BOARD: Grid,
  PLANNING: Calendar
};

// ─── Component ──────────────────────────────────────────

export default function ViewRenderer({
  view,
  issues: initialIssues,
  workspace,
  currentUser
}: ViewRendererProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  // ─── UI state ──────────────────────────────────────────
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [isFollowingProject, setIsFollowingProject] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [recentIssueCreated, setRecentIssueCreated] = useState(false);
  const pendingColumnOrdersRef = useRef<Record<string, number>>({});
  const commitColumnOrderRef = useRef<any>(null);

  // ─── New unified filter/config state (URL-persisted) ───
  const filterState = useViewFilterState({ view });
  const {
    scope,
    search,
    filters: activeFilters,
    config: activeConfig,
    setFilter,
    setScope,
    setSearch,
    clearAllFilters,
    setLayout,
    setGroupBy,
    setSortBy,
    setDisplayProperties,
    setProjectIds,
    resetAll,
    activeFilterCount,
    hasChanges,
    getConfigForSave,
    getFiltersForSave,
    savedConfig,
  } = filterState;

  // Derived config fields
  const layout = activeConfig.layout;
  const groupBy = activeConfig.groupBy;
  const displayProperties = activeConfig.displayProperties;
  const projectIds = activeConfig.projectIds;

  // ─── Data fetching (preserved from original) ───────────

  const { data: allProjects = [] } = useProjects({
    workspaceId: workspace.id,
    includeStats: false,
  });

  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspace.id],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspace.id}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');
      const members = await response.json();
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
    staleTime: 5 * 60 * 1000,
  });

  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace-labels', workspace.id],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspace.id}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      const data = await response.json();
      return data.labels || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Realtime subscriptions
  const suppressRealtimeForKanban = layout === 'KANBAN' && !IS_KANBAN_REALTIME_ENABLED;
  useRealtimeWorkspaceEvents({ workspaceId: workspace.id, viewId: view.id }, suppressRealtimeForKanban);

  // View positions for Kanban ordering
  const { data: viewPositionsData, isLoading: isLoadingViewPositions } = useViewPositions(
    view.id,
    !view.isDynamic && (layout === 'KANBAN' || true), // always load for manual ordering
  );

  // Follow state
  const primaryProjectId = useMemo(() => (projectIds?.[0] || view.projects?.[0]?.id || ''), [projectIds, view.projects]);
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
      } catch {
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
      if (res.ok) setIsFollowingProject(prev => !prev);
    } finally {
      setIsTogglingFollow(false);
    }
  }, [primaryProjectId, isFollowingProject, isTogglingFollow]);

  // ─── Issue data merging ────────────────────────────────

  const originalProjectIds = useMemo(() => view.projects.map(p => p.id).sort(), [view.projects]);
  const additionalProjectIds = useMemo(() => {
    return projectIds.filter(id => !originalProjectIds.includes(id));
  }, [projectIds, originalProjectIds]);

  // Check if view has active DB-saved filters
  const hasActiveDbFilters = useMemo(() => {
    if (!view.filters || typeof view.filters !== 'object') return false;
    const filters = view.filters as Record<string, any>;
    return Object.entries(filters).some(([key, value]) => {
      if (key === 'project') return false;
      return Array.isArray(value) && value.length > 0;
    });
  }, [view.filters]);

  // Detect if active filters differ from saved DB filters
  const hasFilterOverrides = useMemo(() => {
    const saved = view.filters || {};
    const simpleKeys = ['status', 'priority', 'type', 'assignee', 'reporter', 'labels', 'updatedAt'];
    for (const key of simpleKeys) {
      const activeArr = (activeFilters as any)[key] || [];
      const savedArr = saved[key] || [];
      if (JSON.stringify([...activeArr].sort()) !== JSON.stringify([...savedArr].sort())) return true;
    }
    if (JSON.stringify(activeFilters.actions || []) !== JSON.stringify(saved.actions || [])) return true;
    return false;
  }, [activeFilters, view.filters]);

  const shouldFetchLiveData = !hasActiveDbFilters || hasFilterOverrides || recentIssueCreated;

  const { data: liveIssuesData } = useIssuesByWorkspace(
    shouldFetchLiveData ? workspace.id : '',
    shouldFetchLiveData ? (projectIds.length > 0 ? projectIds : view.projects.map(p => p.id)) : undefined
  );

  const { data: additionalIssuesData, isLoading: isLoadingAdditionalIssues } = useQuery({
    queryKey: ['additional-issues', workspace.id, additionalProjectIds.sort().join(',')],
    queryFn: async () => {
      if (additionalProjectIds.length === 0) return { issues: [] };
      const params = new URLSearchParams({
        workspaceId: workspace.id,
        projectIds: additionalProjectIds.join(',')
      });
      const response = await fetch(`/api/issues?${params}`);
      if (!response.ok) throw new Error('Failed to fetch additional issues');
      return response.json();
    },
    enabled: additionalProjectIds.length > 0,
    staleTime: 5000,
  });

  const allIssues = useMemo(() => {
    const baseIssues = (hasActiveDbFilters && !hasFilterOverrides && !recentIssueCreated)
      ? initialIssues
      : (liveIssuesData?.issues || initialIssues);
    const additional = additionalIssuesData?.issues || [];
    const issueMap = new Map();
    [...baseIssues, ...additional].forEach(issue => issueMap.set(issue.id, issue));
    return Array.from(issueMap.values());
  }, [initialIssues, liveIssuesData, additionalIssuesData, hasActiveDbFilters, hasFilterOverrides, recentIssueCreated]);

  // ─── 3-Layer Filter Pipeline ───────────────────────────
  // Layer 1: Action filters (async)
  // Layer 2: Scope + all unified filters
  // Layer 3: Search

  const actionFilters = useMemo<ActionFilter[]>(() => {
    return (activeFilters.actions as ActionFilter[]) || [];
  }, [activeFilters.actions]);

  const { filteredIssues: actionFilteredIssues } = useActionFilteredIssues({
    issues: allIssues,
    actionFilters,
    workspaceId: workspace.id
  });

  const sortedProjectIds = useMemo(() => [...projectIds].sort(), [projectIds]);

  const filteredIssues = useMemo(() => {
    let filtered = mergeIssuesWithViewPositions(actionFilteredIssues, viewPositionsData?.positions || []);

    // Project filtering
    const projectSelectionChanged = JSON.stringify(originalProjectIds) !== JSON.stringify(sortedProjectIds);
    if (projectSelectionChanged) {
      if (projectIds.length === 0) {
        filtered = [];
      } else {
        filtered = filtered.filter(issue => sortedProjectIds.includes(issue.projectId));
      }
    }

    // Layer 2a: Scope filter
    switch (scope) {
      case 'active':
        filtered = filtered.filter(issue => {
          const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
          const statusLower = status.toLowerCase();
          return statusLower !== 'done' && statusLower !== 'backlog' && statusLower !== 'cancelled' && statusLower !== 'to_do';
        });
        break;
      case 'backlog':
        filtered = filtered.filter(issue => {
          const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
          const statusLower = status.toLowerCase();
          return statusLower === 'backlog' || statusLower === 'to_do';
        });
        break;
    }

    // Layer 2b: Unified filters (single pass through all filter keys)
    Object.entries(activeFilters).forEach(([filterKey, filterValues]) => {
      if (filterKey === 'actions') return; // Already handled by useActionFilteredIssues
      if (!Array.isArray(filterValues) || filterValues.length === 0) return;

      filtered = filtered.filter(issue => {
        switch (filterKey) {
          case 'status':
            return (filterValues as string[]).includes(issue.statusId);
          case 'priority':
            return (filterValues as string[]).includes(issue.priority);
          case 'type': {
            const fvs = (filterValues as string[]).map(v => v.toUpperCase());
            return fvs.includes((issue.type || '').toUpperCase());
          }
          case 'assignee': {
            const assigneeId = issue.assigneeId || 'unassigned';
            return (filterValues as string[]).includes(assigneeId);
          }
          case 'reporter': {
            const reporterId = issue.reporterId || 'unassigned';
            return (filterValues as string[]).includes(reporterId);
          }
          case 'labels':
            if (!issue.labels || issue.labels.length === 0) {
              return (filterValues as string[]).includes('no-labels');
            }
            return issue.labels.some((label: any) => (filterValues as string[]).includes(label.id));
          case 'project':
            return (filterValues as string[]).includes(issue.projectId);
          case 'updatedAt': {
            if (!issue.updatedAt) return false;
            const issueUpdatedAt = new Date(issue.updatedAt);
            const today = new Date();
            return (filterValues as string[]).some(filterValue => {
              if (filterValue === 'today') {
                const s = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const e = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                return issueUpdatedAt >= s && issueUpdatedAt < e;
              } else if (filterValue === 'yesterday') {
                const y = new Date(today); y.setDate(today.getDate() - 1);
                const s = new Date(y.getFullYear(), y.getMonth(), y.getDate());
                const e = new Date(y.getFullYear(), y.getMonth(), y.getDate() + 1);
                return issueUpdatedAt >= s && issueUpdatedAt < e;
              } else if (filterValue === 'last-3-days') {
                const d = new Date(today); d.setDate(today.getDate() - 3);
                return issueUpdatedAt >= new Date(d.getFullYear(), d.getMonth(), d.getDate());
              } else if (filterValue === 'last-7-days') {
                const d = new Date(today); d.setDate(today.getDate() - 7);
                return issueUpdatedAt >= new Date(d.getFullYear(), d.getMonth(), d.getDate());
              } else if (filterValue === 'last-30-days') {
                const d = new Date(today); d.setDate(today.getDate() - 30);
                return issueUpdatedAt >= new Date(d.getFullYear(), d.getMonth(), d.getDate());
              } else if (filterValue.includes(':')) {
                try {
                  const [startStr, endStr] = filterValue.split(':');
                  const startDate = new Date(startStr + 'T00:00:00');
                  const endDate = new Date(endStr + 'T23:59:59');
                  if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                    return issueUpdatedAt >= startDate && issueUpdatedAt <= endDate;
                  }
                } catch {
                  console.warn('Invalid date range format:', filterValue);
                }
              }
              return false;
            });
          }
          default:
            return true;
        }
      });
    });

    // Layer 3: Search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(issue =>
        issue.title.toLowerCase().includes(q) ||
        issue.issueKey?.toLowerCase().includes(q) ||
        issue.description?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [
    actionFilteredIssues,
    scope,
    search,
    activeFilters,
    viewPositionsData?.positions,
    sortedProjectIds,
    originalProjectIds,
    projectIds.length
  ]);

  // ─── Issue counts for scope tabs ───────────────────────

  const issueCounts = useMemo(() => {
    // Use same base as filtered but without scope and search applied
    let countingIssues = mergeIssuesWithViewPositions(actionFilteredIssues, viewPositionsData?.positions || []);

    // Project filtering (same as above)
    const projectSelectionChanged = JSON.stringify(originalProjectIds) !== JSON.stringify(sortedProjectIds);
    if (projectSelectionChanged) {
      if (sortedProjectIds.length === 0) {
        countingIssues = [];
      } else {
        countingIssues = countingIssues.filter(issue => sortedProjectIds.includes(issue.projectId));
      }
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      countingIssues = countingIssues.filter(issue =>
        issue.title.toLowerCase().includes(q) ||
        issue.issueKey?.toLowerCase().includes(q) ||
        issue.description?.toLowerCase().includes(q)
      );
    }

    // Apply all unified filters (except scope-related)
    Object.entries(activeFilters).forEach(([filterKey, filterValues]) => {
      if (filterKey === 'actions') return;
      if (!Array.isArray(filterValues) || filterValues.length === 0) return;

      countingIssues = countingIssues.filter(issue => {
        switch (filterKey) {
          case 'status': return (filterValues as string[]).includes(issue.statusId);
          case 'priority': return (filterValues as string[]).includes(issue.priority);
          case 'type': return (filterValues as string[]).includes(issue.type);
          case 'assignee': return (filterValues as string[]).includes(issue.assigneeId || 'unassigned');
          case 'reporter': return (filterValues as string[]).includes(issue.reporterId || 'unassigned');
          case 'labels':
            if (!issue.labels || issue.labels.length === 0) return (filterValues as string[]).includes('no-labels');
            return issue.labels.some((label: any) => (filterValues as string[]).includes(label.id));
          case 'project': return (filterValues as string[]).includes(issue.projectId);
          default: return true;
        }
      });
    });

    const allIssuesCount = countingIssues.length;
    const activeIssuesCount = countingIssues.filter((issue: any) => {
      const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
      const sl = status.toLowerCase();
      return sl !== 'done' && sl !== 'backlog' && sl !== 'cancelled' && sl !== 'to_do';
    }).length;
    const backlogIssuesCount = countingIssues.filter((issue: any) => {
      const status = issue.projectStatus?.name || issue.statusValue || issue.status || '';
      const sl = status.toLowerCase();
      return sl === 'backlog' || sl === 'to_do';
    }).length;

    return { allIssuesCount, activeIssuesCount, backlogIssuesCount };
  }, [actionFilteredIssues, sortedProjectIds, originalProjectIds, search, activeFilters, viewPositionsData?.positions]);

  // ─── View save/update ──────────────────────────────────

  const handleIssueUpdate = async (issueId: string, updates: any) => {
    try {
      const response = await fetch(`/api/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update issue');
      return await response.json();
    } catch (error) {
      console.error('Error updating issue:', error);
      toast({ title: "Error", description: "Failed to update issue", variant: "destructive" });
      throw error;
    }
  };

  const handleUpdateView = async () => {
    try {
      const saveData = getConfigForSave();
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
      });

      if (response.ok) {
        toast({ title: 'Success', description: 'View updated successfully' });
        // Clear URL params after save — saved state is now in DB
        resetAll();
        queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        queryClient.refetchQueries({ queryKey: ['views', workspace.id] });
        router.refresh();
      }
    } catch (error) {
      console.error('Error updating view:', error);
      toast({ title: 'Error', description: 'Failed to update view', variant: 'destructive' });
    }
  };

  const handleSaveAsNewView = async () => {
    if (!newViewName.trim()) {
      toast({ title: 'Error', description: 'View name is required', variant: 'destructive' });
      return;
    }

    try {
      const saveData = getConfigForSave();
      const response = await fetch(`/api/workspaces/${workspace.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newViewName,
          description: `Copy of ${view.name}`,
          visibility: 'PERSONAL',
          ...saveData,
        })
      });

      if (response.ok) {
        toast({ title: 'Success', description: 'New view created successfully' });
        setShowSaveDialog(false);
        setNewViewName('');
      }
    } catch (error) {
      console.error('Error creating view:', error);
      toast({ title: 'Error', description: 'Failed to create view', variant: 'destructive' });
    }
  };

  const handleDeleteView = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        toast({ title: 'Success', description: 'View deleted successfully' });
        queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        router.push(`/${workspace.id}/views`);
      }
    } catch (error) {
      console.error('Error deleting view:', error);
      toast({ title: 'Error', description: 'Failed to delete view', variant: 'destructive' });
    }
  };

  // ─── Column order persistence (Kanban) ─────────────────

  const handleColumnUpdate = (columnId: string, updates: any) => {
    if (typeof updates?.order !== 'number') return;

    pendingColumnOrdersRef.current[columnId] = updates.order;

    if (commitColumnOrderRef.current) {
      clearTimeout(commitColumnOrderRef.current);
    }

    commitColumnOrderRef.current = setTimeout(async () => {
      const orders = pendingColumnOrdersRef.current;
      pendingColumnOrdersRef.current = {};

      const groupField = (groupBy || view.grouping?.field || 'status');

      try {
        if (groupField === 'status') {
          const projectIdsToUpdate = (projectIds.length > 0 ? projectIds : view.projects.map(p => p.id));
          const updatesArray = Object.entries(orders)
            .map(([name, order]) => ({ name, order }))
            .sort((a, b) => a.order - b.order);

          await Promise.all(projectIdsToUpdate.map((pid) =>
            fetch(`/api/projects/${pid}/statuses/reorder`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: updatesArray })
            })
          ));

          queryClient.invalidateQueries({ queryKey: ['multiple-project-statuses'] });
        } else {
          const orderedIds = Object.entries(orders)
            .sort((a, b) => (a[1] as number) - (b[1] as number))
            .map(([id]) => id);

          const existingLayout = view?.layout || {};
          const existingOrder = existingLayout.kanbanColumnOrder || {};
          const updatedLayout = {
            ...existingLayout,
            kanbanColumnOrder: { ...existingOrder, [groupField]: orderedIds }
          };

          const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout: updatedLayout })
          });

          if (!response.ok) throw new Error('Failed to update view layout');
          queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        }

        toast({ title: 'Columns reordered', description: 'Saved new column order' });
      } catch (error) {
        console.error('Failed to reorder columns:', error);
        toast({ title: 'Error', description: 'Failed to save column order', variant: 'destructive' });
      }
    }, 150);
  };

  // ─── View content rendering ────────────────────────────

  const renderViewContent = () => {
    const sharedProps = {
      view: {
        ...view,
        displayType: layout,
        grouping: { field: groupBy },
        ordering: 'manual',
        sorting: { field: 'manual', direction: 'desc' },
        fields: displayProperties
      },
      issues: filteredIssues,
      workspace,
      currentUser,
      activeFilters,
      projectId: projectIds?.[0] || view.projects?.[0]?.id || '',
      workspaceId: workspace.id,
      currentUserId: currentUser.id,
      onIssueCreated: () => {
        setRecentIssueCreated(true);
        const currentProjectIds = projectIds.length > 0 ? projectIds : view.projects.map(p => p.id);
        queryClient.invalidateQueries({
          queryKey: [...issueKeys.byWorkspace(workspace.id), ...currentProjectIds.sort()]
        });
        queryClient.invalidateQueries({ queryKey: ['additional-issues', workspace.id] });
        queryClient.invalidateQueries({ queryKey: ['issues'] });
      },
      showSubIssues: true,
      onSubIssuesToggle: () => {},
      onIssueUpdate: handleIssueUpdate,
      onColumnUpdate: handleColumnUpdate,
    };

    switch (layout) {
      case 'KANBAN':
      case 'BOARD':
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
            searchQuery={search}
            onOrderingChange={() => {}}
          />
        );
      case 'LIST':
        return <ListViewRenderer {...sharedProps} />;
      case 'TABLE':
        return <TableViewRenderer {...sharedProps} />;
      case 'TIMELINE':
        return <TimelineViewRenderer {...sharedProps} />;
      case 'PLANNING':
        return <PlanningViewRenderer {...sharedProps} />;
      default:
        return <ListViewRenderer {...sharedProps} />;
    }
  };

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-collab-900">
      {/* View Top Bar — Breadcrumb + Filter + Display + Overflow */}
      <ViewTopBar
        workspace={workspace}
        view={view}
        scope={scope}
        onScopeChange={setScope}
        search={search}
        onSearchChange={setSearch}
        filters={activeFilters}
        onFilterChange={setFilter}
        onClearAllFilters={clearAllFilters}
        activeFilterCount={activeFilterCount}
        issueCounts={issueCounts}
        filteredIssuesCount={filteredIssues.length}
        projectIds={projectIds}
        workspaceMembers={workspaceMembers}
        workspaceLabels={workspaceLabels}
        workspaceId={workspace.id}
        allProjects={allProjects}
        layout={layout}
        onLayoutChange={setLayout}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        sortBy={activeConfig.sortBy}
        onSortByChange={setSortBy}
        displayProperties={displayProperties}
        onDisplayPropertiesChange={setDisplayProperties}
        onProjectIdsChange={setProjectIds}
        isDefaultView={view.isDefault}
        hasChanges={hasChanges}
        onSave={handleUpdateView}
        onReset={resetAll}
        isFollowing={isFollowingProject}
        isTogglingFollow={isTogglingFollow}
        onToggleFollow={toggleProjectFollow}
        onSaveAsNew={() => setShowSaveDialog(true)}
        onDelete={!view.isDefault ? handleDeleteView : undefined}
        onNewIssue={() => setIsNewIssueOpen(true)}
        onLabelCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['workspace-labels', workspace.id] });
        }}
      />

      {/* View Content */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {isLoadingAdditionalIssues && (
          <div className="absolute top-4 right-4 z-10 bg-collab-900 border border-collab-700 rounded-md px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-collab-400">
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
