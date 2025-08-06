"use client";

import { useState, useMemo, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { DropResult } from "@hello-pangea/dnd";
import { createColumns, countIssuesByType } from '../utils';
import { DEFAULT_DISPLAY_PROPERTIES } from '../constants';
import type { 
  KanbanState, 
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
  
  // State management
  const [kanbanState, setKanbanState] = useState<KanbanState>({
    columns: [],
    showSubIssues: true
  });
  
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
  const [newIssueTitle, setNewIssueTitle] = useState('');

  // Issues are already filtered at ViewRenderer level, just use them directly
  const filteredIssues = issues;

  // Group issues by the specified field (default to status)
  const columns = useMemo(() => {
    return createColumns(filteredIssues, view);
  }, [filteredIssues, view.grouping]);

  // Count issues for filter buttons
  const issueCounts = useMemo(() => {
    return countIssuesByType(issues);
  }, [issues]);

  // Drag and drop handlers
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    isDraggingRef.current = false;
    const { destination, source, draggableId, type } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
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
      
      return;
    }

    if (type === 'issue') {
      // Handle issue moving between columns
      const sourceColumnIndex = columns.findIndex(col => col.id === source.droppableId);
      const destColumnIndex = columns.findIndex(col => col.id === destination.droppableId);
      
      if (sourceColumnIndex === -1 || destColumnIndex === -1) return;
      
      const sourceColumn = columns[sourceColumnIndex];
      const destColumn = columns[destColumnIndex];
      const issueToMove = sourceColumn.issues.find((issue: any) => issue.id === draggableId);
      
      if (!issueToMove) return;
      
      // Update issue status based on destination column
      const newStatus = destColumn.name;
      
      if (onIssueUpdate) {
        await onIssueUpdate(draggableId, {
          status: newStatus,
          columnId: destination.droppableId
        });
      }
      
      toast({
        title: "Issue moved",
        description: `${issueToMove.title} moved to ${newStatus}`
      });
    }
  }, [columns, onIssueUpdate, onColumnUpdate, toast]);

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
      status: column.name,
      columnId: columnId,
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
    setKanbanState(prev => ({ 
      ...prev, 
      showSubIssues: !prev.showSubIssues 
    }));
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
    kanbanState,
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