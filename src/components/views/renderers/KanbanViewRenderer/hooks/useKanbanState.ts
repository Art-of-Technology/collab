"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { DropResult } from "@hello-pangea/dnd";
import { createColumns, countIssuesByType } from '../utils';
import { DEFAULT_DISPLAY_PROPERTIES } from '../constants';
import { useMultipleProjectStatuses } from '@/hooks/queries/useProjectStatuses';
import { useUpdateIssue } from '@/hooks/queries/useIssues';
import { VIEW_POSITION_GAP } from '@/constants/viewPositions';
import { markIssueAsDragging, markOperationCompleted } from '@/hooks/useRealtimeWorkspaceEvents';
import { flushSync } from 'react-dom';

// Helper function to detect tight spacing or position conflicts that require repositioning
function detectTightSpacing(bulk: Array<{issueId: string, columnId: string, position: number}>): boolean {
  if (bulk.length <= 1) return false;
  
  // Sort by position to check gaps
  const sortedBulk = [...bulk].sort((a, b) => a.position - b.position);
  
  // Check for duplicates (exact position conflicts)
  const positions = sortedBulk.map(item => item.position);
  const uniquePositions = new Set(positions);
  if (uniquePositions.size !== positions.length) {
    return true; // Found duplicate positions
  }
  
  // Check for tight spacing (gaps smaller than minimum threshold)
  const minGap = VIEW_POSITION_GAP / 2; // 512 - anything tighter needs repositioning
  for (let i = 0; i < sortedBulk.length - 1; i++) {
    const gap = sortedBulk[i + 1].position - sortedBulk[i].position;
    if (gap < minGap) {
      return true; // Found tight spacing
    }
  }
  
  return false; // Spacing is fine
}
import type { 
  KanbanViewRendererProps 
} from '../types';

