"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { ProjectHierarchyTabs } from "@/components/tasks/ProjectHierarchyTabs";
import { CreateMilestoneDialog } from "@/components/milestones/CreateMilestoneDialog";
import { CreateEpicDialog } from "@/components/epics/CreateEpicDialog";
import { CreateStoryDialog } from "@/components/stories/CreateStoryDialog";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTasks } from "@/context/TasksContext";

export function ProjectHierarchyView() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  
  // Dialogs state
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = useState(false);
  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [isStoryDialogOpen, setIsStoryDialogOpen] = useState(false);
  
  // Get data from context instead of individual queries
  const { 
    milestones,
    epics,
    stories,
    refreshHierarchy,
    isHierarchyLoading,
    boards: taskBoards,
    isLoading: isTaskBoardsLoading,
    selectedBoardId
  } = useTasks();
  
  // Event handlers
  const handleMilestoneCreated = () => {
    toast.success("Milestone created");
    refreshHierarchy();
    setIsMilestoneDialogOpen(false);
  };
  
  const handleEpicCreated = () => {
    toast.success("Epic created");
    refreshHierarchy();
    setIsEpicDialogOpen(false);
  };
  
  const handleStoryCreated = () => {
    toast.success("Story created");
    refreshHierarchy();
    setIsStoryDialogOpen(false);
  };
  
  const isLoading = isHierarchyLoading || isTaskBoardsLoading;
  
  if (!workspaceId) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectHierarchyTabs
        milestones={milestones}
        epics={epics}
        stories={stories}
        onCreateMilestone={() => setIsMilestoneDialogOpen(true)}
        onCreateEpic={() => setIsEpicDialogOpen(true)}
        onCreateStory={() => setIsStoryDialogOpen(true)}
      />
      
      {/* Create dialogs */}
      {isMilestoneDialogOpen && (
        <CreateMilestoneDialog
          open={isMilestoneDialogOpen}
          onOpenChange={setIsMilestoneDialogOpen}
          onSuccess={handleMilestoneCreated}
          workspaceId={workspaceId}
          taskBoards={taskBoards || []}
          boardId={selectedBoardId}
        />
      )}
      
      {isEpicDialogOpen && (
        <CreateEpicDialog
          open={isEpicDialogOpen}
          onOpenChange={setIsEpicDialogOpen}
          onSuccess={handleEpicCreated}
          workspaceId={workspaceId}
          boardId={selectedBoardId}
        />
      )}
      
      {isStoryDialogOpen && (
        <CreateStoryDialog
          open={isStoryDialogOpen}
          onOpenChange={setIsStoryDialogOpen}
          onSuccess={handleStoryCreated}
          workspaceId={workspaceId}
          boardId={selectedBoardId}
        />
      )}
    </div>
  );
} 