'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  linkPostToTask,
  unlinkPostFromTask,
  getWorkspaceBoards,
  getBoardColumns,
  createBoard,
  updateBoard,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  moveTask,
  getBoardTasks
} from '@/actions/task';
import { workspaceKeys } from './useWorkspace';
import { boardItemsKeys } from './useBoardItems';

// Define task query keys
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...taskKeys.lists(), workspaceId] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  board: (boardId: string) => [...taskKeys.lists(), { board: boardId }] as const,
};

// Define board query keys
export const boardKeys = {
  all: ['boards'] as const,
  lists: () => [...boardKeys.all, 'list'] as const,
  workspace: (workspaceId: string) => [...boardKeys.lists(), { workspace: workspaceId }] as const,
  columns: (boardId: string) => [...boardKeys.all, 'columns', { board: boardId }] as const,
  detail: (boardId: string) => [...boardKeys.all, 'detail', boardId] as const,
};

// Get all tasks for a workspace
export const useWorkspaceTasks = (workspaceId: string) => {
  return useQuery({
    queryKey: taskKeys.list(workspaceId),
    queryFn: () => getWorkspaceTasks(workspaceId),
    enabled: !!workspaceId,
  });
};

// Get tasks for a specific board
export const useBoardTasks = (boardId: string | undefined) => {
  return useQuery({
    queryKey: taskKeys.board(boardId || ''),
    queryFn: () => getBoardTasks(boardId as string),
    enabled: !!boardId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Get a single task by ID
export const useTaskById = (taskId: string) => {
  return useQuery({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => getTaskById(taskId),
    enabled: !!taskId,
  });
};

// Create task mutation
export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: (data) => {
      // Invalidate tasks list for this workspace
      queryClient.invalidateQueries({ queryKey: taskKeys.list(data.workspaceId) });

      // Invalidate the workspace details
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(data.workspaceId) });

      // If task is connected to a board and column, invalidate those queries too
      if (data.taskBoardId) {
        queryClient.invalidateQueries({ queryKey: boardKeys.detail(data.taskBoardId) });
        queryClient.invalidateQueries({ queryKey: taskKeys.board(data.taskBoardId) });
      }

      if (data.columnId) {
        queryClient.invalidateQueries({ queryKey: boardKeys.columns(data.taskBoardId || '') });
      }
    },
  });
};

// Update task mutation
export const useUpdateTask = (taskId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title?: string;
      description?: string;
      assigneeId?: string | null;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      status?: string;
      type?: string;
      dueDate?: Date | null;
    }) => updateTask(taskId, data),
    onSuccess: (data) => {
      // Invalidate specific task
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });

      // Invalidate task list for this workspace
      queryClient.invalidateQueries({ queryKey: taskKeys.list(data.workspaceId) });

      // If the task is associated with a board, invalidate board-related queries
      if (data.taskBoardId) {
        queryClient.invalidateQueries({ queryKey: taskKeys.board(data.taskBoardId) });
        queryClient.invalidateQueries({ queryKey: boardItemsKeys.board(data.taskBoardId) });
      }
      
      // Invalidate assigned tasks to update status/column changes in task lists
      queryClient.invalidateQueries({ queryKey: ['assignedTasks'] });
    },
  });
};

// Delete task mutation
export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onSuccess: (_, taskId) => {
      // Get the task data from cache if available to get the workspaceId
      const taskData = queryClient.getQueryData([...taskKeys.detail(taskId)]);
      const workspaceId = taskData ? (taskData as any).workspaceId : null;

      // Invalidate the specific task
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });

      // If we have the workspaceId, invalidate the task list for that workspace
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: taskKeys.list(workspaceId) });
      }
    },
  });
};

// Link post to task mutation
export const useLinkPostToTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: linkPostToTask,
    onSuccess: (_, variables) => {
      // Invalidate the specific task
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) });
    },
  });
};

// Unlink post from task mutation
export const useUnlinkPostFromTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkPostFromTask,
    onSuccess: (_, variables) => {
      // Invalidate the specific task
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) });
    },
  });
};

// Get workspace boards
export const useWorkspaceBoards = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: boardKeys.workspace(workspaceId || ''),
    queryFn: () => getWorkspaceBoards(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Get board columns
export const useBoardColumns = (boardId: string | null | undefined) => {
  return useQuery({
    queryKey: boardKeys.columns(boardId || ''),
    queryFn: () => getBoardColumns(boardId as string),
    enabled: !!boardId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Create board mutation
export const useCreateBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBoard,
    onSuccess: (data) => {
      // Invalidate boards list for this workspace
      queryClient.invalidateQueries({ queryKey: boardKeys.workspace(data.workspaceId) });
    },
  });
};

// Update board mutation
export const useUpdateBoard = (boardId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name?: string;
      description?: string;
      issuePrefix?: string;
    }) => updateBoard(boardId, data),
    onSuccess: (data) => {
      // Invalidate specific board
      queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });

      // Invalidate boards list for this workspace
      queryClient.invalidateQueries({ queryKey: boardKeys.workspace(data.workspaceId) });
    },
  });
};

// Create column mutation
export const useCreateColumn = (boardId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      order?: number;
      color?: string;
    }) => createColumn(boardId, data),
    onSuccess: () => {
      // Invalidate columns for this board
      queryClient.invalidateQueries({ queryKey: boardKeys.columns(boardId) });
      // Also invalidate the board detail to refresh the complete board state
      queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
    },
  });
};

// Update column mutation
export const useUpdateColumn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      columnId,
      data
    }: {
      columnId: string;
      data: { name?: string; color?: string; }
    }) => updateColumn(columnId, data),
    onSuccess: () => {
      // We need to find the board ID this column belongs to
      // For now let's simply invalidate all columns and board queries
      queryClient.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
};

// Delete column mutation
export const useDeleteColumn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteColumn,
    onSuccess: () => {
      // Since we don't know the board ID, we'll invalidate all board-related queries
      queryClient.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
};

// Reorder columns mutation
export const useReorderColumns = (boardId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (columns: { id: string; order: number }[]) =>
      reorderColumns(boardId, columns),
    onSuccess: () => {
      // Invalidate columns for this board
      queryClient.invalidateQueries({ queryKey: boardKeys.columns(boardId) });
      // Also invalidate the board detail
      queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
    },
  });
};

// Move task mutation (from one column to another)
export const useMoveTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: { columnId: string; position: number } }) =>
      moveTask(taskId, data),
    onSuccess: (data) => {
      // Get the task data to find the board ID
      const boardId = data.taskBoardId;

      if (boardId) {
        // Invalidate board tasks query
        queryClient.invalidateQueries({ queryKey: taskKeys.board(boardId) });
      }
    }
  });
}; 