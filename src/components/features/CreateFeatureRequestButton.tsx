"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useCreateFeatureRequest } from "@/hooks/queries/useFeature";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichEditor } from "@/components/RichEditor";
import { extractMentionUserIds } from "@/utils/mentions";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProjects } from "@/hooks/queries/useProjects";
import axios from "axios";

interface CreateFeatureRequestButtonProps {
  projectId?: string;
  projectName?: string;
}

export default function CreateFeatureRequestButton({ 
  projectId: defaultProjectId,
  projectName 
}: CreateFeatureRequestButtonProps = {}) {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { data: projects = [] } = useProjects({ workspaceId: currentWorkspace?.id });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || "");
  
  const createFeature = useCreateFeatureRequest();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !description.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("html", description);
    
    // Add project ID (either from prop or selected)
    const projectToUse = defaultProjectId || selectedProjectId;
    if (projectToUse) {
      formData.append("projectId", projectToUse);
    }
    
    // Add workspace ID
    if (currentWorkspace?.id) {
      formData.append("workspaceId", currentWorkspace.id);
    }
    
    try {
      createFeature.mutate(formData, {
        onSuccess: async (createdFeature) => {
          // Process mentions if the feature was created successfully
          if (createdFeature?.id) {
            // Extract user IDs from mentions in the description
            const mentionedUserIds = extractMentionUserIds(description);
            
            // Create notifications for mentioned users (if any found)
            if (mentionedUserIds.length > 0) {
              try {
                await axios.post("/api/mentions", {
                  userIds: mentionedUserIds,
                  sourceType: "feature",
                  sourceId: createdFeature.id,
                  content: `mentioned you in a feature request: "${title.length > 100 ? title.substring(0, 97) + '...' : title}"`
                });
              } catch (error) {
                console.error("Failed to process mentions:", error);
                // Don't fail the feature request creation if mentions fail
              }
            }
          }

          toast({
            title: "Feature request submitted",
            description: "Your feature request has been submitted successfully",
          });
          setTitle("");
          setDescription("");
          if (!defaultProjectId) {
            setSelectedProjectId("");
          }
          setOpen(false);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to submit your feature request",
            variant: "destructive",
          });
        }
      });
    } catch (error) {
      console.error("Error submitting feature request:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-6 px-1 md:px-4 text-xs bg-blue-500 hover:bg-blue-600 text-white border-0 rounded-md transition-all duration-200 flex items-center justify-center">
          <Plus className="h-3 w-3 md:mr-2" />
          <span data-text className="hidden md:inline ml-1">New Feature Request</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Feature Request</DialogTitle>
            <DialogDescription>
              Suggest a new feature or improvement. Be descriptive so others understand your idea.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Show project selector at workspace level (when no default project) */}
            {!defaultProjectId && projects && projects.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="project">Project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          {project.color && (
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: project.color }}
                            />
                          )}
                          {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Show project name badge when at project level */}
            {defaultProjectId && projectName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Project:</span>
                <span className="font-medium text-foreground">{projectName}</span>
              </div>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief title for your feature idea"
                className="col-span-3"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <RichEditor
                value={description}
                onChange={(html, text) => setDescription(html)}
                placeholder="Describe your feature idea in detail. What problem does it solve? How should it work?"
                minHeight="180px"
                toolbarMode="static"
                showAiImprove={true}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              disabled={createFeature.isPending}
              className="w-full sm:w-auto"
            >
              {createFeature.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Feature Request"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 