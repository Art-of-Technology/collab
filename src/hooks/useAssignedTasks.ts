import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export interface TaskOption {
  id: string;
  title: string;
  issueKey?: string;
  priority: string;
  status: string;
  boardId: string;
  boardName: string;
  currentPlayState?: 'stopped' | 'playing' | 'paused';
}

export interface TaskBoard {
  id: string;
  name: string;
  tasks: TaskOption[];
}

export function useAssignedTasks() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignedTasks = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch user's assigned tasks
      const response = await fetch(`/api/users/${session.user.id}/assigned-tasks`);
      if (!response.ok) {
        throw new Error('Failed to fetch assigned tasks');
      }

      const data = await response.json();
      setTasks(data.tasks || []);

      // Group tasks by board
      const boardMap = new Map<string, TaskBoard>();
      
      data.tasks?.forEach((task: TaskOption) => {
        if (!boardMap.has(task.boardId)) {
          boardMap.set(task.boardId, {
            id: task.boardId,
            name: task.boardName,
            tasks: []
          });
        }
        boardMap.get(task.boardId)?.tasks.push(task);
      });

      setBoards(Array.from(boardMap.values()));
    } catch (err) {
      console.error('Error fetching assigned tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchAssignedTasks();
  }, [fetchAssignedTasks]);

  return {
    tasks,
    boards,
    loading,
    error,
    refetch: fetchAssignedTasks
  };
} 