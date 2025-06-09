'use client';

import { TaskDetailContent, Task } from "@/components/tasks/TaskDetailContent";
import { useTaskById } from "@/hooks/queries/useTask";

interface TaskDetailClientProps {
  task: Task;
  showHeader?: boolean;
  boardId?: string;
}

export default function TaskDetailClient({ task, showHeader = true, boardId }: TaskDetailClientProps) {
  const { data: currentTask, error, refetch } = useTaskById(task.id);

  // Prioritize current query data over initial props to reflect real-time updates
  const taskData = currentTask || task;

  const onRefresh = () => {
    // Manually refetch the task data when refresh is called
    refetch();
  };

  return (
    <TaskDetailContent
      task={taskData as Task}
      error={error ? "Error loading task details" : null}
      showHeader={showHeader}
      onRefresh={onRefresh}
      boardId={boardId}
    />
  );
} 