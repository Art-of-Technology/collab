"use client";

import { useState, useMemo, useRef, useCallback, useEffect, type MouseEvent } from 'react';
import { useToast } from '@/hooks/use-toast';
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
  KanbanViewRendererProps,
  KanbanDragUpdate,
  KanbanDropResult,
} from '../types';

// Helper: check if an issue belongs to a column based on the current grouping field
function issueMatchesColumn(issue: any, columnId: string, groupField: string): boolean {
  switch (groupField) {
    case 'status':
      return issue.status === columnId || issue.statusValue === columnId ||
             issue.projectStatus?.name === columnId;
    case 'assignee': {
      const assigneeKey = issue.assignee?.name
        ? issue.assignee.name.toLowerCase().replace(/\s+/g, '-')
        : 'unassigned';
      return assigneeKey === columnId || issue.assigneeId === columnId;
    }
    case 'priority': {
      const PRIORITY_LABELS: Record<string, string> = { 'URGENT': 'Urgent', 'HIGH': 'High', 'MEDIUM': 'Medium', 'LOW': 'Low' };
      const label = PRIORITY_LABELS[(issue.priority || '').toUpperCase()] || 'Medium';
      return label.toLowerCase() === columnId || (issue.priority || '').toLowerCase() === columnId;
    }
    case 'type': {
      const ISSUE_TYPE_LABELS: Record<string, string> = { 'EPIC': 'Epic', 'STORY': 'Story', 'TASK': 'Task', 'BUG': 'Bug', 'MILESTONE': 'Milestone', 'SUBTASK': 'Subtask' };
      const label = ISSUE_TYPE_LABELS[(issue.type || '').toUpperCase()] || 'Task';
      return label.toLowerCase() === columnId || (issue.type || '').toLowerCase() === columnId;
    }
    default:
      return issue.status === columnId || issue.statusValue === columnId ||
             issue.projectStatus?.name === columnId;
  }
}

// Helper: compute the API mutation payload for a cross-column move based on grouping field
function buildCrossColumnMutationPayload(
  groupField: string,
  targetColumnId: string,
  targetColumnName: string,
  columns: any[]
): Record<string, any> {
  switch (groupField) {
    case 'assignee': {
      // Column ID for assignee is the lowercased name slug, column name is the display name
      // Find the actual assignee ID from column metadata or use 'unassigned'
      const targetCol = columns.find(c => c.id === targetColumnId);
      const assigneeId = targetCol?.assigneeId || (targetColumnId === 'unassigned' ? null : undefined);
      // If we can't resolve an assignee ID, use null to unassign
      return { assigneeId: assigneeId ?? null };
    }
    case 'priority': {
      // Column names are like 'Urgent', 'High', etc. — need to map back to enum values
      const PRIORITY_REVERSE: Record<string, string> = { 'urgent': 'URGENT', 'high': 'HIGH', 'medium': 'MEDIUM', 'low': 'LOW' };
      const priority = PRIORITY_REVERSE[targetColumnId.toLowerCase()] || targetColumnId.toUpperCase();
      return { priority };
    }
    case 'type': {
      const TYPE_REVERSE: Record<string, string> = { 'epic': 'EPIC', 'story': 'STORY', 'task': 'TASK', 'bug': 'BUG', 'milestone': 'MILESTONE', 'subtask': 'SUBTASK' };
      const type = TYPE_REVERSE[targetColumnId.toLowerCase()] || targetColumnId.toUpperCase();
      return { type };
    }
    case 'status':
    default:
      return { status: targetColumnId, statusValue: targetColumnId };
  }
}

