"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { DropResult } from "@hello-pangea/dnd";
import { createColumns, countIssuesByType } from '../utils';
import { DEFAULT_DISPLAY_PROPERTIES } from '../constants';
import { useMultipleProjectStatuses } from '@/hooks/queries/useProjectStatuses';
import type { 
  KanbanViewRendererProps 
} from '../types';

export const useKanbanState = ({
  view,
  issues,
  onIssueUpdate,
  onColumnUpdate,
  onCreateIssue
}: KanbanViewRendererProps) => {
  const { toast } = useToast();
  const isDraggingRef = useRef(false);
  
  // State management with optimistic updates
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [showSubIssues, setShowSubIssues] = useState(true);
  
  // Local issues state for optimistic updates
  const [localIssues, setLocalIssues] = useState(issues);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, { statusValue: string, viewPosition: number }>>(new Map());

  // Derive local state from props and optimistic updates
  useEffect(() => {
    // A set of updates that are now reflected in the server state (`issues` prop)
    const resolvedUpdates = new Set<string>();

    const issuesToRender = issues.map(serverIssue => {
        if (optimisticUpdates.has(serverIssue.id)) {
            const optimisticUpdate = optimisticUpdates.get(serverIssue.id)!;

            // Check if server state matches optimistic state
            const statusMatches = serverIssue.statusValue === optimisticUpdate.statusValue;
            const positionMatches = serverIssue.viewPosition === optimisticUpdate.viewPosition;

            if (statusMatches && positionMatches) {
                // The server has caught up. We can "resolve" this update.
                resolvedUpdates.add(serverIssue.id);
                return serverIssue; // Use the fresh server data
            } else {
                // The server hasn't caught up yet, keep using the optimistic data
                return {
                    ...serverIssue,
                    statusValue: optimisticUpdate.statusValue,
                    status: optimisticUpdate.statusValue,
                    viewPosition: optimisticUpdate.viewPosition,
                    position: optimisticUpdate.viewPosition,
                };
            }
        }
        return serverIssue;
    });

    setLocalIssues(issuesToRender);

    // If any updates were resolved, remove them from the optimisticUpdates map
    if (resolvedUpdates.size > 0) {
        setOptimisticUpdates(prev => {
            const newMap = new Map(prev);
            resolvedUpdates.forEach(id => newMap.delete(id));
            return newMap;
        });
    }
}, [issues, optimisticUpdates]);

  // Use local issues for UI rendering
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
    return createColumns(filteredIssues, view, projectStatuses);
  }, [filteredIssues, view, projectStatusData]);

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
      
      if (onColumnUpdate) {
        updatedColumns.forEach(col => {
          onColumnUpdate(col.id, { order: col.order });
        });
      }
      
      isDraggingRef.current = false;
      return;
    }

    if (type === 'issue') {
      const issueToMove = localIssues.find((issue: any) => issue.id === draggableId);
      if (!issueToMove) {
        isDraggingRef.current = false;
        return;
      }

      // 1. IMMEDIATE OPTIMISTIC UPDATE - Update local state instantly for smooth UX
      const newLocalIssues = [...localIssues];
      const issueIndex = newLocalIssues.findIndex(issue => issue.id === draggableId);
      const updatedIssue = { ...newLocalIssues[issueIndex] };
      
      // Check if it's the same column (reordering) or different column (status change)
      const isSameColumn = source.droppableId === destination.droppableId;
      
      if (!isSameColumn) {
        // Moving between columns - update status
        const destColumn = columns.find(col => col.id === destination.droppableId);
        if (destColumn) {
          updatedIssue.status = destColumn.id;
          updatedIssue.statusValue = destColumn.id;
        }
      }
      
      // Calculate proper view-specific position based on surrounding issues
      const targetColumnId = isSameColumn ? source.droppableId : destination.droppableId;
      
      // Get current column's issues in their current visual order
      const currentColumn = columns.find(col => col.id === targetColumnId);
      const columnIssues = currentColumn?.issues?.filter(issue => issue.id !== draggableId) || [];

      let newPosition: number;
      if (destination.index === 0) {
        // Moving to top
        const firstPos = columnIssues.length > 0 ? (columnIssues[0].viewPosition ?? columnIssues[0].position ?? 1000) : 1000;
        newPosition = Math.max(firstPos - 1000, 100); // Ensure positive position
      } else if (destination.index >= columnIssues.length) {
        // Moving to bottom
        const lastPos = columnIssues.length > 0 ? (columnIssues[columnIssues.length - 1].viewPosition ?? columnIssues[columnIssues.length - 1].position ?? 1000) : 1000;
        newPosition = lastPos + 1000;
      } else {
        // Moving between issues - use the visual order from the column
        const prevIssue = columnIssues[destination.index - 1];
        const nextIssue = columnIssues[destination.index];
        const prevPosition = prevIssue?.viewPosition ?? prevIssue?.position ?? 0;
        const nextPosition = nextIssue?.viewPosition ?? nextIssue?.position ?? (prevPosition + 2000);
        newPosition = prevPosition + ((nextPosition - prevPosition) / 2);
      }

      updatedIssue.viewPosition = newPosition;
      updatedIssue.position = newPosition;
      newLocalIssues[issueIndex] = updatedIssue;
      
      // Apply optimistic update immediately
      setLocalIssues(newLocalIssues);

      // Register the optimistic update
      const newOptimisticUpdate = { statusValue: targetColumnId, viewPosition: newPosition };
      setOptimisticUpdates(prev => new Map(prev).set(draggableId, newOptimisticUpdate));
      
      // 2. BACKGROUND API CALL - Update database
      try {
        // Update issue status FIRST if moving between columns
        if (!isSameColumn && onIssueUpdate) {
          const destColumn = columns.find(col => col.id === destination.droppableId);
          if (destColumn) {
            await onIssueUpdate(draggableId, {
              status: destColumn.id,
              statusValue: destColumn.id
            });
          }
        }

        // Then update view-specific position
        const positionResponse = await fetch(`/api/views/${view.id}/issue-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueId: draggableId,
            columnId: targetColumnId,
            position: newPosition
          })
        });

        if (!positionResponse.ok) {
          const errorText = await positionResponse.text();
          throw new Error(`Position update failed: ${errorText}`);
        }

        // On success, we don't clear the optimistic lock here. 
        // The useEffect will handle it when the server state catches up.
        window.dispatchEvent(new CustomEvent('invalidateViewPositions', { detail: { viewId: view.id } }));

        toast({
          title: isSameColumn ? "Issue reordered" : "Issue moved",
          description: isSameColumn 
            ? `${issueToMove.title} position updated`
            : `${issueToMove.title} moved to ${columns.find(col => col.id === destination.droppableId)?.name}`
        });
        
      } catch (error) {
        // ERROR HANDLING: Revert UI by removing optimistic lock
        console.error('Failed to update issue:', error);
        setOptimisticUpdates(prev => {
          const newMap = new Map(prev);
          newMap.delete(draggableId);
          return newMap;
        });
        
        toast({
          title: "Error",
          description: "Failed to move issue. Please try again.",
          variant: "destructive"
        });
      }
    }
    
    isDraggingRef.current = false;
  }, [localIssues, columns, onIssueUpdate, onColumnUpdate, toast, view.id]);

  // Issue handlers
  const handleIssueClick = useCallback((issueId: string) => {
    setSelectedIssueId(issueId);
  }, []);

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
    selectedIssueId,
    setSelectedIssueId,
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