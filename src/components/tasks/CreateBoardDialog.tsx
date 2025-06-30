"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { useCreateBoard, boardKeys } from "@/hooks/queries/useTask";
import { useTasks } from "@/context/TasksContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CreateBoardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateBoardDialog({
  isOpen,
  onClose,
  onSuccess,
}: CreateBoardDialogProps) {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const { refreshBoards, selectBoard } = useTasks();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    issuePrefix: "",
  });
  
  // Use the mutation hook
  const createBoardMutation = useCreateBoard();

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Board name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.issuePrefix.trim()) {
      toast({
        title: "Error",
        description: "Issue prefix is required",
        variant: "destructive",
      });
      return;
    }

    if (!currentWorkspace) {
      toast({
        title: "Error",
        description: "No workspace selected",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createBoardMutation.mutateAsync({
        workspaceId: currentWorkspace.id,
        name: formData.name,
        description: formData.description || undefined,
        issuePrefix: formData.issuePrefix || undefined,
      });
      
      // Manually invalidate all board-related queries
      queryClient.invalidateQueries({ queryKey: boardKeys.all });
      queryClient.invalidateQueries({ queryKey: boardKeys.workspace(currentWorkspace.id) });
      queryClient.invalidateQueries({ queryKey: ["taskBoards"] });
      
      // Close dialog first
      onClose();
      
      // Reset form
      setFormData({
        name: "",
        description: "",
        issuePrefix: "",
      });
      
      // Show success toast
      toast({
        title: "Board created",
        description: "Your board has been created successfully"
      });
      
      // Add a small delay to ensure API caches are updated before refreshing
      setTimeout(async () => {
        try {
          // First refresh the boards list to ensure we have the updated list
          await refreshBoards();
          
          // Then explicitly select the new board to ensure it's active
          if (result?.id) {
            selectBoard(result.id);
          }
          
          // Finally call the success callback
          onSuccess();
        } catch (err) {
          console.error("Error refreshing after board creation:", err);
          // Still call onSuccess even if there's an error to prevent blocking the UI
          onSuccess();
          
          // Force a page reload after a delay if we had issues refreshing
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      }, 500);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create board",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Board</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Board Name</Label>
            <Input
              id="name"
              placeholder="Enter board name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter board description (optional)"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuePrefix">Issue Prefix *</Label>
            <Input
              id="issuePrefix"
              placeholder="e.g., PRJ, TASK"
              value={formData.issuePrefix}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  issuePrefix: e.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              This prefix will be used for task identification (e.g., PRJ-123)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createBoardMutation.isPending}>
            {createBoardMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Board"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 