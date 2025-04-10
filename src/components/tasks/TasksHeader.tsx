"use client";

import { useState } from "react";
import { Kanban, List, Plus, GitBranch, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskBoardSelector from "@/components/tasks/TaskBoardSelector";
import CreateTaskForm from "@/components/tasks/CreateTaskForm";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { CreateMilestoneDialog } from "@/components/milestones/CreateMilestoneDialog";
import { CreateEpicDialog } from "@/components/epics/CreateEpicDialog";
import { CreateStoryDialog } from "@/components/stories/CreateStoryDialog";
import { useTaskBoards } from "@/hooks/queries/useTaskBoard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TasksHeader() {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = useState(false);
  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [isStoryDialogOpen, setIsStoryDialogOpen] = useState(false);
  const { selectedBoardId, view, setView } = useTasks();
  const { currentWorkspace } = useWorkspace();

  // Fetch task boards for the current workspace
  const { data: taskBoards } = useTaskBoards({
    workspaceId: currentWorkspace?.id,
    includeStats: true
  });

  const handleCreateTaskOpen = () => {
    setIsCreateTaskOpen(true);
  };

  const handleCreateTaskClose = () => {
    setIsCreateTaskOpen(false);
  };

  const handleViewChange = (newView: 'kanban' | 'list' | 'hierarchy') => {
    setView(newView);
  };

  const handleCreateMilestone = () => {
    setIsMilestoneDialogOpen(true);
  };

  const handleCreateEpic = () => {
    setIsEpicDialogOpen(true);
  };

  const handleCreateStory = () => {
    setIsStoryDialogOpen(true);
  };

  const handleOpenChange = (dialogStateSetter: React.Dispatch<React.SetStateAction<boolean>>) =>
    (isOpen: boolean) => {
      dialogStateSetter(isOpen);
    };

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">
            Manage and track your team&apos;s tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" className="gap-1">
                <Plus size={16} />
                Create
                <ChevronDown size={14} className="ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCreateTaskOpen}>
                Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateMilestone}>
                Milestone
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateEpic}>
                Epic
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateStory}>
                Story
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <TaskBoardSelector />
          <div className="hidden md:flex">
            <Button
              variant="ghost"
              className={`px-3 py-1.5 rounded-l-md border border-r-0 ${view === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
                }`}
              onClick={() => handleViewChange('kanban')}
            >
              <Kanban size={16} />
            </Button>
            <Button
              variant="ghost"
              className={`px-3 py-1.5 border border-r-0 ${view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
                }`}
              onClick={() => handleViewChange('list')}
            >
              <List size={16} />
            </Button>
            <Button
              variant="ghost"
              className={`px-3 py-1.5 rounded-r-md border ${view === "hierarchy"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
                }`}
              onClick={() => handleViewChange('hierarchy')}
            >
              <GitBranch size={16} />
            </Button>
          </div>
        </div>
      </div>

      <CreateTaskForm
        key={`task-form-${selectedBoardId}`}
        isOpen={isCreateTaskOpen}
        onClose={handleCreateTaskClose}
        initialData={{ taskBoardId: selectedBoardId }}
      />

      {isMilestoneDialogOpen && (
        <CreateMilestoneDialog
          open={isMilestoneDialogOpen}
          onOpenChange={handleOpenChange(setIsMilestoneDialogOpen)}
          onSuccess={() => setIsMilestoneDialogOpen(false)}
          workspaceId={currentWorkspace?.id || ''}
          taskBoards={taskBoards || []}
        />
      )}

      {isEpicDialogOpen && (
        <CreateEpicDialog
          open={isEpicDialogOpen}
          onOpenChange={handleOpenChange(setIsEpicDialogOpen)}
          onSuccess={() => setIsEpicDialogOpen(false)}
          workspaceId={currentWorkspace?.id || ''}
        />
      )}

      {isStoryDialogOpen && (
        <CreateStoryDialog
          open={isStoryDialogOpen}
          onOpenChange={handleOpenChange(setIsStoryDialogOpen)}
          onSuccess={() => setIsStoryDialogOpen(false)}
          workspaceId={currentWorkspace?.id || ''}
        />
      )}
    </>
  );
} 