// Helper: apply optimistic field updates on the dragged issue for non-status groupings
function applyOptimisticGroupFieldUpdate(
  issue: any,
  groupField: string,
  targetColumnId: string,
  targetColumnName: string,
  columns: any[]
): any {
  const updated = { ...issue };
  switch (groupField) {
    case 'assignee': {
      const targetCol = columns.find(c => c.id === targetColumnId);
      if (targetColumnId === 'unassigned') {
        updated.assignee = null;
        updated.assigneeId = null;
      } else {
        updated.assignee = { ...(issue.assignee || {}), name: targetColumnName, id: targetCol?.assigneeId || issue.assignee?.id };
        updated.assigneeId = targetCol?.assigneeId || issue.assigneeId;
      }
      break;
    }
    case 'priority': {
      const PRIORITY_REVERSE: Record<string, string> = { 'urgent': 'URGENT', 'high': 'HIGH', 'medium': 'MEDIUM', 'low': 'LOW' };
      updated.priority = PRIORITY_REVERSE[targetColumnId.toLowerCase()] || targetColumnId.toUpperCase();
      break;
    }
    case 'type': {
      const TYPE_REVERSE: Record<string, string> = { 'epic': 'EPIC', 'story': 'STORY', 'task': 'TASK', 'bug': 'BUG', 'milestone': 'MILESTONE', 'subtask': 'SUBTASK' };
      updated.type = TYPE_REVERSE[targetColumnId.toLowerCase()] || targetColumnId.toUpperCase();
      break;
    }
    case 'status':
    default: {
      updated.status = targetColumnId;
      updated.statusValue = targetColumnId;
      updated.projectStatus = { name: targetColumnId, displayName: targetColumnName };
      break;
    }
  }
  return updated;
}
export const useKanbanState = ({
  view,
  issues,
  workspace,
  onColumnUpdate,
  activeFilters,
  onOrderingChange,
  searchQuery
}: KanbanViewRendererProps) => {
  const { toast } = useToast();
  const isDraggingRef = useRef(false);
  const operationsInProgressRef = useRef<Set<string>>(new Set());
  const operationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const stateVersionRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const pendingRequestsRef = useRef<Map<string, { sequence: number, batchId: string }>>(new Map());
  const lastDragOperationRef = useRef<number>(0);
  const updateIssueMutation = useUpdateIssue();
  
  // State management with optimistic updates
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
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
  const previousSearchQueryRef = useRef<string>(searchQuery || '');
  
  // Update local issues when props change (from server),
  // but don't override while a drag/drop optimistic update is in-flight
  useEffect(() => {
    // Track search query changes first - this must happen even during drag operations
    // to ensure the ref is updated when operations complete
    const searchQueryChanged = previousSearchQueryRef.current !== (searchQuery || '');
    if (searchQueryChanged) {
      previousSearchQueryRef.current = searchQuery || '';
    }
    
    if (isDraggingRef.current || operationsInProgressRef.current.size > 0) return;
    
    // Additional protection: don't override if we have recent local changes that might not be reflected yet
    // IMPORTANT: Only check for status differences in issues that exist in BOTH localIssues and issues prop
    // This prevents blocking updates when search query changes (which filters the issues prop)
    const hasRecentLocalChanges = localIssues.some(localIssue => {
      const serverIssue = issues.find(issue => issue.id === localIssue.id);
      // Only check differences if the issue exists in both arrays
      if (!serverIssue) return false;
      
      // Check if local issue has different field values than server issue (recent cross-column move)
      // This covers status, assignee, priority, and type groupings
      return localIssue.status !== serverIssue.status || 
             localIssue.statusValue !== serverIssue.statusValue ||
             localIssue.assigneeId !== serverIssue.assigneeId ||
             localIssue.priority !== serverIssue.priority ||
             localIssue.type !== serverIssue.type;
    });
    
    // Allow server data update if enough time has passed since last drag operation (60 seconds)
    const timeSinceLastDrag = Date.now() - lastDragOperationRef.current;
    const shouldAllowServerUpdate = timeSinceLastDrag > 60000; // Fixed: 60 seconds = 60000ms
    
    // Sync check for server data vs local optimistic changes
    // Skip update if we have recent local changes AND search query hasn't changed AND enough time hasn't passed
    if (hasRecentLocalChanges && !searchQueryChanged && !shouldAllowServerUpdate) {
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
  }, [issues, searchQuery]); // Removed localIssues dependency to prevent infinite loop when optimistic updates occur
  
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

    // Start with base columns
    let orderedColumns = baseColumns;

    // Apply saved layout order from view for non-status groupings
    if (groupField !== 'status') {
      const savedOrder: string[] | undefined = view?.layout?.kanbanColumnOrder?.[groupField];
      if (Array.isArray(savedOrder) && savedOrder.length > 0) {
        const indexById = new Map(savedOrder.map((id, idx) => [id, idx]));
        orderedColumns = orderedColumns
          .map((col: any) => ({
            ...col,
            order: indexById.has(col.id) ? (indexById.get(col.id) as number) : col.order,
          }))
          .sort((a: any, b: any) => a.order - b.order);
      }
    }

    // Apply local drag-reordered order for all groupings (takes precedence during session)
    if (localColumnOrder) {
      const indexById = new Map(localColumnOrder.map((id, idx) => [id, idx]));
      orderedColumns = orderedColumns
        .map((col: any) => ({
          ...col,
          order: indexById.has(col.id) ? (indexById.get(col.id) as number) : col.order,
        }))
        .sort((a: any, b: any) => a.order - b.order);
    }

    return orderedColumns;
  }, [filteredIssues, view, projectStatusData, isLoadingStatuses, localColumnOrder, activeFilters]);

  // Count issues for filter buttons
  const issueCounts = useMemo(() => {
    return countIssuesByType(issues);
  }, [issues]);

  // Helper function to validate if an issue can be moved to a target column
  const canIssueMoveTo = useCallback((issue: any, targetColumnId: string): boolean => {
    const groupField = view?.grouping?.field || 'status';

    // Allow movement within the same column (reordering)
    if (issueMatchesColumn(issue, targetColumnId, groupField)) {
      return true;
    }

    // For non-status groupings, always allow moves (no cross-project status constraints)
    if (groupField !== 'status') {
      return true;
    }

    // Status-specific validation: check if target status exists in the issue's project
    if (!projectStatusData?.projectStatuses) {
      return true;
    }

    const projectSpecificStatuses = projectStatusData.projectStatuses.filter(
      (ps: any) => ps.projectId === issue.projectId
    );

    if (projectSpecificStatuses.length === 0) {
      return true;
    }

    const targetStatusExists = projectSpecificStatuses.some(
      (ps: any) => ps.name === targetColumnId
    );

    return targetStatusExists;
  }, [projectStatusData, view?.grouping?.field]);

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

  const handleDragUpdate = useCallback((update: KanbanDragUpdate) => {
    let destination = update.destination;
    if(update.overrideColumnId) {
      destination = {
        droppableId: update.overrideColumnId,
        index: 0,
      };
    }

    if (!destination) {
      setHoverState({ canDrop: true, columnId: '' });
      return;
    }

    if (update.type === 'issue') {
      const targetColumnId = destination.droppableId;

      if (draggedIssue) {
        const canDrop = canIssueMoveTo(draggedIssue, targetColumnId);
        setHoverState({ canDrop, columnId: targetColumnId });
      } else {
        setHoverState({ canDrop: true, columnId: targetColumnId });
      }
    } else {
      setHoverState({ canDrop: true, columnId: '' });
    }
  }, [draggedIssue, canIssueMoveTo]);

  const handleDragEnd = useCallback(async (result: KanbanDropResult) => {
    const { source, draggableId, type } = result;
    const destination = result.overrideDestination ?? result.destination;

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
      const groupField = view?.grouping?.field || 'status';
      const getCurrentColumnItems = (columnId: string) => {
        return localIssues
          .filter((issue: any) => issueMatchesColumn(issue, columnId, groupField))
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
          return issueMatchesColumn(issue, targetColumnId, groupField) && issue.id !== draggableId;
        })
        .sort((a: any, b: any) => {
          const posA = a?.viewPosition ?? a?.position ?? 0;
          const posB = b?.viewPosition ?? b?.position ?? 0;
          return posA - posB;
        });
      
      // Position calculation for drag and drop
      
      // Position calculation: always clamp destination index to valid range
      let adjustedDestIndex = destIndex;
      // ALWAYS clamp — not just when operations are pending
      // This prevents off-by-one errors from pointer override and stale DnD library state
      adjustedDestIndex = Math.max(0, Math.min(adjustedDestIndex, visualColumnItems.length));
      
      const clampedIndex = adjustedDestIndex;
      prev = clampedIndex > 0 ? visualColumnItems[clampedIndex - 1] : undefined;
      next = clampedIndex < visualColumnItems.length ? visualColumnItems[clampedIndex] : undefined;
      
      let optimisticPosition: number;
      
      if (prev && next) {
        const prevPos = getPos(prev);
        const nextPos = getPos(next);
        const gap = nextPos - prevPos;
        
        if (!Number.isFinite(gap) || gap <= 1) {
          // Not enough space — trigger full repositioning
          optimisticPosition = (clampedIndex + 1) * VIEW_POSITION_GAP;
        } else {
          // Use middle of gap
          optimisticPosition = prevPos + Math.floor(gap / 2);
        }
      } else if (prev && !next) {
        const prevPos = getPos(prev);
        optimisticPosition = Number.isFinite(prevPos) ? prevPos + VIEW_POSITION_GAP : VIEW_POSITION_GAP;
      } else if (!prev && next) {
        const nextPos = getPos(next);
        // Placing before the first item — need position < nextPos
        if (nextPos > VIEW_POSITION_GAP) {
          optimisticPosition = Math.floor(nextPos / 2);
        } else if (nextPos > 2) {
          // If next is small but > 2, halve it (gives at least position 1)
          optimisticPosition = Math.floor(nextPos / 2);
        } else {
          // Next position is too small (≤2), trigger full repositioning
          optimisticPosition = VIEW_POSITION_GAP; // Will be corrected by repositioning
        }
      } else {
        optimisticPosition = VIEW_POSITION_GAP; // first item in empty column
      }
      
      // Ensure position is always positive (integers only for database compatibility)
      optimisticPosition = Math.max(1, Math.floor(optimisticPosition));
      
      // Determine if we need full repositioning:
      // 1. Placing before first item when first item has small position
      // 2. Gap between prev/next is too small for clean insertion
      // 3. Optimistic position would create a conflict
      const needsRepositioning = (
        (!prev && next && getPos(next) <= VIEW_POSITION_GAP / 2) ||
        (prev && next && (getPos(next) - getPos(prev)) <= 1) ||
        (optimisticPosition <= 1 && visualColumnItems.length > 0)
      );
      
      if (needsRepositioning) {
        // Full reindex: use predictable positions based on visual order
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
        // Apply optimistic field updates based on current groupBy setting
        const optimisticUpdates = applyOptimisticGroupFieldUpdate(
          updatedIssue, groupField, targetColumnId, targetColumn.name, columns
        );
        Object.assign(updatedIssue, optimisticUpdates);
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
        .filter((issue: any) => issueMatchesColumn(issue, targetColumnId, groupField))
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
        
        // Handle field updates for cross-column moves (status, assignee, priority, type)
        if (!isSameColumn) {
          const mutationPayload = buildCrossColumnMutationPayload(
            groupField, targetColumnId, targetColumn.name, columns
          );
          await updateIssueMutation.mutateAsync({
            id: draggableId,
            workspaceId: workspace?.id,
            ...mutationPayload,
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
          
          // CRITICAL: Update ALL items' optimistic positions to match the repositioned values
          // This prevents visual jumping when the database response comes back
          const positionMap = new Map(bulk.map(b => [b.issueId, b.position]));
          
          // Update the dragged item's optimistic position
          const droppedPos = positionMap.get(draggableId);
          if (droppedPos !== undefined) {
            optimisticPosition = droppedPos;
          }
          
          // Update ALL local issues that were repositioned
          newLocalIssues = newLocalIssues.map((issue: any) => {
            const newPos = positionMap.get(issue.id);
            if (newPos !== undefined) {
              return { ...issue, viewPosition: newPos, position: newPos };
            }
            return issue;
          });
          
          // Flush the full reposition to UI immediately
          flushSync(() => {
            setLocalIssues(newLocalIssues);
          });
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
              
              // For cross-column moves, preserve ALL field changes that were applied optimistically
              // This handles status, assignee, priority, and type groupings
              if (!isSameColumn && it.id === draggableId) {
                // Copy all optimistic changes from updatedIssue (which was built via applyOptimisticGroupFieldUpdate)
                if (updatedIssue.status !== undefined) updates.status = updatedIssue.status;
                if (updatedIssue.statusValue !== undefined) updates.statusValue = updatedIssue.statusValue;
                if (updatedIssue.projectStatus) updates.projectStatus = updatedIssue.projectStatus;
                if (updatedIssue.assignee !== undefined) updates.assignee = updatedIssue.assignee;
                if (updatedIssue.assigneeId !== undefined) updates.assigneeId = updatedIssue.assigneeId;
                if (updatedIssue.priority !== undefined) updates.priority = updatedIssue.priority;
                if (updatedIssue.type !== undefined) updates.type = updatedIssue.type;
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
  const handleIssueClick = useCallback((issueIdOrKey: string, event?: MouseEvent) => {
    // Navigate directly to the issue page (Linear-style)
    // Use workspace slug if available, else id; fallback to issue's workspaceId
    const sampleIssue = issues.find((i) => i.id === issueIdOrKey || i.issueKey === issueIdOrKey) || issues[0];
    const workspaceSegment = (workspace as any)?.slug || (workspace as any)?.id || sampleIssue?.workspaceId || (view as any)?.workspaceId;
    
    // Build URL with view context for proper back navigation
    const viewParams = view?.slug ? `?view=${view.slug}&viewName=${encodeURIComponent(view.name)}` : '';
    
    const url = workspaceSegment 
      ? `/${workspaceSegment}/issues/${issueIdOrKey}${viewParams}`
      : `/issues/${issueIdOrKey}${viewParams}`;
    
    // Only open programmatically for normal left-clicks
    // Ctrl/Cmd+click and middle click use native browser behavior
    if (!event || (!event.ctrlKey && !event.metaKey)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [issues, view, workspace]);

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
  }, []);


  return {
    // State
    isCreatingIssue,
    
    // Computed values
    filteredIssues,
    columns,
    issueCounts,
    displayProperties,
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
    handleStartCreatingIssue,
    handleCancelCreatingIssue
  };
};