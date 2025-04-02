"use client";

import { useCallback, useEffect, useState } from "react";
import { TaskCommentForm } from "@/components/tasks/TaskCommentForm";
import { useRouter } from "next/navigation";

interface TaskPageClientProps {
  taskId: string;
}

export default function TaskPageClient({ taskId }: TaskPageClientProps) {
  const router = useRouter();
  
  const handleCommentAdded = useCallback(() => {
    // Refresh the data without causing a full page reload
    router.refresh();
  }, [router]);
  
  return (
    <TaskCommentForm 
      taskId={taskId} 
      onCommentAdded={handleCommentAdded}
    />
  );
} 