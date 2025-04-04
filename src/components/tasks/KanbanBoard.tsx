"use client";

import { useState } from "react";
import KanbanView from "@/components/tasks/KanbanView";
import BoardSettings from "@/components/tasks/BoardSettings";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/context/TasksContext";
import { Button } from "@/components/ui/button";
import { Cog, Lock } from "lucide-react";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function KanbanBoard() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { toast } = useToast();
  const { selectedBoard, refreshBoards } = useTasks();
  const { canManageBoard, isLoading: permissionsLoading } = useWorkspacePermissions();

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
      const response = await fetch(`/api/tasks/boards/${selectedBoard.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update board");
      }

      toast({
        title: "Board updated",
        description: "Board settings have been updated successfully",
      });
      
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
      <div className="flex justify-between items-center">
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
          >
            <Cog className="h-4 w-4 mr-1" />
            Settings
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