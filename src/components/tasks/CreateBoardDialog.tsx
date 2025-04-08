"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { useCreateBoard } from "@/hooks/queries/useTask";
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

    if (!currentWorkspace) {
      toast({
        title: "Error",
        description: "No workspace selected",
        variant: "destructive",
      });
      return;
    }

    try {
      await createBoardMutation.mutateAsync({
        workspaceId: currentWorkspace.id,
        name: formData.name,
        description: formData.description || undefined,
        issuePrefix: formData.issuePrefix || undefined,
      });
      
      toast({
        title: "Board created",
        description: "Your board has been created successfully",
      });

      // Reset form
      setFormData({
        name: "",
        description: "",
        issuePrefix: "",
      });
      
      // Close dialog and refresh boards
      onClose();
      onSuccess();
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
            <Label htmlFor="issuePrefix">Issue Prefix</Label>
            <Input
              id="issuePrefix"
              placeholder="e.g., PRJ, TASK (optional)"
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