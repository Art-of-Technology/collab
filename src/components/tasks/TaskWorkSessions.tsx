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
    return (
      <div className="border border-[#1f1f1f] rounded-lg bg-[#0a0a0a] p-8 text-center">
        <p className="text-[#666] text-sm">Time tracking is disabled for this workspace.</p>
      </div>
    );
  }

  return (
    <TaskSessionsView 
      taskId={taskId} 
      onRefresh={onRefresh}
    />
  );
} 