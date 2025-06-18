"use client";

import { TaskSessionsView } from "@/components/tasks/TaskSessionsView";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";

interface TaskWorkSessionsProps {
  taskId: string;
  onRefresh: () => void;
}

export function TaskWorkSessions({ taskId, onRefresh }: TaskWorkSessionsProps) {
  const { settings } = useWorkspaceSettings();

  // Only show if time tracking is enabled
  if (!settings?.timeTrackingEnabled) {
    return null;
  }

  return (
    <TaskSessionsView 
      taskId={taskId} 
      onRefresh={onRefresh}
    />
  );
} 