"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { DropResult } from "@hello-pangea/dnd";
import { createColumns, countIssuesByType } from '../utils';
import { DEFAULT_DISPLAY_PROPERTIES } from '../constants';
import { useMultipleProjectStatuses } from '@/hooks/queries/useProjectStatuses';
import { useUpdateIssue, useCreateIssue, issueKeys } from '@/hooks/queries/useIssues';
import { useQueryClient } from '@tanstack/react-query';
import type { 
  KanbanViewRendererProps 
} from '../types';

export const useKanbanState = ({
  view,
  issues,
  workspace,
  onIssueUpdate,
  onColumnUpdate,
  onCreateIssue
}: KanbanViewRendererProps) => {
  const { toast } = useToast();
  const isDraggingRef = useRef(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const updateIssueMutation = useUpdateIssue();
  const createIssueMutation = useCreateIssue();
  
  // State management with optimistic updates
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [showSubIssues, setShowSubIssues] = useState(true);
  
  // Local state for immediate UI updates during drag & drop
  const [localIssues, setLocalIssues] = useState(issues);
  const [localColumnOrder, setLocalColumnOrder] = useState<string[] | null>(null);
  
  // Update local issues when props change (from server)
  useEffect(() => {
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
    const projectStatuses = projectStatusData?.statuses || [];
    const baseColumns = createColumns(filteredIssues, view, projectStatuses);
    if (localColumnOrder && view.grouping?.field === 'status') {
      const indexById = new Map(localColumnOrder.map((id, idx) => [id, idx]));
      return baseColumns.map((col: any) => ({
        ...col,
        order: indexById.has(col.id) ? (indexById.get(col.id) as number) : col.order,
      }));
    }
    return baseColumns;
  }, [filteredIssues, view, projectStatusData, localColumnOrder]);

  // Count issues for filter buttons
  const issueCounts = useMemo(() => {
    return countIssuesByType(issues);
  }, [issues]);

  // Drag and drop handlers
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;

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
      }
      newLocalIssues[issueIndex] = updatedIssue;
      setLocalIssues(newLocalIssues);

      try {
        if (!isSameColumn) {
          await updateIssueMutation.mutateAsync({ id: draggableId, status: updatedIssue.status, statusValue: updatedIssue.statusValue });
        }
        await fetch(`/api/views/${view.id}/issue-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueId: draggableId, columnId: targetColumnId, position: newPosition })
        });
      } catch (err) {
        console.error('Failed to persist reorder:', err);
      }
    }
    
    isDraggingRef.current = false;
  }, [localIssues, columns, updateIssueMutation, onColumnUpdate, toast, view.id, queryClient, workspace.id]);

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

  // Display properties
  const displayProperties = view.fields || DEFAULT_DISPLAY_PROPERTIES;

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
    
    // Handlers
    handleDragStart,
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