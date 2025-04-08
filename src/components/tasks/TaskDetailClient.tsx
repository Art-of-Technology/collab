'use client';

import { useState } from "react";
import { TaskDetailContent, Task } from "@/components/tasks/TaskDetailContent";
import { useTaskById } from "@/hooks/queries/useTask";

interface TaskDetailClientProps {
  task: Task;
  showHeader?: boolean;
  boardId?: string;
}

export default function TaskDetailClient({ task, showHeader = true, boardId }: TaskDetailClientProps) {
  const { data: currentTask, isLoading, error } = useTaskById(task.id);
  
  // Use the TanStack query data or fall back to the initial data
  const taskData = currentTask || task;
  
  const onRefresh = () => {
    // This function can be implemented to refresh the task data
    console.log("Refreshing task data");
  };
  
  return (
    <TaskDetailContent
      task={taskData as Task}
      isLoading={isLoading}
      error={error ? "Error loading task details" : null}
      showHeader={showHeader}
      onRefresh={onRefresh}
      boardId={boardId}
    />
  );
} 