/* eslint-disable */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBoardItems, reorderItemsInColumn } from '@/actions/boardItems';
import { taskKeys } from './useTask';

// Define board items query keys
export const boardItemsKeys = {
  all: ['boardItems'] as const,
  board: (boardId: string) => [...boardItemsKeys.all, { board: boardId }] as const,
};

/**
 * Hook to get all items (tasks, milestones, epics, stories) for a board
 */
export const useBoardItems = (boardId: string | undefined) => {
  return useQuery({
    queryKey: boardItemsKeys.board(boardId || ''),
    queryFn: () => getBoardItems(boardId as string),
    enabled: !!boardId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to reorder items within or between columns
 */
export const useReorderBoardItems = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    // Type for mutationFn input data
    mutationFn: (data: {
      boardId: string;
      columnId: string;
      orderedItemIds: string[];
      movedItemId: string;
      // Removed entityType
    }) => reorderItemsInColumn(data),
    // Optimistically update the cache
    onMutate: async (newData) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: boardItemsKeys.board(newData.boardId) });

      // Snapshot the previous value
      const previousBoardItems = queryClient.getQueryData(boardItemsKeys.board(newData.boardId));

      // Optimistically update to the new value
      queryClient.setQueryData(boardItemsKeys.board(newData.boardId), (old: any) => {
        if (!old) return old;
        
        // Helper to get items for a column from the potentially nested structure
        const getItemsFromColumn = (columnId: string) => {
            const column = old.itemsByColumn?.[columnId];
            return column ? Array.isArray(column) ? column : [] : [];
        }
        
        // Find the source and destination column items *from the old data*
        let sourceItems = getItemsFromColumn(newData.columnId); // Initial guess - might change if moved between columns
        let destItems = getItemsFromColumn(newData.columnId);
        
        // Find the item being moved and its original column
        let movedItem = null;
        let sourceColumnId = newData.columnId;
        for (const colId in old.itemsByColumn) {
            const itemIndex = old.itemsByColumn[colId].findIndex((item: any) => item.id === newData.movedItemId);
            if (itemIndex !== -1) {
                movedItem = old.itemsByColumn[colId][itemIndex];
                sourceColumnId = colId;
                sourceItems = [...old.itemsByColumn[colId]]; // Correct source items
                // If moving to a different column, find correct destItems
                if (sourceColumnId !== newData.columnId) {
                    destItems = getItemsFromColumn(newData.columnId); 
                }
                break;
            }
        }
        
        if (!movedItem) return old; // Item not found, don't change state
        
        // Create copies for modification
        let finalSourceItems = [...sourceItems];
        let finalDestItems = sourceColumnId === newData.columnId ? finalSourceItems : [...destItems];
        
        // Remove from original position
        const originalIndex = finalSourceItems.findIndex(item => item.id === newData.movedItemId);
        if (originalIndex !== -1) {
            finalSourceItems.splice(originalIndex, 1);
        }
        
        // Find the correct destination index based on orderedItemIds
        const destinationIndex = newData.orderedItemIds.indexOf(newData.movedItemId);
        
        // Add to new position in destination array
        if (destinationIndex !== -1) {
             if (sourceColumnId === newData.columnId) {
                 // If same column, finalSourceItems already has the item removed
                 // We just need to re-insert it at the new spot
                 finalSourceItems.splice(destinationIndex, 0, movedItem);
                 finalDestItems = finalSourceItems; // Ensure destItems reflects the change
             } else {
                 // If different column, add to destItems
                 finalDestItems.splice(destinationIndex, 0, movedItem);
             }
        }
        
        // Assign new positions based on the final array order
        const assignPositions = (items: any[]) => items.map((item, index) => ({ ...item, position: index }));

        finalSourceItems = assignPositions(finalSourceItems);
        finalDestItems = assignPositions(finalDestItems);

        // Create a new state object with the updated columns
        const newItemsByColumn = {
            ...old.itemsByColumn,
            [sourceColumnId]: finalSourceItems,
            // Only update destination if it's different from source
            ...(sourceColumnId !== newData.columnId && { [newData.columnId]: finalDestItems }),
        };

        // Rebuild allItems sorted correctly
        const newAllItems = Object.values(newItemsByColumn).flat().sort((a:any, b:any) => (a.position ?? Infinity) - (b.position ?? Infinity));
        
        return {
          ...old,
          allItems: newAllItems,
          itemsByColumn: newItemsByColumn
        };
      });

      // Return a context object with the snapshotted value
      return { previousBoardItems };
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, newData, context) => {
      if (context?.previousBoardItems) {
        queryClient.setQueryData(boardItemsKeys.board(newData.boardId), context.previousBoardItems);
      }
    },
    // Always refetch after error or success:
    onSettled: async (data, error, variables) => {
      // Invalidate board items query
      queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(variables.boardId) });
      
      // Invalidate task-related queries to update statuses dynamically across the UI
      queryClient.invalidateQueries({ queryKey: taskKeys.board(variables.boardId) });
      
      // Get the board data to find the workspace ID for broader invalidations
      try {
        const boardData = await queryClient.getQueryData(['boards', 'detail', variables.boardId]);
        const workspaceId = boardData ? (boardData as any).workspaceId : null;
        
        if (workspaceId) {
          // Invalidate workspace task list
          queryClient.invalidateQueries({ queryKey: taskKeys.list(workspaceId) });
          
          // Invalidate assigned tasks for all users in this workspace
          queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
        }
      } catch (e) {
        // If we can't get workspace ID, still invalidate assigned tasks
        queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
      }
      
      // Also invalidate specific task details if the moved item was a task
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.movedItemId) });
    },
  });
}; 