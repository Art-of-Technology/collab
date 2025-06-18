import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

export interface TaskOption {
  id: string;
  title: string;
  issueKey?: string;
  priority: string;
  status: string;
  boardId: string;
  boardName: string;
  createdAt: Date;
  currentPlayState?: 'stopped' | 'playing' | 'paused';
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export interface TaskBoard {
  id: string;
  name: string;
  tasks: TaskOption[];
}

export function useAssignedTasks(workspaceId?: string) {
  const { data: session } = useSession();

  const {
    data: boards = [],
    isLoading: loading,
    error,
    refetch
  } = useQuery<TaskBoard[]>({
    queryKey: ['assignedTasks', session?.user?.id, workspaceId],
    queryFn: async () => {
      if (!session?.user?.id || !workspaceId) {
        return [];
      }

      const response = await fetch(`/api/users/${session.user.id}/assigned-tasks?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch assigned tasks');
      }
      
      const data = await response.json();
      
      // Group tasks by board
      const tasksByBoard = new Map<string, TaskOption[]>();
      
      data.tasks.forEach((task: TaskOption) => {
        const boardKey = task.boardId || 'no-board';
        if (!tasksByBoard.has(boardKey)) {
          tasksByBoard.set(boardKey, []);
        }
        tasksByBoard.get(boardKey)!.push(task);
      });
      
      // Convert to board format
      const boards: TaskBoard[] = Array.from(tasksByBoard.entries()).map(([boardId, tasks]) => ({
        id: boardId,
        name: tasks[0]?.boardName || 'No Board',
        tasks
      }));
      
      return boards;
    },
    enabled: !!session?.user?.id && !!workspaceId,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  return {
    boards,
    loading,
    error,
    refetch
  };
} 