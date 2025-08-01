"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { TaskDetailContent } from "@/components/tasks/TaskDetailContent";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTaskById } from "@/hooks/queries/useTask";
import { resolveIdToIssueKey } from "@/lib/client-issue-key-resolvers";

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
}

export default function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [taskIssueKey, setTaskIssueKey] = useState<string | null>(null);

  // Get current board ID from TasksContext
  const { selectedBoardId } = useTasks();
  const { currentWorkspace } = useWorkspace();

  // Use TanStack Query to fetch task data
  const { data: task, error, isError, refetch } = useTaskById(taskId || "");

  // Open modal when taskId is provided
  useEffect(() => {
    if (taskId) {
      setIsOpen(true);
      // Resolve task ID to issue key for the View Full URL
      resolveIdToIssueKey(taskId, "task").then((issueKey) => {
        setTaskIssueKey(issueKey);
      });
    } else {
      setIsOpen(false);
      setTaskIssueKey(null);
    }
  }, [taskId]);

  // Function to refresh task details
  const refreshTaskDetails = () => {
    refetch();
  };

  if (!taskId) return null;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsOpen(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2 flex-shrink-0">
          <DialogTitle className="sr-only">Task Details</DialogTitle>
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link
                href={
                  currentWorkspace?.slug && taskIssueKey
                    ? `/${currentWorkspace.slug}/tasks/${taskIssueKey}`
                    : currentWorkspace
                    ? `/${currentWorkspace.id}/tasks/${taskId}`
                    : "#"
                }
                target="_blank"
                className="flex items-center gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View Full</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2 min-h-0">
          <TaskDetailContent
            task={(task as any) || null}
            error={isError && error ? error.message : null}
            onRefresh={refreshTaskDetails}
            onClose={onClose}
            boardId={task?.taskBoardId || selectedBoardId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
