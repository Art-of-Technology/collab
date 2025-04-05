'use client';

import { useState } from "react";
import { TaskDetailContent, Task } from "@/components/tasks/TaskDetailContent";
import { useTaskById } from "@/hooks/queries/useTask";

interface TaskDetailClientProps {
  task: Task;
  showHeader?: boolean;
}

export default function TaskDetailClient({ task, showHeader = true }: TaskDetailClientProps) {
  const { data: currentTask, isLoading, error } = useTaskById(task.id);
  
  // Use the TanStack query data or fall back to the initial data
  const taskData = currentTask || task;
  
  return (
    <TaskDetailContent
      task={taskData}
      isLoading={isLoading}
      error={error ? "Error loading task details" : null}
      showHeader={showHeader}
    />
  );
} 