"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { TaskDetailContent, Task } from "@/components/tasks/TaskDetailContent";

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
}

export default function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  
  // For tracking when to refresh task details 
  const [shouldRefresh, setShouldRefresh] = useState<boolean>(false);

  const fetchTaskDetails = useCallback(async () => {
    if (!taskId) return;
    
    setError(null);
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("Task fetch error:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        
        if (response.status === 403) {
          throw new Error("You don't have access to this task. You may need to switch to the correct workspace.");
        } else if (response.status === 404) {
          throw new Error("Task not found.");
        } else {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      setTask(data);
      // Only open modal after data is successfully loaded
      setIsOpen(true);
    } catch (err) {
      console.error("Failed to fetch task details:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to load task details. Please try again.";
      setError(errorMessage);
    } finally {
      setShouldRefresh(false);
    }
  }, [taskId]);

  // Initial fetch and when taskId changes
  useEffect(() => {
    if (taskId) {
      fetchTaskDetails();
    } else {
      setIsOpen(false);
    }
  }, [fetchTaskDetails, taskId]);
  
  // Listen for task updates
  useEffect(() => {
    if (shouldRefresh) {
      fetchTaskDetails();
    }
  }, [shouldRefresh, fetchTaskDetails]);
  
  // Function to refresh task details
  const refreshTaskDetails = () => {
    setShouldRefresh(true);
  };

  if (!taskId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle className="sr-only">Task Details</DialogTitle>
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/tasks/${taskId}`} target="_blank" className="flex items-center gap-1">
                <ExternalLink className="h-4 w-4" />
                <span>View Full</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <TaskDetailContent
            task={task}
            error={error}
            onRefresh={refreshTaskDetails}
            onClose={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 