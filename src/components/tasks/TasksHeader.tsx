"use client";

import { useState, useEffect, useRef } from "react";
import { Kanban, List, Plus, GitBranch, ChevronDown } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { urls } from "@/lib/url-resolver";
import { BoardFollowButton } from "@/components/boards/BoardFollowButton";
import { useInvalidateBoardFollowQueries } from "@/hooks/queries/useBoardFollow";
import { useRealtimeWorkspaceEvents } from "@/hooks/useRealtimeWorkspaceEvents";

export default function TasksHeader() {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = useState(false);
  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [isStoryDialogOpen, setIsStoryDialogOpen] = useState(false);
  const { selectedBoardId, view, selectedBoard } = useTasks();
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const invalidateBoardFollowQueries = useInvalidateBoardFollowQueries();
  const previousBoardIdRef = useRef<string | null>(null);
  // Keep header-related data fresh when boards update elsewhere
  useRealtimeWorkspaceEvents({ workspaceId: currentWorkspace?.id, boardId: selectedBoardId });

  // Fetch task boards for the current workspace
  const { data: taskBoards } = useTaskBoards({
    workspaceId: currentWorkspace?.id,
    includeStats: true
  });

  // Handle board switching - invalidate previous board's follow queries
  useEffect(() => {
    if (selectedBoardId && previousBoardIdRef.current && selectedBoardId !== previousBoardIdRef.current) {
      // Invalidate the previous board's follow queries
      invalidateBoardFollowQueries(previousBoardIdRef.current);
    }
    previousBoardIdRef.current = selectedBoardId;
  }, [selectedBoardId, invalidateBoardFollowQueries]);

  const handleCreateTaskOpen = () => {
    setIsCreateTaskOpen(true);
  };

  const handleCreateTaskClose = () => {
    setIsCreateTaskOpen(false);
  };

  const handleViewChange = (newView: 'kanban' | 'list' | 'hierarchy') => {
    // Use URL resolver to generate the URL with the current board and new view
    if (currentWorkspace?.slug && selectedBoard?.slug) {
      const url = urls.board({
        workspaceSlug: currentWorkspace.slug,
        boardSlug: selectedBoard.slug,
        view: newView
      });
      router.push(url, { scroll: false });
    } else {
      // Fallback to manual URL construction for backward compatibility
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', newView);

      if (selectedBoardId) {
        params.set('board', selectedBoardId);
      }

      const url = `${pathname}?${params.toString()}`;
      router.push(url, { scroll: false });
    }
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

          <div className="hidden md:flex items-center bg-muted/40 p-1 rounded-lg border shadow-sm">
            <ViewButton
              icon={<Kanban size={16} />}
              label="Kanban"
              isActive={view === 'kanban'}
              onClick={() => handleViewChange('kanban')}
            />
            <ViewButton
              icon={<List size={16} />}
              label="List"
              isActive={view === 'list'}
              onClick={() => handleViewChange('list')}
            />
            <ViewButton
              icon={<GitBranch size={16} />}
              label="Hierarchy"
              isActive={view === 'hierarchy'}
              onClick={() => handleViewChange('hierarchy')}
            />
          </div>
        </div>

        {/* Board Follow Button - only show when a board is selected */}
        {selectedBoardId && (
          <div className="flex items-center">
            <BoardFollowButton
              boardId={selectedBoardId}
              showFollowerCount={false}
            />
          </div>
        )}
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
          boardId={selectedBoardId}
        />
      )}

      {isEpicDialogOpen && (
        <CreateEpicDialog
          open={isEpicDialogOpen}
          onOpenChange={handleOpenChange(setIsEpicDialogOpen)}
          onSuccess={() => setIsEpicDialogOpen(false)}
          workspaceId={currentWorkspace?.id || ''}
          boardId={selectedBoardId}
        />
      )}

      {isStoryDialogOpen && (
        <CreateStoryDialog
          open={isStoryDialogOpen}
          onOpenChange={handleOpenChange(setIsStoryDialogOpen)}
          onSuccess={() => setIsStoryDialogOpen(false)}
          workspaceId={currentWorkspace?.id || ''}
          boardId={selectedBoardId}
        />
      )}
    </>
  );
}

interface ViewButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function ViewButton({ icon, label, isActive, onClick }: ViewButtonProps) {
  return (
    <button
      className={cn(
        "relative flex items-center gap-2 px-3 py-2 rounded-md transition-all font-medium text-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
    >
      {isActive && (
        <motion.div
          layoutId="activeViewTab"
          className="absolute inset-0 bg-primary rounded-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
      <span className="relative flex items-center gap-2 z-10">
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </span>
    </button>
  );
} 