export const useKanbanState = ({
  view,
  issues,
  workspace,
  onColumnUpdate,
  onCreateIssue,
  activeFilters,
  onOrderingChange
}: KanbanViewRendererProps) => {
  const { toast } = useToast();
  const isDraggingRef = useRef(false);
  const operationsInProgressRef = useRef<Set<string>>(new Set());
  const operationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const stateVersionRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const pendingRequestsRef = useRef<Map<string, { sequence: number, batchId: string }>>(new Map());
  const lastDragOperationRef = useRef<number>(0);
  const router = useRouter();
  const updateIssueMutation = useUpdateIssue();
  
  // State management with optimistic updates
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [showSubIssues, setShowSubIssues] = useState(true);
  const [operationsInProgress, setOperationsInProgress] = useState<Set<string>>(new Set());
  
  // Removed corruption watcher - React closure issue identified and resolved
  
  // Removed debug logging - drag and drop issues resolved
  const [hasPendingPositionUpdates, setHasPendingPositionUpdates] = useState(false);

  const [hoverState, setHoverState] = useState<{ canDrop: boolean, columnId: string }>({ canDrop: true, columnId: '' });
  
  // Local state for immediate UI updates during drag & drop
  const [localIssues, setLocalIssues] = useState(issues);
  const [localColumnOrder, setLocalColumnOrder] = useState<string[] | null>(null);
  const previousIssuesRef = useRef<any[] | null>(null);
  const previousOrderingMethod = useRef<string | null>(null);
  
  // Update local issues when props change (from server),
  // but don't override while a drag/drop optimistic update is in-flight
  useEffect(() => {
    if (isDraggingRef.current || operationsInProgressRef.current.size > 0) return;
    
    // Additional protection: don't override if we have recent local changes that might not be reflected yet
    const hasRecentLocalChanges = localIssues.some(localIssue => {
      const serverIssue = issues.find(issue => issue.id === localIssue.id);
      if (!serverIssue) return false;
      
      // Check if local issue has different status than server issue (recent cross-column move)
      return localIssue.status !== serverIssue.status || 
             localIssue.statusValue !== serverIssue.statusValue;
    });
    
    // Allow server data update if enough time has passed since last drag operation (60 seconds)
    const timeSinceLastDrag = Date.now() - lastDragOperationRef.current;
    const shouldAllowServerUpdate = timeSinceLastDrag > 60000; // Fixed: 60 seconds = 60000ms
    
    // Sync check for server data vs local optimistic changes
    
    if (hasRecentLocalChanges && !shouldAllowServerUpdate) {
      // Skip server data update to preserve recent local changes
      return;
    }
    
    if (operationsInProgressRef.current.size > 0) {
      return;
    }
    
    // Additional safeguard: if we just updated localIssues very recently, skip to prevent override
    const timeSinceStateUpdate = Date.now() - (lastDragOperationRef.current || 0);
    if (timeSinceStateUpdate < 1000) { // Skip if state was updated in last 1 second
      return;
    }
    
    stateVersionRef.current += 1;
    setLocalIssues(issues);
  }, [issues]); // Removed localIssues dependency to prevent infinite loop when optimistic updates occur
  
  // Removed state corruption watcher - identified as React closure issue, not actual corruption
  
  // Cleanup effect to handle component unmounting or view changes
  useEffect(() => {
    return () => {
      // Clear any pending timeouts when component unmounts
      operationTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      operationTimeoutsRef.current.clear();
      
     // Clean up any remaining refs
      
      // Clear pending requests tracking
      pendingRequestsRef.current.clear();
      setHasPendingPositionUpdates(false);
      
      // Reset operation flags
      isDraggingRef.current = false;
      operationsInProgressRef.current.clear();
      setOperationsInProgress(new Set());
    };
  }, [view.id]); // Reset when view changes
  
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
      const selectedStatusIds: string[] = Array.isArray(activeFilters?.status)
        ? (activeFilters.status)
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
    const baseColumns = createColumns(filteredIssues, view, projectStatuses as any[], allowedStatusNames, previousOrderingMethod.current);
    previousOrderingMethod.current = view?.ordering || view?.sorting?.field || 'manual';
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
    // Prevent drag if this specific issue is being processed
    if (operationsInProgressRef.current.has(start.draggableId)) {
      return;
    }
    
    isDraggingRef.current = true;
    if (start.type === 'issue') {
      // Preserve current visual order when switching to manual by applying ephemeral positions
      if ((view?.ordering || view?.sorting?.field) !== 'manual') {
        const positionById = new Map<string, number>();
        columns.forEach((col) => {
          col.issues.forEach((it: any, idx: number) => {
            positionById.set(it.id, (idx + 1) * VIEW_POSITION_GAP);
          });
        });
        setLocalIssues((prev) => prev.map((it: any) => {
          const pos = positionById.get(it.id);
          if (pos !== undefined) {
            return { ...it, viewPosition: pos, position: pos };
          }
          return it;
        }));
      }
      const issue = localIssues.find((i: any) => i.id === start.draggableId);
      setDraggedIssue(issue);
    }
  }, [localIssues, columns, view?.ordering, view?.sorting?.field]);

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

    // Safety check: if this specific issue operation is already in progress, ignore
    if (operationsInProgressRef.current.has(draggableId) && !isDraggingRef.current) {
      return;
    }

    const resetDragState = () => {
      isDraggingRef.current = false;
      setDraggedIssue(null);
      setHoverState({ canDrop: true, columnId: '' });
    };
    
    const removeIssueOperation = (issueId: string) => {
      operationsInProgressRef.current.delete(issueId);
      setOperationsInProgress(new Set(operationsInProgressRef.current));
      
      // Clear timeout for this specific issue
      const timeout = operationTimeoutsRef.current.get(issueId);
      if (timeout) {
        clearTimeout(timeout);
        operationTimeoutsRef.current.delete(issueId);
      }
    };

    if (!hoverState.canDrop) {
      resetDragState();
      toast({
        title: "Cannot drop issue",
        description: `Issue ${draggedIssue?.title} cannot be dropped to column ${hoverState.columnId}`,
        variant: "destructive"
      });
      
      return;
    }

    if (!destination) {
      resetDragState();
      return;
    }
    
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      resetDragState();
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
      
      resetDragState();
      return;
    }

    if (type === 'issue') {
      // Immediately switch ordering to manual, but preserve existing visual order
      if (typeof onOrderingChange === 'function' && (view?.ordering !== 'manual' && view?.sorting?.field !== 'manual')) {
        onOrderingChange('manual');
      }

      const isSameColumn = source.droppableId === destination.droppableId;
      const targetColumnId = isSameColumn ? source.droppableId : destination.droppableId;

      // Mark this issue as being processed
      operationsInProgressRef.current.add(draggableId);
      setOperationsInProgress(new Set(operationsInProgressRef.current));
      
      // Snapshot for rollback with state version
      const currentStateVersion = stateVersionRef.current;
      previousIssuesRef.current = localIssues;

      let newLocalIssues = [...localIssues];
      const issueIndex = newLocalIssues.findIndex((i: any) => i.id === draggableId);
      if (issueIndex === -1) { 
        resetDragState();
        return; 
      }

      const targetColumn = columns.find(col => col.id === targetColumnId);
      if (!targetColumn) { 
        resetDragState();
        return; 
      }

      // Compute neighbor context using current optimistic state (localIssues)
      // This ensures we consider any pending optimistic updates from previous drag operations
      const getCurrentColumnItems = (columnId: string) => {
        return localIssues
          .filter((issue: any) => {
            // For status-based grouping, check status fields
            if ((view?.grouping?.field || 'status') === 'status') {
              return issue.status === columnId || issue.statusValue === columnId ||
                     issue.projectStatus?.name === columnId;
            }
            // For other grouping fields, add logic as needed
            return issue.status === columnId;
          })
          .sort((a: any, b: any) => {
            const posA = a?.viewPosition ?? a?.position ?? 0;
            const posB = b?.viewPosition ?? b?.position ?? 0;
            return posA - posB;
          });
      };
      
      const items = isSameColumn 
        ? getCurrentColumnItems(targetColumnId).filter((i: any) => i.id !== draggableId) // Same column: filter out dragged item
        : getCurrentColumnItems(targetColumnId); // Cross column: use current optimistic state
      
      const destIndex = destination.index;
      const getPos = (it: any) => (it?.viewPosition ?? it?.position ?? 0);
      
      // For same-column moves with pending operations, use a more robust position calculation
      // The issue is that destination.index is based on visual layout, but our items are sorted by position value
      
      let prev: any = undefined;
      let next: any = undefined;
      
      // Always use the current optimistic state for position calculations
      // This ensures consistency between what the user sees and how we calculate positions
      const visualColumnItems = localIssues
        .filter((issue: any) => {
          // Filter to items in this column (including optimistic status changes)
          if ((view?.grouping?.field || 'status') === 'status') {
            return (issue.status === targetColumnId || 
                    issue.statusValue === targetColumnId ||
                    issue.projectStatus?.name === targetColumnId) && 
                   issue.id !== draggableId;
          }
          return issue.status === targetColumnId && issue.id !== draggableId;
        })
        .sort((a: any, b: any) => {
          // Sort by viewPosition (which includes optimistic position updates)
          const posA = a?.viewPosition ?? a?.position ?? 0;
          const posB = b?.viewPosition ?? b?.position ?? 0;
          return posA - posB;
        });
      
      // Position calculation for drag and drop
      
      // Handle stale destination.index when pending operations exist
      let adjustedDestIndex = destIndex;
      
      // When there are pending operations, verify the destination index
      if (operationsInProgressRef.current.size > 0 && !isSameColumn) {
        // The DnD library's destination.index is correct for the current visual state
        // Even when pending items are added above, the visual layout shifts are handled properly
        adjustedDestIndex = Math.max(0, Math.min(adjustedDestIndex, visualColumnItems.length));
      }
      
      const clampedIndex = Math.max(0, Math.min(adjustedDestIndex, visualColumnItems.length));
      prev = clampedIndex > 0 ? visualColumnItems[clampedIndex - 1] : undefined;
      next = clampedIndex < visualColumnItems.length ? visualColumnItems[clampedIndex] : undefined;
      
      let optimisticPosition: number;
      
      if (prev && next) {
        const prevPos = getPos(prev);
        const nextPos = getPos(next);
        const gap = nextPos - prevPos;
        
        if (!Number.isFinite(gap) || gap <= 1) {
          // Not enough space, put right after prev
          optimisticPosition = prevPos + 1;
        } else {
          // Use middle of gap
          optimisticPosition = prevPos + Math.floor(gap / 2);
        }
      } else if (prev && !next) {
        const prevPos = getPos(prev);
        optimisticPosition = Number.isFinite(prevPos) ? prevPos + VIEW_POSITION_GAP : VIEW_POSITION_GAP;
      } else if (!prev && next) {
        const nextPos = getPos(next);
        // When placing before the first item, ensure we create a unique position
        if (nextPos > VIEW_POSITION_GAP) {
          // If next position is large, use half
          optimisticPosition = Math.floor(nextPos / 2);
        } else if (nextPos > 512) {
          // If next position is medium, use half
          optimisticPosition = Math.floor(nextPos / 2);
        } else {
          // If next position is too small (≤512), we need to reposition all items
          // Instead of trying to squeeze in, we'll push everything down
          optimisticPosition = 1; // Temporary - will trigger repositioning
        }
      } else {
        optimisticPosition = VIEW_POSITION_GAP; // first item in empty column
      }
      
      // Ensure position is always positive (integers only for database compatibility)
      optimisticPosition = Math.max(1, Math.floor(optimisticPosition));
      
      // Check if we're creating a position conflict (placing at top when items have small positions)
      const needsRepositioning = (
        // Placing before first item AND first item has small position
        (!prev && next && getPos(next) <= 8) ||
        // Or if optimistic position would conflict with existing positions
        (optimisticPosition <= 8 && visualColumnItems.some(item => getPos(item) <= 8))
      );
      
      if (needsRepositioning) {
        // When repositioning is needed, use position that will be correct after repositioning
        // If we're placing at the top (destIndex 0), we'll get position 1024 after repositioning
        optimisticPosition = (clampedIndex + 1) * VIEW_POSITION_GAP;
      }
      
      // Create a deep copy of the issue to avoid shared reference mutations
      const originalIssue = newLocalIssues[issueIndex];
      const updatedIssue: any = {
        ...originalIssue,
        viewPosition: optimisticPosition, 
        position: optimisticPosition,
        // Ensure these critical fields are deeply copied to avoid mutations
        projectStatus: originalIssue.projectStatus ? { ...originalIssue.projectStatus } : undefined
      };
      
      if (!isSameColumn) {
        updatedIssue.status = targetColumnId;
        updatedIssue.statusValue = targetColumnId;
        if ((view?.grouping?.field || 'status') === 'status') {
          updatedIssue.projectStatus = { name: targetColumnId, displayName: targetColumn.name };
        }
      }

      // Optimistically update UI immediately with synchronous state update
      // This ensures the visual DOM reflects the new position instantly
      // Create a completely new array with the updated issue object
      newLocalIssues = [...newLocalIssues];
      newLocalIssues[issueIndex] = updatedIssue;
      
      flushSync(() => {
        setLocalIssues(newLocalIssues); // Use the new array directly
      });
      
      // Immediately verify the state update took effect
      const immediateColumnItems = newLocalIssues
        .filter((issue: any) => {
          if ((view?.grouping?.field || 'status') === 'status') {
            return (issue.status === targetColumnId || 
                    issue.statusValue === targetColumnId ||
                    issue.projectStatus?.name === targetColumnId);
          }
          return issue.status === targetColumnId;
        })
        .sort((a: any, b: any) => {
          const posA = a?.viewPosition ?? a?.position ?? 0;
          const posB = b?.viewPosition ?? b?.position ?? 0;
          return posA - posB;
        });
      
      // Force immediate DOM layout recalculation to ensure drag-and-drop library sees updated positions
      // This prevents subsequent drops from using stale DOM measurements
      // Reading offsetHeight synchronously forces browser to recalculate layout immediately
      const _ = document.body.offsetHeight;
      
      // Set operation timeout as safety net for this specific issue (30 seconds)
      const timeout = setTimeout(() => {
        if (operationsInProgressRef.current.has(draggableId)) {
          console.warn(`Drag operation for issue ${draggableId} timed out, resetting state`);
          if (previousIssuesRef.current) {
            setLocalIssues(previousIssuesRef.current);
          }
        removeIssueOperation(draggableId);
        markOperationCompleted(draggableId); // Notify global tracking that operation is done
        toast({
          variant: 'destructive',
          title: 'Operation timed out',
            description: 'Drag operation took too long. State restored.'
          });
        }
      }, 30000);
      operationTimeoutsRef.current.set(draggableId, timeout);
      
      
      // Process all moves immediately since we only move one card at a time
      // GET request cancellation in useViewPositions handles race conditions
      
      // Generate sequence number BEFORE async operations to prevent race conditions
      const currentSequence = ++requestSequenceRef.current;
      const batchId = `${targetColumnId}-${currentSequence}-${Date.now()}`;
      
      // Mark this issue as being dragged to suppress conflicting invalidations
      // Mark issue as dragging for WebSocket suppression BEFORE network requests
      markIssueAsDragging(draggableId);
      
      // Update last drag operation timestamp
      lastDragOperationRef.current = Date.now();
      
      try {
        
        // Track this request
        pendingRequestsRef.current.set(view.id, { sequence: currentSequence, batchId });
        setHasPendingPositionUpdates(true);
        
        // Handle status updates first (for cross-column moves)
        if (!isSameColumn) {
          await updateIssueMutation.mutateAsync({ 
            id: draggableId, 
            status: updatedIssue.status, 
            statusValue: updatedIssue.statusValue, 
            skipInvalidate: true 
          });
        }
        
        // Get fresh column state for accurate positioning
        const freshTargetColumn = columns.find(col => col.id === targetColumnId);
        if (!freshTargetColumn) throw new Error('Target column not found');
        
        const freshItems = isSameColumn 
          ? freshTargetColumn.issues.filter((i: any) => i.id !== draggableId)
          : freshTargetColumn.issues;
        
        // CRITICAL FIX: Use optimistic positions instead of index-based recalculation
        // This prevents visual jumping between optimistic and database positions
        const finalItems = [...freshItems];
        const dbDestIndex = Math.max(0, Math.min(destIndex, finalItems.length));
        
        // Insert the item with its optimistic position (not index-based)
        const itemWithOptimisticPosition = { ...updatedIssue, viewPosition: optimisticPosition, position: optimisticPosition };
        finalItems.splice(dbDestIndex, 0, itemWithOptimisticPosition);
        
        // Create bulk update - check if we need repositioning due to position conflicts
        let bulk = finalItems.map((it) => ({
          issueId: it.id,
          columnId: targetColumnId,
          position: it.viewPosition || it.position || ((finalItems.indexOf(it) + 1) * VIEW_POSITION_GAP)
        }));

        // ENHANCED: Check for tight spacing or position conflicts that require full repositioning
        // This applies to both same-column and cross-column moves
        const needsFullRepositioning = needsRepositioning || detectTightSpacing(bulk);
        
        if (needsFullRepositioning) {
          // When repositioning is needed, recalculate all positions with proper gaps
          // Reorder based on the visual array order (where user actually dropped the item)
          const reorderedBulk = finalItems.map((item, visualIndex) => {
            return {
              issueId: item.id,
              columnId: targetColumnId,
              position: (visualIndex + 1) * VIEW_POSITION_GAP // Clean spacing: 1024, 2048, 3072, etc.
            };
          });
          
          bulk = reorderedBulk;
          
          // CRITICAL: Update the optimistic position to match the final repositioned position
          // This prevents visual jumping when the database response comes back
          const droppedItemInBulk = bulk.find(b => b.issueId === draggableId);
          if (droppedItemInBulk) {
            // Update both the optimistic position and the newLocalIssues state
            optimisticPosition = droppedItemInBulk.position;
            const issueIndex = newLocalIssues.findIndex((i: any) => i.id === draggableId);
            if (issueIndex !== -1) {
              newLocalIssues[issueIndex] = {
                ...newLocalIssues[issueIndex],
                viewPosition: optimisticPosition,
                position: optimisticPosition
              };
            }
          }
        }
        
        
        
        const cleanup = !isSameColumn ? {
          issueIds: [draggableId],
          keepColumnId: targetColumnId,
        } : undefined;
        
        // Single atomic database update
        const res = await fetch(`/api/views/${view.id}/issue-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            bulk, 
            cleanup,
            batchId,
            sequence: currentSequence
          })
        });
        
        if (!res.ok) {
          throw new Error(`Failed to persist position: ${res.status}`);
        }
        
        
        // Update local state with final database positions
        // Preserve status changes for cross-column moves while updating positions
        if (currentStateVersion === stateVersionRef.current) {
          const updatedMap = new Map<string, number>();
          bulk.forEach((b) => updatedMap.set(b.issueId, b.position));
          
        // Apply final database positions synchronously to prevent visual jumping
        flushSync(() => {
          setLocalIssues((prevIssues) => prevIssues.map((it: any) => {
            if (updatedMap.has(it.id)) {
              const pos = updatedMap.get(it.id) as number;
              const updates: any = { ...it, viewPosition: pos, position: pos };
              
              // For cross-column moves, preserve the status changes that were applied optimistically
              if (!isSameColumn && it.id === draggableId) {
                updates.status = updatedIssue.status;
                updates.statusValue = updatedIssue.statusValue;
                if (updatedIssue.projectStatus) {
                  updates.projectStatus = updatedIssue.projectStatus;
                }
              }
              
              return updates;
            }
            return it;
          }));
        });
        }
        
        removeIssueOperation(draggableId);
        markOperationCompleted(draggableId); // Notify global tracking that operation is done
        
        // Operation completed successfully - React state should be consistent
        
        // Clear pending request tracking
        const pending = pendingRequestsRef.current.get(view.id);
        if (pending && pending.sequence === currentSequence) {
          pendingRequestsRef.current.delete(view.id);
          setHasPendingPositionUpdates(false);
        }
        
        // Note: No longer need additional drag protection since we now have
        // comprehensive global drag tracking and GET request queuing that
        // properly handles WebSocket event interference
      } catch (err) {
        console.error('Failed to process move:', err);
        removeIssueOperation(draggableId);
        markOperationCompleted(draggableId); // Notify global tracking that operation is done
        
        // Only rollback if we haven't made any database changes yet
        // If status was updated but position failed, don't rollback completely
        if (previousIssuesRef.current && currentStateVersion === stateVersionRef.current) {
          setLocalIssues(previousIssuesRef.current);
        }
        
        // Clear pending request tracking on error
        const pending = pendingRequestsRef.current.get(view.id);
        if (pending) {
          pendingRequestsRef.current.delete(view.id);
          setHasPendingPositionUpdates(false);
        }
        
        toast({
          variant: 'destructive',
          title: 'Move failed',
          description: 'Could not save new position. Please try again.'
        });
      } finally {
        resetDragState();
      }
      return;
    }
  }, [localIssues, columns, updateIssueMutation, onColumnUpdate, view.id, hoverState.canDrop, hoverState.columnId, draggedIssue?.title, toast, view?.grouping?.field, onOrderingChange, view?.ordering, view?.sorting?.field]);

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


  return {
    // State
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
    operationsInProgress,
    hasPendingPositionUpdates,
    
    // Handlers
    handleDragStart,
    handleDragUpdate,
    handleDragEnd,
    handleIssueClick,
    handleCreateIssue,
    handleToggleSubIssues,
    handleStartCreatingIssue,
    handleCancelCreatingIssue,
    handleIssueKeyDown
  };
};