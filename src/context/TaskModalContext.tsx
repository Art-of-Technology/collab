"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamically import the TaskDetailModal to avoid issues with server-only modules
const TaskDetailModal = dynamic(() => import("@/components/tasks/TaskDetailModal"), {
  ssr: false,
});

interface TaskModalContextType {
  openTaskModal: (taskId: string) => void;
  closeTaskModal: () => void;
  currentTaskId: string | null;
}

const TaskModalContext = createContext<TaskModalContextType | undefined>(undefined);

export function TaskModalProvider({ children }: { children: React.ReactNode }) {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize from URL if task is in the query params
  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (taskId) {
      setCurrentTaskId(taskId);
    }
  }, [searchParams]);

  const openTaskModal = (taskId: string) => {
    setCurrentTaskId(taskId);
    
    // Update URL with query param but don't navigate
    const params = new URLSearchParams(searchParams.toString());
    params.set("taskId", taskId);
    
    // Update the URL with the new search parameters
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeTaskModal = () => {
    setCurrentTaskId(null);
    
    // Remove taskId from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete("taskId");
    
    // If there are other params, keep them, otherwise just use the pathname
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(newUrl, { scroll: false });
  };

  return (
    <TaskModalContext.Provider value={{ openTaskModal, closeTaskModal, currentTaskId }}>
      {children}
      {currentTaskId && <TaskDetailModal taskId={currentTaskId} onClose={closeTaskModal} />}
    </TaskModalContext.Provider>
  );
}

export function useTaskModal() {
  const context = useContext(TaskModalContext);
  if (context === undefined) {
    throw new Error("useTaskModal must be used within a TaskModalProvider");
  }
  return context;
} 