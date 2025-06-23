"use client";

import BoardItemActivityHistory from "@/components/activity/BoardItemActivityHistory";

interface TaskActivityProps {
  taskId: string;
}

export function TaskActivity({ taskId }: TaskActivityProps) {
  return (
    <BoardItemActivityHistory 
      itemType="TASK" 
      itemId={taskId} 
      limit={50}
      className="overflow-hidden border-border/50 transition-all hover:shadow-md"
    />
  );
} 