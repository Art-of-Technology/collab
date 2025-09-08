"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { DropResult } from "@hello-pangea/dnd";
import { createColumns, countIssuesByType } from '../utils';
import { DEFAULT_DISPLAY_PROPERTIES } from '../constants';
import { useMultipleProjectStatuses } from '@/hooks/queries/useProjectStatuses';
import { useUpdateIssue } from '@/hooks/queries/useIssues';
import type { 
  KanbanViewRendererProps 
} from '../types';

export const useKanbanState = ({
  view,
  issues,
  workspace,
  onIssueUpdate,
  onColumnUpdate,
  onCreateIssue,
  activeFilters
}: KanbanViewRendererProps) => {
  const { toast } = useToast();
  const isDraggingRef = useRef(false);
  const router = useRouter();
  const updateIssueMutation = useUpdateIssue();
  
  // State management with optimistic updates
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [showSubIssues, setShowSubIssues] = useState(true);

  const [hoverState, setHoverState] = useState<{ canDrop: boolean, columnId: string }>({ canDrop: true, columnId: '' });
  
  // Local state for immediate UI updates during drag & drop
  const [localIssues, setLocalIssues] = useState(issues);
  const [localColumnOrder, setLocalColumnOrder] = useState<string[] | null>(null);
  const previousIssuesRef = useRef<any[] | null>(null);
  
  // Update local issues when props change (from server),
  // but don't override while a drag/drop optimistic update is in-flight
  useEffect(() => {
    if (isDraggingRef.current) return;
    setLocalIssues(issues);
  }, [issues]);
  
  const filteredIssues = localIssues;

  // Get project IDs from the view configuration
  const projectIds = useMemo(() => {
    return view.projectIds || view.projects?.map((p: any) => p.id) || [];
  }, [view.projectIds, view.projects]);

  // Fetch project statuses for the projects in this view
  const { data: projectStatusData, isLoading: isLoadingStatuses } = useMultipleProjectStatuses(
    projectIds,
    view.grouping?.field === 'status'
  );

  // Group issues by the specified field (default to status)
  const columns = useMemo(() => {
    // Avoid showing fallback default columns while statuses are loading for status grouping
    const groupField = view.grouping?.field || 'status';
    if (groupField === 'status' && isLoadingStatuses) {
      return [] as ReturnType<typeof createColumns>;
    }

    const projectStatuses = projectStatusData?.statuses || [];
    // Map selected status IDs (from filters) to status names across projects
    let allowedStatusNames: string[] | undefined = undefined;
    if (groupField === 'status') {
      const selectedStatusIds: string[] = Array.isArray((activeFilters as any)?.status)
        ? ((activeFilters as any).status as string[])
        : [];
      if (selectedStatusIds.length > 0 && Array.isArray(projectStatusData?.projectStatuses)) {
        const idSet = new Set(selectedStatusIds);
        const namesSet = new Set<string>();
        projectStatusData.projectStatuses.forEach((ps: any) => {
          // dbId added in useProjectStatuses to keep original database id
          if (ps.dbId && idSet.has(ps.dbId)) {
            namesSet.add(ps.name);
          }
        });
        allowedStatusNames = Array.from(namesSet);
      }
    }

    const baseColumns = createColumns(filteredIssues, view, projectStatuses as any[], allowedStatusNames);
    if (localColumnOrder && view.grouping?.field === 'status') {
      const indexById = new Map(localColumnOrder.map((id, idx) => [id, idx]));
      return baseColumns
        .map((col: any) => ({
          ...col,
          order: indexById.has(col.id) ? (indexById.get(col.id) as number) : col.order,
        }))
        .sort((a: any, b: any) => a.order - b.order);
    }
    return baseColumns;
  }, [filteredIssues, view, projectStatusData, isLoadingStatuses, localColumnOrder, activeFilters]);

  // Count issues for filter buttons
  const issueCounts = useMemo(() => {
    return countIssuesByType(issues);
  }, [issues]);

  // Helper function to validate if an issue can be moved to a target column
  const canIssueMoveTo = useCallback((issue: any, targetColumnId: string): boolean => {
    // Allow movement within the same column (reordering)
    if (issue.projectStatus?.name === targetColumnId || 
        issue.statusValue === targetColumnId || 
        issue.status === targetColumnId) {
      return true;
    }

    // If we don't have project statuses data, allow movement (fallback behavior)
    if (!projectStatusData?.projectStatuses) {
      return true;
    }

    // Find the project-specific statuses for the issue's project
    const projectSpecificStatuses = projectStatusData.projectStatuses.filter(
      (ps: any) => ps.projectId === issue.projectId
    );

    // If no project-specific statuses found, allow movement to common columns
    if (projectSpecificStatuses.length === 0) {
      return true;
    }

    // Check if the target column exists in the issue's project statuses
    const targetStatusExists = projectSpecificStatuses.some(
      (ps: any) => ps.name === targetColumnId
    );

    return targetStatusExists;
  }, [projectStatusData]);

  // Track the currently dragged issue and hover state for visual feedback
  const [draggedIssue, setDraggedIssue] = useState<any>(null);

  // Drag and drop handlers
  const handleDragStart = useCallback((start: any) => {
    isDraggingRef.current = true;
    if (start.type === 'issue') {
      const issue = localIssues.find((i: any) => i.id === start.draggableId);
      setDraggedIssue(issue);
    }
  }, [localIssues]);

  const handleDragUpdate = useCallback((update: any) => {
    if (!update.destination) {
      setHoverState({ canDrop: true, columnId: '' });
      return;
    }
    
    if (update.type === 'issue' && update.destination) {
      const targetColumnId = update.destination.droppableId;
      
      // Find the dragged issue and check if it can be moved to the target column
      if (draggedIssue) {
        const canDrop = canIssueMoveTo(draggedIssue, targetColumnId);

        setHoverState({ canDrop, columnId: targetColumnId });
      }
    } else {
      setHoverState({ canDrop: true, columnId: '' });
    }
  }, [draggedIssue, canIssueMoveTo]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;

    if (!hoverState.canDrop) {
      isDraggingRef.current = false;
      setHoverState({ canDrop: true, columnId: '' });
      toast({
        title: "Cannot drop issue",
        description: `Issue ${draggedIssue?.title} cannot be dropped to column ${hoverState.columnId}`,
        variant: "destructive"
      });
      
      return;
    }

    if (!destination) {
      isDraggingRef.current = false;
      return;
    }
    
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      isDraggingRef.current = false;
      return;
    }

    if (type === 'column') {
      // Handle column reordering
      const newColumns = Array.from(columns);
      const [reorderedColumn] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, reorderedColumn);
      
      // Update column orders
      const updatedColumns = newColumns.map((col, index) => ({
        ...col,
        order: index
      }));
      // Optimistically reflect new order in UI
      setLocalColumnOrder(updatedColumns.map((c) => c.id));
      
      if (onColumnUpdate) {
        updatedColumns.forEach(col => {
          onColumnUpdate(col.id, { order: col.order });
        });
      }
      
      isDraggingRef.current = false;
      return;
    }

    if (type === 'issue') {
      const isSameColumn = source.droppableId === destination.droppableId;
      const targetColumnId = isSameColumn ? source.droppableId : destination.droppableId;

      // Snapshot for rollback
      previousIssuesRef.current = localIssues;

      const newLocalIssues = [...localIssues];
      const issueIndex = newLocalIssues.findIndex((i: any) => i.id === draggableId);
      if (issueIndex === -1) { isDraggingRef.current = false; return; }

      const targetColumn = columns.find(col => col.id === targetColumnId);
      if (!targetColumn) { isDraggingRef.current = false; return; }

      // Build neighbor context and compute a middle position
      const items = targetColumn.issues.filter((i: any) => i.id !== draggableId);
      const destIndex = isSameColumn && destination.index > source.index ? destination.index - 1 : destination.index;
      const getPos = (it: any) => (it?.viewPosition ?? it?.position ?? 0);
      const prev = destIndex > 0 ? items[destIndex - 1] : undefined;
      const next = destIndex < items.length ? items[destIndex] : undefined;
      const newPosition = prev && next
        ? (getPos(prev) + getPos(next)) / 2
        : prev
          ? getPos(prev) + 1
          : next
            ? getPos(next) - 1
            : 0;

      const updatedIssue: any = { ...newLocalIssues[issueIndex], viewPosition: newPosition, position: newPosition };
      if (!isSameColumn) {
        updatedIssue.status = targetColumnId;
        updatedIssue.statusValue = targetColumnId;
        if ((view?.grouping?.field || 'status') === 'status') {
          updatedIssue.projectStatus = { name: targetColumnId, displayName: targetColumn.name };
        }
      }
      newLocalIssues[issueIndex] = updatedIssue;
      setLocalIssues(newLocalIssues);

      const requests: Promise<any>[] = [];
      if (!isSameColumn) {
        requests.push(updateIssueMutation.mutateAsync({ id: draggableId, status: updatedIssue.status, statusValue: updatedIssue.statusValue }));
      }
      requests.push(
        fetch(`/api/views/${view.id}/issue-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueId: draggableId, columnId: targetColumnId, position: newPosition })
        })
      );
      Promise.all(requests).catch((err) => {
        console.error('Failed to persist reorder:', err);
        // Rollback on failure
        if (previousIssuesRef.current) {
          setLocalIssues(previousIssuesRef.current);
        }
        toast({
          variant: 'destructive',
          title: 'Reorder failed',
          description: 'Could not save new position. Restored previous order.'
        });
      }).finally(() => {
        isDraggingRef.current = false;
      });
      return;
    }
    
    // Clear dragged issue and hover state
    setDraggedIssue(null);
    setHoverState({ canDrop: true, columnId: '' });
    isDraggingRef.current = false;
  }, [localIssues, columns, updateIssueMutation, onColumnUpdate, view.id, hoverState.canDrop, hoverState.columnId, draggedIssue?.title, toast, view?.grouping?.field]);

  // Issue handlers
  const handleIssueClick = useCallback((issueIdOrKey: string) => {
    // Navigate directly to the issue page (Linear-style)
    // Use workspace slug if available, else id; fallback to issue's workspaceId
    const sampleIssue = issues.find((i) => i.id === issueIdOrKey || i.issueKey === issueIdOrKey) || issues[0];
    const workspaceSegment = (workspace as any)?.slug || (workspace as any)?.id || sampleIssue?.workspaceId || (view as any)?.workspaceId;
    
    // Build URL with view context for proper back navigation
    const viewParams = view?.slug ? `?view=${view.slug}&viewName=${encodeURIComponent(view.name)}` : '';
    
    if (workspaceSegment) {
      router.push(`/${workspaceSegment}/issues/${issueIdOrKey}${viewParams}`);
    } else {
      router.push(`/issues/${issueIdOrKey}${viewParams}`);
    }
  }, [issues, router, view, workspace]);

  const handleCreateIssue = useCallback(async (columnId: string) => {
    if (!newIssueTitle.trim()) return;
    
    const column = columns.find(col => col.id === columnId);
    if (!column) return;
    
    const issueData = {
      title: newIssueTitle,
      status: column.id,  // Use internal name, not display name
      statusValue: column.id,
      type: 'TASK'
    };
    
    if (onCreateIssue) {
      await onCreateIssue(columnId, issueData);
    }
    
    setNewIssueTitle('');
    setIsCreatingIssue(null);
    
    toast({
      title: "Issue created",
      description: `${newIssueTitle} created in ${column.name}`
    });
  }, [newIssueTitle, columns, onCreateIssue, toast]);

  // Column handlers
  const handleColumnEdit = useCallback((columnId: string, name: string) => {
    if (onColumnUpdate) {
      onColumnUpdate(columnId, { name });
    }
    setEditingColumnId(null);
    setNewColumnName('');
  }, [onColumnUpdate]);

  // Sub-issues toggle handler
  const handleToggleSubIssues = useCallback(() => {
    setShowSubIssues(prev => !prev);
  }, []);

  // Display properties: use raw values; respect empty array; fallback only if undefined
  const displayProperties = useMemo(() => {
    if (Array.isArray(view.fields)) return view.fields;
    return DEFAULT_DISPLAY_PROPERTIES;
  }, [view.fields]);

  // Event handlers for UI interactions
  const handleStartCreatingIssue = useCallback((columnId: string) => {
    setIsCreatingIssue(columnId);
  }, []);

  const handleCancelCreatingIssue = useCallback(() => {
    setIsCreatingIssue(null);
    setNewIssueTitle('');
  }, []);

  const handleIssueKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isCreatingIssue) {
      handleCreateIssue(isCreatingIssue);
    } else if (e.key === 'Escape') {
      handleCancelCreatingIssue();
    }
  }, [isCreatingIssue, handleCreateIssue, handleCancelCreatingIssue]);

  const handleStartEditingColumn = useCallback((columnId: string, name: string) => {
    setEditingColumnId(columnId);
    setNewColumnName(name);
  }, []);

  const handleCancelEditingColumn = useCallback(() => {
    setEditingColumnId(null);
    setNewColumnName('');
  }, []);

  const handleColumnKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && editingColumnId) {
      handleColumnEdit(editingColumnId, newColumnName);
    } else if (e.key === 'Escape') {
      handleCancelEditingColumn();
    }
  }, [editingColumnId, newColumnName, handleColumnEdit, handleCancelEditingColumn]);

  return {
    // State
    editingColumnId,
    newColumnName,
    setNewColumnName,
    isCreatingIssue,
    newIssueTitle,
    setNewIssueTitle,
    
    // Computed values
    filteredIssues,
    columns,
    issueCounts,
    displayProperties,
    showSubIssues,
    isLoadingStatuses,
    draggedIssue,
    hoverState,
    
    // Handlers
    handleDragStart,
    handleDragUpdate,
    handleDragEnd,
    handleIssueClick,
    handleCreateIssue,
    handleColumnEdit,
    handleToggleSubIssues,
    handleStartCreatingIssue,
    handleCancelCreatingIssue,
    handleIssueKeyDown,
    handleStartEditingColumn,
    handleCancelEditingColumn,
    handleColumnKeyDown
  };
};