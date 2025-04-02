"use client";

import { useState } from "react";
import { TaskDetailContent, Task } from "@/components/tasks/TaskDetailContent";

interface TaskWrapperProps {
  task: Task;
  showHeader?: boolean;
}

export default function TaskWrapper({ task, showHeader = true }: TaskWrapperProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<Task>(task);

  // Client-side refresh function
  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/tasks/${task.id}`);
      
      if (!response.ok) {
        throw new Error("Failed to refresh task");
      }
      
      const refreshedTask = await response.json();
      setCurrentTask(refreshedTask);
    } catch (err) {
      setError("Error refreshing task details");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TaskDetailContent
      task={currentTask}
      isLoading={isLoading}
      error={error}
      onRefresh={handleRefresh}
      showHeader={showHeader}
    />
  );
} 