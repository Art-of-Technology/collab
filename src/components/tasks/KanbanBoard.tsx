"use client";

import { useState } from "react";
import KanbanView from "@/components/tasks/KanbanView";
import BoardSettings from "@/components/tasks/BoardSettings";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/context/TasksContext";
import { Button } from "@/components/ui/button";
import { Cog } from "lucide-react";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import { useUpdateBoard } from "@/hooks/queries/useTask";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRealtimeWorkspaceEvents } from "@/hooks/useRealtimeWorkspaceEvents";

export default function KanbanBoard() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { toast } = useToast();
  const { selectedBoard, refreshBoards } = useTasks();
  const { canManageBoard, isLoading: permissionsLoading } = useWorkspacePermissions();
  const { currentWorkspace } = useWorkspace();
  
  // Use the update board mutation hook if we have a board selected
  const updateBoardMutation = useUpdateBoard(selectedBoard?.id || '');

  // Realtime: subscribe to workspace events to invalidate queries on updates
  useRealtimeWorkspaceEvents({
    workspaceId: currentWorkspace?.id,
    boardId: selectedBoard?.id,
  });

  if (!selectedBoard) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium">No board selected</h3>
          <p className="text-muted-foreground">
            Please select a board to view tasks
          </p>
        </div>
      </div>
    );
  }

  // Handle board settings update
  const handleBoardSettingsSubmit = async (data: {
    name: string;
    description?: string;
    issuePrefix?: string;
  }) => {
    try {
      await updateBoardMutation.mutateAsync(data);
      
      toast({
        title: "Board updated",
        description: "Board settings have been updated successfully",
      });
      
      // Refresh boards to update UI
      refreshBoards();
    } catch (error) {
      console.error("Error updating board:", error);
      toast({
        title: "Error",
        description: "Failed to update board settings",
        variant: "destructive",
      });
    } finally {
      setIsSettingsOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center w-full sticky top-0 pt-4 z-40 bg-[#191919] backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-semibold">{selectedBoard.name}</h2>
          {selectedBoard.description && (
            <p className="text-muted-foreground">{selectedBoard.description}</p>
          )}
        </div>

        {permissionsLoading ? (
          <Button variant="outline" size="sm" disabled>
            <Cog className="h-4 w-4 mr-1 animate-spin" />
            Loading...
          </Button>
        ) : canManageBoard && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
            disabled={updateBoardMutation.isPending}
          >
            <Cog className="h-4 w-4 mr-1" />
            {updateBoardMutation.isPending ? "Updating..." : "Settings"}
          </Button>
        )}
      </div>

      <KanbanView />

      {canManageBoard && (
        <BoardSettings
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          board={selectedBoard}
          onSubmit={handleBoardSettingsSubmit}
        />
      )}
    </div>
  );
} 