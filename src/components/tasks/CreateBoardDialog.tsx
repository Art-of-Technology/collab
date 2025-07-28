"use client";

import { useState } from "react";
import { Loader2, FolderOpen, X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { useCreateBoard, boardKeys } from "@/hooks/queries/useTask";
import { useTasks } from "@/context/TasksContext";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/hooks/queries/useProject";
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
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface CreateBoardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialProjectIds?: string[];
}

export default function CreateBoardDialog({
  isOpen,
  onClose,
  onSuccess,
  initialProjectIds = [],
}: CreateBoardDialogProps) {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const { refreshBoards, selectBoard } = useTasks();
  const queryClient = useQueryClient();
  const { data: projects } = useProjects(currentWorkspace?.id || '');
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    issuePrefix: "",
    selectedProjects: initialProjectIds,
  });
  
  // Use the mutation hook
  const createBoardMutation = useCreateBoard();

  // Helper functions for project selection
  const handleAddProject = (projectId: string) => {
    if (!formData.selectedProjects.includes(projectId)) {
      setFormData(prev => ({
        ...prev,
        selectedProjects: [...prev.selectedProjects, projectId]
      }));
    }
  };

  const handleRemoveProject = (projectId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedProjects: prev.selectedProjects.filter(id => id !== projectId)
    }));
  };

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
        issuePrefix: formData.issuePrefix,
        projectIds: formData.selectedProjects,
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
        selectedProjects: initialProjectIds,
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

          <div className="space-y-2">
            <Label>Projects (Optional)</Label>
            <Select onValueChange={handleAddProject}>
              <SelectTrigger>
                <SelectValue placeholder="Add projects to this board..." />
              </SelectTrigger>
              <SelectContent>
                {projects?.filter(project => !formData.selectedProjects.includes(project.id)).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center">
                      <FolderOpen className="mr-2 h-4 w-4 text-blue-600" />
                      <span>{project.name}</span>
                    </div>
                  </SelectItem>
                ))}
                {projects?.filter(project => !formData.selectedProjects.includes(project.id)).length === 0 && (
                  <SelectItem value="no-projects" disabled>
                    {projects?.length === 0 ? "No projects available" : "All projects already selected"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            
            {formData.selectedProjects.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.selectedProjects.map((projectId) => {
                  const project = projects?.find(p => p.id === projectId);
                  return project ? (
                    <Badge key={projectId} variant="secondary" className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {project.name}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => handleRemoveProject(projectId)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              Select which projects this board will be associated with. You can add projects later.
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